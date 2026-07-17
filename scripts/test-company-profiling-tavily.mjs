#!/usr/bin/env node
/**
 * test-company-profiling-tavily.mjs
 * Research and profile companies using the Tavily Search API instead of Nova
 * web grounding — a separate script (not a flag on test-company-profiling.mjs)
 * so switching search backends never requires touching the other script.
 *
 * Search/discovery: Tavily (/search + /extract endpoints)
 * Structured-data extraction: Bedrock Nova (non-grounded — same extraction
 *   step as test-company-profiling.mjs) so the benchmark isolates the search
 *   backend as the only variable between the two runs.
 *
 * Usage:
 *   node scripts/test-company-profiling-tavily.mjs
 *   node scripts/test-company-profiling-tavily.mjs --output ./output/my-run
 *
 * Output:
 *   output/company-profiling/company_profiles_tavily.json
 *   output/company-profiling/company_profiles_tavily.md
 */

import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

// ── Minimal .env.local loader (last value wins per key, like shell `source`) ──

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve('.env.local'), 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key) process.env[key] = val; // last occurrence wins, mirrors dotenv `source` behavior
    }
  } catch { /* no .env.local — rely on already-exported env vars */ }
}
loadEnvLocal();

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { args[key] = true; continue; }
    args[key] = next;
    i++;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const outputDir   = resolve(args.output || './output/company-profiling');
const rawModelId  = args.model || process.env.BEDROCK_RESEARCH_MODEL_ID || 'amazon.nova-premier-v1:0';
const modelId     = /^(us|eu|ap)\./.test(rawModelId) ? rawModelId : `us.${rawModelId}`;
const region      = args.region || process.env.AWS_REGION || 'us-east-1';
const httpsProxy  = args['https-proxy'] || process.env.HTTPS_PROXY || process.env.https_proxy;
const tavilyKey   = args['tavily-key'] || process.env.TAVILY_API_KEY;

if (!tavilyKey) {
  console.error('❌ TAVILY_API_KEY not found in .env.local or environment.');
  process.exit(1);
}

// Route both Tavily's fetch() calls and Bedrock's SDK calls through the corporate proxy.
if (httpsProxy) {
  setGlobalDispatcher(new ProxyAgent(httpsProxy));
}

// ── Company definitions — identical set/aliases used in test-company-profiling.mjs ──

const COMPANIES = [
  {
    name:     'Constructo Tripoloni (Tripoloni Construction)',
    location: 'Sao Paulo, Brazil',
    dealer:   'PESA',
    searchNames: ['Constructo Tripoloni', 'Tripoloni Construction', 'Tripoloni construtora'],
  },
  {
    name:     'CLC (Construtora Luiz Costa)',
    location: 'Juazeiro, Brazil',
    dealer:   'Sotreq',
    searchNames: ['Construtora Luiz Costa', 'CLC Construtora', 'CLC Juazeiro'],
  },
];

// ── Bedrock client (extraction step only — no grounding tool used here) ──────

const clientConfig = { region };
if (httpsProxy) {
  clientConfig.requestHandler = new NodeHttpHandler({
    connectionTimeout: 10000,
    requestTimeout: 60000,
    httpsAgent: new HttpsProxyAgent(httpsProxy),
  });
}
const client = new BedrockRuntimeClient(clientConfig);

console.log(`\n🏗️  Company Profiling Research — Tavily backend`);
console.log(`   Search  : Tavily Search API`);
console.log(`   Extract : ${modelId} (non-grounded)`);
console.log(`   Region  : ${region}`);
console.log(`   Output  : ${outputDir}\n`);

// ── Utilities ─────────────────────────────────────────────────────────────────

