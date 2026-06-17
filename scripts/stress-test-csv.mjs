#!/usr/bin/env node
/**
 * stress-test-csv.mjs
 *
 * Stress-test the research agent using customer names from a CSV file.
 * Reads customer_names.csv (or a custom CSV via --csv), then processes
 * companies through a worker-queue (always keeps N workers busy) with
 * exponential-backoff retry on throttling errors.
 *
 * Usage:
 *   node scripts/stress-test-csv.mjs
 *   node scripts/stress-test-csv.mjs --csv ./customer_names.csv --concurrency 8 --limit 50
 *   node scripts/stress-test-csv.mjs --csv ./customer_names.csv --concurrency 10 --output ./output/stress
 *   node scripts/stress-test-csv.mjs --start 0 --limit 20 --dry-run
 *
 * Options:
 *   --csv <path>         Path to CSV file with a "customer_name" column (default: ./customer_names.csv)
 *   --concurrency <n>    Number of companies to process in parallel (default: 6)
 *   --limit <n>          Max number of customers to process (default: all)
 *   --start <n>          Zero-based index of first customer to process (default: 0)
 *   --output <dir>       Output directory (default: ./output/stress-test)
 *   --model <id>         Bedrock model ID (default: amazon.nova-premier-v1:0)
 *   --runs <n>           Number of research runs per task (default: 1 for speed)
 *   --retries <n>        Max retries per company on throttle/timeout (default: 3)
 *   --industry <str>     Industry hint passed to the agent
 *   --dry-run            Print customer names that would be processed, then exit
 */

import { createReadStream } from 'node:fs';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { args[key] = true; continue; }
    args[key] = next; i++;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const csvPath     = resolve(args['csv']         || './customer_names.csv');
const concurrency = Math.max(1, parseInt(args['concurrency'] || '6', 10));
const limit       = args['limit']    ? parseInt(args['limit'],   10) : Infinity;
const start       = args['start']    ? parseInt(args['start'],   10) : 0;
const outputDir   = resolve(args['output']      || './output/stress-test');
const modelId     = args['model']    || process.env.BEDROCK_RESEARCH_MODEL_ID || 'amazon.nova-premier-v1:0';
const numRuns     = Math.max(1, parseInt(args['runs']    || '1', 10));
const maxRetries  = Math.max(0, parseInt(args['retries'] || '3', 10));
const industry    = args['industry'] || '';
const dryRun      = !!args['dry-run'];

// ── CSV reader ────────────────────────────────────────────────────────────────

async function readCustomerNames(filePath) {
  const names = [];
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let headerIndex = -1;
  let isFirst = true;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const cols = trimmed.split(',').map(c => c.replace(/^"|"$/g, '').trim());

    if (isFirst) {
      isFirst = false;
      // Find the customer_name column (case-insensitive)
      headerIndex = cols.findIndex(h =>
        h.toLowerCase().replace(/\s+/g, '_') === 'customer_name' ||
        h.toLowerCase() === 'name' ||
        h.toLowerCase() === 'company'
      );
      if (headerIndex === -1) {
        // No header found — assume first column is the name, treat this row as data
        headerIndex = 0;
        if (cols[0]) names.push(cols[0]);
      }
      continue;
    }

    const name = cols[headerIndex];
    if (name) names.push(name);
  }

  return names;
}

// ── Research runner (delegates to langgraph-5cat-research.mjs) ───────────────

const agentScript = resolve(new URL(import.meta.url).pathname, '../langgraph-5cat-research.mjs');

const THROTTLE_SIGNALS = ['ThrottlingException', 'TooManyRequestsException', 'ServiceUnavailable', 'ETIMEDOUT', 'ESOCKETTIMEDOUT'];

function isThrottleError(stderr = '', errMsg = '') {
  const haystack = stderr + errMsg;
  return THROTTLE_SIGNALS.some(sig => haystack.includes(sig));
}

/**
 * Run the research agent for one company asynchronously (non-blocking),
 * with exponential-backoff retry on throttle/timeout errors.
 */
function spawnAsync(execPath, args, timeoutMs) {
  return new Promise((resolve) => {
    const chunks = { stdout: [], stderr: [] };
    const proc = spawn(execPath, args, { timeout: timeoutMs });
    proc.stdout.on('data', d => chunks.stdout.push(d));
    proc.stderr.on('data', d => chunks.stderr.push(d));
    proc.on('close', (code, signal) => {
      resolve({
        status: code,
        stdout: Buffer.concat(chunks.stdout).toString('utf8'),
        stderr: Buffer.concat(chunks.stderr).toString('utf8'),
        error: signal ? new Error(`killed by signal ${signal}`) : (code === null ? new Error('timeout') : null),
      });
    });
    proc.on('error', (err) => {
      resolve({ status: null, stdout: '', stderr: '', error: err });
    });
  });
}

async function runWithRetry(company, companyOutputDir) {
  const companyArgs = [
    agentScript,
    '--companies', company,
    '--output', companyOutputDir,
    '--model', modelId,
    '--runs', String(numRuns),
  ];
  if (industry) companyArgs.push('--industry', industry);

  let attempt = 0;
  while (true) {
    const t0 = Date.now();
    const result = await spawnAsync(process.execPath, companyArgs, 5 * 60 * 1000);
    const durationMs = Date.now() - t0;
    const success = result.status === 0 && !result.error;
    const errMsg  = result.error?.message || '';

    if (success) {
      return { company, success: true, durationMs, attempt, error: null };
    }

    const throttled = isThrottleError(result.stderr || '', errMsg);

    if (attempt < maxRetries && throttled) {
      // Exponential backoff: 4s, 8s, 16s …
      const backoffMs = 4000 * Math.pow(2, attempt);
      process.stdout.write(`   ⏳ [retry ${attempt + 1}/${maxRetries}] throttled — waiting ${backoffMs / 1000}s for "${company.slice(0, 30)}"…\n`);
      await sleep(backoffMs);
      attempt++;
      continue;
    }

    return {
      company,
      success: false,
      durationMs,
      attempt,
      error: errMsg || `exit ${result.status}`,
      throttled,
    };
  }
}