function stripThinking(text) {
  if (!text) return '';
  return text
    .replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<thinking[^>]*>[\s\S]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Relevance filtering — same logic/thresholds as test-company-profiling.mjs
// so the benchmark measures the search backend, not a different filter ──────

const DESIGNATOR_WORDS = new Set([
  'construtora', 'construtor', 'construcciones', 'constructora', 'construction',
  'ltda', 'ltd', 'llc', 'inc', 'corp', 'corporation', 'company', 'group', 'grupo',
  'sa', 'srl', 'gmbh', 'plc', 'ag', 'nv', 'bv', 'kg', 'spa', 'oy', 'ab', 'co',
]);

function buildAliasKeywordSets(company) {
  const STOP = new Set(['the', 'and', 'or', 'in', 'of', 'a', 'an', 'for', 'by', 'at',
                        'de', 'do', 'da', 'e', 'em', 'no', 'na',
                        'el', 'la', 'los', 'las', 'del', 'y',
                        'le', 'les', 'des', 'du', 'et']);
  return company.searchNames.map(n =>
    n.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOP.has(w))
  ).filter(set => set.length > 0);
}

function matchesCompanyAlias(haystack, aliasKeywordSets) {
  return aliasKeywordSets.some(kws => {
    const hits = kws.filter(kw => haystack.includes(kw));
    const required = Math.min(kws.length, 2);
    if (hits.length < required) return false;
    const designators = kws.filter(kw => DESIGNATOR_WORDS.has(kw));
    if (designators.length > 0 && !designators.some(d => hits.includes(d))) return false;
    return true;
  });
}

function filterRelevantResults(results, company) {
  const aliasKeywordSets = buildAliasKeywordSets(company);
  return results.filter(r => {
    const haystack = `${r.title} ${r.snippet} ${r.url}`.toLowerCase();
    return matchesCompanyAlias(haystack, aliasKeywordSets);
  });
}

const GENERIC_AGGREGATOR_DOMAINS = [
  'zoominfo.com', 'datanyze.com', 'kompass.com', 'dnb.com', 'craft.co',
  'rocketreach.co', 'owler.com', 'aeroleads.com', 'apollo.io', 'lusha.com',
  'crunchbase.com', 'signalhire.com', 'cybo.com', 'yellowpages',
];

function scoreUrl(url, company) {
  const u = url.toLowerCase();
  const aliasKeywordSets = buildAliasKeywordSets(company);
  const matchesAlias = (haystack) => matchesCompanyAlias(haystack, aliasKeywordSets);

  let score = 0;
  if (matchesAlias(u)) score += 10;
  const domainPart = u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  const distinctiveWords = aliasKeywordSets.flat().filter(w => w.length > 5);
  if (distinctiveWords.some(kw => domainPart.includes(kw))) score += 15;
  if (u.includes('linkedin.com/company')) score += 6;
  if (/\.gov(\.|\/|$)/.test(u) || u.includes('.gov.')) score += 5;
  if (/\b(news|noticia|jornal|imprensa|press)\b/.test(u)) score += 3;
  if (/\b(registry|registro|cnpj|company-number|companies-house|cadastr)\b/.test(u)) score += 3;
  if (GENERIC_AGGREGATOR_DOMAINS.some(d => domainPart.includes(d))) score -= 8;
  if (u.includes('parts.cat.com') || u.includes('careers.cat') || u.includes('mercadolivre') ||
      u.includes('wikipedia') || u.includes('reverso.net') || u.includes('scribd') ||
      u.includes('volvoce.com') || u.includes('researchgate')) score -= 10;
  return score;
}

function fullText(results) {
  const seen = new Set();
  return results
    .map(r => r.snippet || '')
    .filter(t => { if (!t || seen.has(t)) return false; seen.add(t); return true; })
    .join('\n\n');
}

function allUrls(results) {
  return [...new Set(results.map(r => r.url).filter(Boolean))];
}

// Minimal, non-prescriptive queries — identical strategy to test-company-profiling.mjs
function queries(company) {
  return company.searchNames.map(name => `${name} ${company.location}`);
}

// ── Tavily search/extract ────────────────────────────────────────────────────

async function tavilySearch(query, maxResults = 10) {
  process.stdout.write(`  → ${query.slice(0, 90)}… `);
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        search_depth: 'advanced',
        max_results: maxResults,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) { console.log(`✗ HTTP ${res.status}`); return []; }
    const data = await res.json();
    const results = (data.results || []).map(r => ({
      title: r.title || r.url,
      url: r.url,
      snippet: r.content || '',
    }));
    console.log(`✓ ${results.length} result(s)`);
    return results;
  } catch (err) {
    console.log(`✗ ${err.message?.slice(0, 60)}`);
    return [];
  }
}