// ── Worker queue ──────────────────────────────────────────────────────────────

/**
 * Process `items` through `worker` with at most `concurrency` items running
 * simultaneously. Workers are kept continuously busy — no idle time between
 * items, unlike fixed-batch Promise.all.
 *
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} worker
 * @param {number} concurrency
 * @returns {Promise<R[]>}  results in original order
 */
async function queue(items, worker, maxConcurrency) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await worker(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(maxConcurrency, items.length) }, runWorker);
  await Promise.all(workers);
  return results;
}

// ── Progress tracker ──────────────────────────────────────────────────────────

function makeProgress(total) {
  let done = 0;
  return {
    tick(company, res) {
      done++;
      const icon = res.success ? '✅' : '❌';
      const dur  = (res.durationMs / 1000).toFixed(1);
      const retry = res.attempt > 0 ? ` (retried×${res.attempt})` : '';
      console.log(`   ${icon} [${done}/${total}] ${company.slice(0, 48).padEnd(48)} ${dur}s${retry}`);
    },
  };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📂 Reading customer names from:', csvPath);
  const allNames = await readCustomerNames(csvPath);

  const slice = allNames.slice(start, start + limit);

  console.log(`\n📊 Stress Test Configuration`);
  console.log(`   CSV file    : ${basename(csvPath)}`);
  console.log(`   Total names : ${allNames.length}`);
  console.log(`   Processing  : ${slice.length} (start=${start}, limit=${limit === Infinity ? 'all' : limit})`);
  console.log(`   Concurrency : ${concurrency} workers (queue)`);
  console.log(`   Max retries : ${maxRetries} (throttle backoff: 4s → 8s → 16s)`);
  console.log(`   Output dir  : ${outputDir}`);
  console.log(`   Model       : ${modelId}`);
  console.log(`   Runs/task   : ${numRuns}`);

  if (dryRun) {
    console.log('\n🧪 Dry run — companies that would be processed:');
    slice.forEach((c, i) => console.log(`   ${start + i + 1}. ${c}`));
    return;
  }

  await mkdir(outputDir, { recursive: true });
  const logFile = resolve(outputDir, 'stress-test-results.ndjson');
  await writeFile(logFile, '', 'utf8'); // reset log

  const progress = makeProgress(slice.length);
  const globalStart = Date.now();

  console.log(`\n🚀 Starting queue with ${concurrency} parallel workers…\n`);

  const allResults = await queue(slice, async (company) => {
    const safeDir = company.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60);
    const companyOutputDir = resolve(outputDir, safeDir);
    await mkdir(companyOutputDir, { recursive: true });

    const res = await runWithRetry(company, companyOutputDir);
    progress.tick(company, res);

    // Append result to NDJSON log immediately (don't wait for all to finish)
    await appendFile(logFile, JSON.stringify({
      company: res.company,
      success: res.success,
      durationMs: res.durationMs,
      attempt: res.attempt,
      throttled: res.throttled ?? false,
      error: res.error,
      ts: new Date().toISOString(),
    }) + '\n', 'utf8');

    return res;
  }, concurrency);

  const totalMs   = Date.now() - globalStart;
  const succeeded = allResults.filter(r => r.success).length;
  const failed    = allResults.filter(r => !r.success).length;
  const throttled = allResults.filter(r => r.throttled).length;
  const avgMs     = allResults.reduce((s, r) => s + r.durationMs, 0) / allResults.length;

  const summary = {
    csvFile: csvPath,
    total: allResults.length,
    succeeded,
    failed,
    throttledErrors: throttled,
    totalDurationMs: totalMs,
    avgDurationPerCompanyMs: Math.round(avgMs),
    wallClockSpeedupVsBatch: `~${(allResults.length / (totalMs / avgMs)).toFixed(1)}x`,
    concurrency,
    maxRetries,
    model: modelId,
    runs: numRuns,
    ts: new Date().toISOString(),
    failures: allResults.filter(r => !r.success).map(r => ({
      company: r.company,
      error: r.error,
      throttled: r.throttled,
      attempt: r.attempt,
    })),
  };

  await writeFile(resolve(outputDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  console.log('\n' + '═'.repeat(62));
  console.log('📈 STRESS TEST COMPLETE');
  console.log('═'.repeat(62));
  console.log(`   Total companies  : ${allResults.length}`);
  console.log(`   ✅ Succeeded      : ${succeeded}`);
  console.log(`   ❌ Failed         : ${failed}`);
  console.log(`   🔁 Throttle hits  : ${throttled}`);
  console.log(`   ⏱  Total time    : ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`   ⚡ Avg/company   : ${(avgMs / 1000).toFixed(1)}s`);
  console.log(`   📁 Results       : ${outputDir}/`);
  console.log(`   📝 Log           : ${logFile}`);
  console.log('═'.repeat(62));

  if (failed > 0) {
    console.log('\n⚠️  Failed companies:');
    allResults.filter(r => !r.success).forEach(r =>
      console.log(`   • ${r.company}: ${r.error}`)
    );
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