// Tavily's /extract endpoint fetches full page content for a batch of URLs in one call.
async function tavilyExtract(urls) {
  if (urls.length === 0) return [];
  process.stdout.write(`  📖 Extracting ${urls.length} URL(s)… `);
  try {
    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: tavilyKey, urls, extract_depth: 'advanced' }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) { console.log(`✗ HTTP ${res.status}`); return []; }
    const data = await res.json();
    const results = (data.results || []).map(r => ({
      title: r.url,
      url: r.url,
      snippet: (r.raw_content || '').slice(0, 6000),
    })).filter(r => r.snippet.trim());
    console.log(`✓ ${results.length}/${urls.length} succeeded`);
    return results;
  } catch (err) {
    console.log(`✗ ${err.message?.slice(0, 60)}`);
    return [];
  }
}

// ── Bedrock Nova extraction (non-grounded) — identical to test-company-profiling.mjs ──

async function extractWithNova(company, dimension, researchText, sourceUrls) {
  if (!researchText.trim()) return null;

  const schemas = {
    industry: `{
  "INDUSTRY": "<primary industry/industries served, e.g. heavy civil construction, road building, earthmoving>",
  "USE_CASES": "<likely Caterpillar equipment use cases based on their work, e.g. earthmoving, paving, site prep. State 'Use case not specified publicly' if cannot infer>",
  "DESCRIPTION": "<2-4 sentence summary of what the company does>"
}`,
    projects: `[{
  "PROJECT_NAME": "<name or description>",
  "ROLE": "<contractor / partner / subcontractor / owner — if known>",
  "STATUS": "<past / current / announced>",
  "DESCRIPTION": "<brief description>",
  "SOURCE": "<url>"
}]`,
    people: `[{
  "NAME": "<person's full name>",
  "TITLE": "<title or role>",
  "SOURCE": "<url>"
}]`,
    fleet: `[{
  "MANUFACTURER": "<e.g. Caterpillar, Komatsu, Volvo, John Deere>",
  "MODEL": "<model number/name if known>",
  "MACHINE_TYPE": "<e.g. excavator, motor grader, dozer, wheel loader>",
  "QUANTITY": "<number of units if known>",
  "USAGE": "<what this machine is used for>",
  "SOURCE": "<url>"
}]`,
    challenges: `[{
  "CHALLENGE": "<description of the challenge>",
  "CONTEXT": "<internal operational challenge or challenge they help customers solve>",
  "SOURCE": "<url>"
}]`,
    visionlink: `{
  "USES_VISIONLINK": "<yes / no / unverified>",
  "DETAILS": "<how they use VisionLink or VisionLink Productivity>",
  "WORKFLOW_IMPACT": "<any reported workflow changes or measurable impacts>",
  "SOURCE": "<url or 'Not found'>"
}`,
  };

  const instructions = {
    industry:   'Extract the company\'s primary business sector, the types of work they do, and likely equipment use cases based on their described services and projects. Only infer use cases directly supported by their work; otherwise state "Use case not specified publicly."',
    projects:   'Extract ALL past, current, and announced projects — regardless of time period. Include role (contractor/partner/sub) if mentioned. Do not fabricate projects.',
    people:     'Extract names and titles of owners, executives, directors, engineers, or any publicly listed staff. Only include people explicitly named in the source text.',
    fleet:      'Extract ALL equipment (any manufacturer) they own or operate. Include Caterpillar and competitor equipment. Note usage context for each machine. IMPORTANT: Only include a machine if the exact model number or machine type is stated verbatim in the source text. Do not infer or guess typical equipment for this type of company.',
    challenges: 'Extract any challenges the company has reported — operational difficulties, site conditions, productivity issues, or challenges they help customers address.',
    visionlink: 'Look specifically for mentions of VisionLink, VisionLink Productivity, Cat telematics, fleet management software, or similar tools. Report if not found.',
  };

  const prompt = `You are a data extraction assistant. Extract structured information about "${company.name}" (${company.location}) from the research text below.

IMPORTANT: All output must be in English. Translate any Portuguese content to English.

TASK: Extract "${dimension}" information.
INSTRUCTIONS: ${instructions[dimension]}

RULES:
- ALL output text must be in English — translate from Portuguese if needed.
- Use ONLY information explicitly stated in the research text — do NOT invent or infer beyond what is written.
- Use ONLY source URLs from the Available URLs list below. Do NOT add URLs not in that list.
- If no relevant information is found for THIS specific company, return null (not an empty record, not generic industry info).
- Every record must be grounded in text that directly mentions "${company.name}" or one of its known aliases: ${company.searchNames.join(', ')}. Generic industry articles about Brazil's construction sector do NOT count.
- Use public sources only. Do not reference any internal Caterpillar data.
- ANTI-HALLUCINATION: Do NOT invent specific machine models, project names, or people. If a detail is not explicitly stated in the research text, omit it entirely rather than guessing.

Output ONLY valid JSON matching this schema:
${schemas[dimension]}

Available URLs:
${sourceUrls.join('\n') || '(none)'}

Research text:
---
${researchText.slice(0, 8000)}
---

Respond with ONLY the JSON in English. If nothing specific to this company is found, return null.`;

  try {
    const cmd = new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      system:   [{ text: 'You are a precise JSON data extractor. Output only valid JSON in English. No markdown fences, no explanatory text. Translate any Portuguese content to English.' }],
      inferenceConfig: { maxTokens: 2048, temperature: 0 },
    });
    const resp    = await client.send(cmd);
    const rawText = resp?.output?.message?.content
      ?.filter(c => typeof c?.text === 'string')
      ?.map(c => c.text)
      ?.join('') || '';
    const clean = stripThinking(rawText).trim();
    const stripped = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    if (!stripped) return null;

    const arrStart = stripped.indexOf('[');
    const objStart = stripped.indexOf('{');
    const nullIdx  = stripped.toLowerCase().indexOf('null');

    if (arrStart !== -1 && (objStart === -1 || arrStart < objStart) && (nullIdx === -1 || arrStart < nullIdx)) {
      const arrEnd = stripped.lastIndexOf(']');
      if (arrEnd > arrStart) return JSON.parse(stripped.slice(arrStart, arrEnd + 1));
    }
    if (objStart !== -1 && (arrStart === -1 || objStart < arrStart) && (nullIdx === -1 || objStart < nullIdx)) {
      const objEnd = stripped.lastIndexOf('}');
      if (objEnd > objStart) return JSON.parse(stripped.slice(objStart, objEnd + 1));
    }
    if (nullIdx !== -1) return null;
    return JSON.parse(stripped);
  } catch (err) {
    console.warn(`    ⚠  Extraction failed for ${dimension}: ${err.message?.slice(0, 80)}`);
    return null;
  }
}

// ── Research pipeline (Tavily search + extract, Nova structured extraction) ──

async function researchCompany(company) {
  console.log(`\n📋 Researching: ${company.name} (${company.location})`);
  console.log(`   Dealer: ${company.dealer}`);

  // ── Pass 1: Tavily keyword searches to discover URLs ──────────────────────
  console.log(`\n  🌐 Pass 1 — Tavily searches to discover sources…`);
  const searchQueries = queries(company);
  const searchResultArrays = await Promise.all(searchQueries.map(q => tavilySearch(q, 10)));
  const rawResults = searchResultArrays.flat();

  const seenPass1 = new Set();
  const pass1Results = rawResults.filter(r => {
    if (seenPass1.has(r.url)) return false;
    seenPass1.add(r.url);
    return true;
  });

  const relevantPass1 = filterRelevantResults(pass1Results, company);
  const candidatePool = relevantPass1.length > 0 ? relevantPass1 : pass1Results;

  if (process.env.DEBUG_FILTER) {
    const keptUrls = new Set(relevantPass1.map(r => r.url));
    const droppedUrls = allUrls(pass1Results).filter(u => !keptUrls.has(u));
    console.log(`\n  🐛 DEBUG_FILTER — raw Pass 1 URLs: ${allUrls(pass1Results).length}, kept: ${keptUrls.size}, dropped: ${droppedUrls.length}`);
    droppedUrls.forEach(u => console.log(`       ✗ ${u}`));
  }

  // ── Pass 2: deep-extract top-ranked pages via Tavily /extract ─────────────
  const rankedUrls = allUrls(candidatePool)
    .map(url => ({ url, score: scoreUrl(url, company) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ url }) => url);

  console.log(`\n  📖 Pass 2 — extracting ${rankedUrls.length} top-ranked URL(s)…`);
  const pass2Results = await tavilyExtract(rankedUrls);

  // ── Pass 3: official-site discovery via a dedicated Tavily search ────────
  console.log(`\n  🌐 Pass 3 — official site discovery…`);
  const officialResults = await tavilySearch(
    `${company.searchNames[0]} ${company.location} official website`, 5
  );
  const officialCandidates = officialResults
    .map(r => ({ url: r.url, score: scoreUrl(r.url, company) }))
    .filter(({ score }) => score >= 15) // only the "distinctive word in domain" tier counts as official
    .sort((a, b) => b.score - a.score);
  let pass3Results = [];
  if (officialCandidates.length > 0) {
    const officialUrl = officialCandidates[0].url;
    console.log(`  🔍 Identified official website: ✓ ${officialUrl}`);
    pass3Results = await tavilyExtract([officialUrl]);
  } else {
    console.log(`  🔍 Identified official website: not found`);
  }

  // ── Merge and deduplicate all results ─────────────────────────────────────
  const seenAll = new Set();
  const allResults = [...pass1Results, ...pass2Results, ...pass3Results].filter(r => {
    if (seenAll.has(r.url)) return false;
    seenAll.add(r.url);
    return true;
  });

  const combinedText = fullText(allResults);
  const allSourceUrls = allUrls(allResults);
  console.log(`\n  combined: ${combinedText.length} chars from ${allSourceUrls.length} sources`);

  // ── Extract all dimensions (same Nova extraction step as the Nova pipeline) ──
  console.log(`\n  🔍 Extracting structured data…`);
  const DIMENSIONS = ['industry', 'projects', 'people', 'fleet', 'challenges', 'visionlink'];
  const extracted = {};
  await Promise.all(DIMENSIONS.map(async dim => {
    process.stdout.write(`     ${dim.padEnd(12)} `);
    if (!combinedText.trim()) { console.log('(no content)'); extracted[dim] = null; return; }
    const data = await extractWithNova(company, dim, combinedText, allSourceUrls);
    console.log(data ? '✓' : '(not found)');
    extracted[dim] = data;
  }));

  return {
    NAME:              company.name,
    LOCATION:          company.location,
    CAT_DEALER:        company.dealer,
    INDUSTRY:          extracted.industry   || { INDUSTRY: 'Not found', USE_CASES: 'Not found', DESCRIPTION: 'Not found' },
    PROJECTS:          extracted.projects   || [],
    PEOPLE:            extracted.people     || [],
    FLEET_INFORMATION: extracted.fleet      || [],
    CHALLENGES:        extracted.challenges || [],
    VISIONLINK:        extracted.visionlink || { USES_VISIONLINK: 'Not found', DETAILS: 'Not found', WORKFLOW_IMPACT: 'Not found', SOURCE: 'Not found' },
    COMMENTS:          `Cat dealer: ${company.dealer}. Search backend: Tavily. URLs deep-extracted: ${rankedUrls.join(', ')}`,
    SOURCES:           allSourceUrls,
  };
}

// ── Markdown table formatter — identical layout to test-company-profiling.mjs ──

function toMarkdown(profiles) {
  const lines = [];
  lines.push('# Company Profiling Research Results — Tavily Backend\n');
  lines.push(`_Generated: ${new Date().toISOString()}_\n`);

  for (const p of profiles) {
    lines.push(`---\n\n## ${p.NAME}`);
    lines.push(`**Location:** ${p.LOCATION}  |  **Cat Dealer:** ${p.CAT_DEALER}\n`);

    lines.push('### Industry & Work');
    const ind = p.INDUSTRY;
    if (ind && (ind.DESCRIPTION || ind.INDUSTRY || ind.USE_CASES)) {
      if (ind.DESCRIPTION) lines.push(ind.DESCRIPTION);
      if (ind.INDUSTRY)    lines.push(`\n**Industry:** ${ind.INDUSTRY}`);
      if (ind.USE_CASES)   lines.push(`**Use Cases:** ${ind.USE_CASES}`);
    } else {
      lines.push('Not found');
    }

    lines.push('\n### Projects');
    if (p.PROJECTS?.length > 0) {
      for (const proj of p.PROJECTS) {
        const role   = proj.ROLE   ? ` [${proj.ROLE}]` : '';
        const status = proj.STATUS ? ` (${proj.STATUS})` : '';
        lines.push(`- **${proj.PROJECT_NAME || 'Unnamed project'}**${role}${status}: ${proj.DESCRIPTION || ''}`);
        if (proj.SOURCE) lines.push(`  _Source: ${proj.SOURCE}_`);
      }
    } else {
      lines.push('Not found');
    }

    lines.push('\n### People');
    if (p.PEOPLE?.length > 0) {
      for (const person of p.PEOPLE) {
        lines.push(`- **${person.NAME}** — ${person.TITLE || 'Unknown role'}`);
      }
    } else {
      lines.push('Not found');
    }

    lines.push('\n### Fleet Information');
    if (p.FLEET_INFORMATION?.length > 0) {
      for (const machine of p.FLEET_INFORMATION) {
        const qty   = machine.QUANTITY ? ` (${machine.QUANTITY} units)` : '';
        const model = machine.MODEL    ? ` ${machine.MODEL}` : '';
        lines.push(`- **${machine.MANUFACTURER}**${model} ${machine.MACHINE_TYPE}${qty}: ${machine.USAGE || ''}`);
        if (machine.SOURCE) lines.push(`  _Source: ${machine.SOURCE}_`);
      }
    } else {
      lines.push('Not found');
    }

    lines.push('\n### Challenges');
    if (p.CHALLENGES?.length > 0) {
      for (const ch of p.CHALLENGES) {
        lines.push(`- ${ch.CHALLENGE || ch}`);
        if (ch.CONTEXT) lines.push(`  _Context: ${ch.CONTEXT}_`);
      }
    } else {
      lines.push('Not found');
    }

    lines.push('\n### VisionLink');
    if (p.VISIONLINK) {
      lines.push(`**Uses VisionLink:** ${p.VISIONLINK.USES_VISIONLINK || 'Not found'}`);
      if (p.VISIONLINK.DETAILS) lines.push(`**Details:** ${p.VISIONLINK.DETAILS}`);
      if (p.VISIONLINK.WORKFLOW_IMPACT) lines.push(`**Workflow Impact:** ${p.VISIONLINK.WORKFLOW_IMPACT}`);
    } else {
      lines.push('Not found');
    }

    lines.push('\n### Sources');
    if (p.SOURCES?.length > 0) {
      for (const url of p.SOURCES) lines.push(`- ${url}`);
    } else {
      lines.push('No public sources found');
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(outputDir, { recursive: true });

  const profiles = [];
  for (const company of COMPANIES) {
    const profile = await researchCompany(company);
    profiles.push(profile);
  }

  const jsonPath = join(outputDir, 'company_profiles_tavily.json');
  await writeFile(jsonPath, JSON.stringify(profiles, null, 2), 'utf8');
  console.log(`\n💾 ${jsonPath}`);

  const mdPath = join(outputDir, 'company_profiles_tavily.md');
  await writeFile(mdPath, toMarkdown(profiles), 'utf8');
  console.log(`💾 ${mdPath}`);

  console.log('\n✅ Done.\n');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
