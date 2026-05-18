#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }

    args[key] = next;
    i += 1;
  }

  return args;
}

function usage() {
  console.log(`Usage:
  node scripts/test-bedrock-agent.mjs --prompt "What are 3 sustainability risks for data centers?"

Optional args:
  --region <region>       Defaults to AWS_REGION or us-east-1
  --model-id <id>         Defaults to BEDROCK_MODEL_ID or BEDROCK_RESEARCH_MODEL_ID
  --rounds <n>            Research rounds (default: 2)
  --queries <n>           Queries per round (default: 3)
  --results <n>           Results per query (default: 3)
  --trace                 Enable verbose logs
`);
}

function safeParseInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(input) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model output does not contain a JSON object.');
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function invokeModel({ client, modelId, prompt, maxTokens = 1500, temperature = 0.2 }) {
  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-06-01',
      max_tokens: maxTokens,
      temperature,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  const response = await client.send(command);
  const payloadText = new TextDecoder().decode(response.body);
  const payload = JSON.parse(payloadText);
  const text = payload?.content?.[0]?.text;

  if (!text || typeof text !== 'string') {
    throw new Error('InvokeModel returned an unexpected payload (missing text).');
  }

  return text;
}

function flattenRelatedTopics(relatedTopics) {
  const out = [];

  for (const item of relatedTopics || []) {
    if (item?.Topics && Array.isArray(item.Topics)) {
      out.push(...flattenRelatedTopics(item.Topics));
      continue;
    }

    if (item?.FirstURL && item?.Text) {
      const title = String(item.Text).split(' - ')[0].trim();
      out.push({
        title: title || item.Text,
        url: item.FirstURL,
        snippet: item.Text,
      });
    }
  }

  return out;
}

async function duckDuckGoSearch(query, maxResults, trace) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const endpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    if (trace) {
      console.error(`[trace] search query: ${query}`);
    }

    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        'accept': 'application/json',
        'user-agent': 'deepresearch-test-agent/1.0',
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const combined = [];

    if (data?.AbstractURL && data?.AbstractText) {
      combined.push({
        title: data.Heading || 'DuckDuckGo Abstract',
        url: data.AbstractURL,
        snippet: data.AbstractText,
      });
    }

    combined.push(...flattenRelatedTopics(data?.RelatedTopics));

    const deduped = [];
    const seen = new Set();
    for (const item of combined) {
      if (!item?.url || seen.has(item.url)) continue;
      seen.add(item.url);
      deduped.push(item);
      if (deduped.length >= maxResults) break;
    }

    return deduped;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPageSummary(url, trace) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'accept': 'text/html, text/plain;q=0.9, */*;q=0.8',
        'user-agent': 'deepresearch-test-agent/1.0',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return '';
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return '';
    }

    const raw = await response.text();
    const text = stripHtml(raw);
    return text.slice(0, 900);
  } catch {
    if (trace) {
      console.error(`[trace] failed to fetch url: ${url}`);
    }
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

function buildPlannerPrompt(question, priorFindings, roundIndex, queriesPerRound) {
  const findingsBlock = priorFindings.length
    ? priorFindings.map((item, idx) => `${idx + 1}. ${item}`).join('\n')
    : 'None yet';

  return `You are a research planner.\nQuestion: "${question}"\nRound: ${roundIndex}\nPrior findings:\n${findingsBlock}\n\nReturn only JSON in this exact shape:\n{\n  "queries": ["q1", "q2"]\n}\n\nRules:\n- Provide ${queriesPerRound} concise web search queries\n- Avoid duplicate intent\n- Target evidence-rich sources\n- No markdown, only JSON`;
}

function buildReviewerPrompt(question, roundSources) {
  const compactSources = roundSources.map((s, idx) => ({
    id: idx + 1,
    query: s.query,
    title: s.title,
    url: s.url,
    snippet: s.snippet,
    pageSummary: s.pageSummary,
  }));

  return `You are a research analyst.\nQuestion: "${question}"\n\nSources JSON:\n${JSON.stringify(compactSources)}\n\nReturn only JSON:\n{\n  "findings": ["fact 1", "fact 2"],\n  "followUpQueries": ["query 1", "query 2"]\n}\n\nRules:\n- findings must be specific and evidence-oriented\n- followUpQueries should target uncertainty gaps\n- No markdown, only JSON`;
}

function buildFinalPrompt(question, findings, sources) {
  const sourceLines = sources.map(
    (s, idx) => `[${idx + 1}] ${s.title} | ${s.url} | ${s.snippet || ''}`
  );
  const findingLines = findings.map((f, idx) => `${idx + 1}. ${f}`);

  return `You are writing a concise deep-research summary.\nQuestion: "${question}"\n\nFindings:\n${findingLines.join('\n') || 'None'}\n\nSources:\n${sourceLines.join('\n') || 'None'}\n\nWrite:\n1) Executive summary (3-5 bullets)\n2) Key evidence (bulleted, each with source citations like [1], [2])\n3) Open questions\n\nDo not invent citations. Only cite provided source ids.`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    usage();
    return;
  }

  const prompt = args.prompt || args.p;
  if (!prompt) {
    console.error('Missing required --prompt argument.');
    usage();
    process.exit(2);
  }

  const region = args.region || process.env.AWS_REGION || 'us-east-1';
  const modelId =
    args['model-id'] ||
    process.env.BEDROCK_MODEL_ID ||
    process.env.BEDROCK_RESEARCH_MODEL_ID ||
    'anthropic.claude-3-5-sonnet-20241022';
  const sessionId = args['session-id'] || `br-cli-${randomUUID().slice(0, 12)}`;
  const rounds = safeParseInt(args.rounds, 2);
  const queriesPerRound = safeParseInt(args.queries, 3);
  const resultsPerQuery = safeParseInt(args.results, 3);
  const enableTrace = args.trace === 'true';

  const client = new BedrockRuntimeClient({ region });

  console.log(JSON.stringify({
    region,
    modelId,
    sessionId,
    rounds,
    queriesPerRound,
    resultsPerQuery,
    trace: enableTrace,
  }, null, 2));

  const allSources = [];
  const findings = [];
  let candidateQueries = [prompt];

  for (let round = 1; round <= rounds; round += 1) {
    const plannerPrompt = buildPlannerPrompt(prompt, findings, round, queriesPerRound);
    const plannerText = await invokeModel({
      client,
      modelId,
      prompt: plannerPrompt,
      maxTokens: 800,
      temperature: 0.1,
    });

    let planned;
    try {
      planned = extractJsonObject(plannerText);
    } catch {
      planned = { queries: candidateQueries };
    }

    const queries = Array.isArray(planned?.queries)
      ? planned.queries.filter((q) => typeof q === 'string' && q.trim()).slice(0, queriesPerRound)
      : [];

    if (!queries.length) {
      if (enableTrace) {
        console.error(`[trace] no queries generated in round ${round}`);
      }
      break;
    }

    const roundSources = [];

    for (const query of queries) {
      const hits = await duckDuckGoSearch(query, resultsPerQuery, enableTrace);

      for (const hit of hits) {
        const pageSummary = await fetchPageSummary(hit.url, enableTrace);
        roundSources.push({
          query,
          title: hit.title,
          url: hit.url,
          snippet: hit.snippet,
          pageSummary,
        });
      }

      await sleep(150);
    }

    if (!roundSources.length) {
      if (enableTrace) {
        console.error(`[trace] no sources retrieved in round ${round}`);
      }
      continue;
    }

    allSources.push(...roundSources);

    const reviewerPrompt = buildReviewerPrompt(prompt, roundSources);
    const reviewerText = await invokeModel({
      client,
      modelId,
      prompt: reviewerPrompt,
      maxTokens: 1200,
      temperature: 0.2,
    });

    let review;
    try {
      review = extractJsonObject(reviewerText);
    } catch {
      review = { findings: [], followUpQueries: [] };
    }

    const newFindings = Array.isArray(review?.findings)
      ? review.findings.filter((f) => typeof f === 'string' && f.trim())
      : [];

    findings.push(...newFindings);

    candidateQueries = Array.isArray(review?.followUpQueries)
      ? review.followUpQueries.filter((q) => typeof q === 'string' && q.trim())
      : candidateQueries;

    if (enableTrace) {
      console.error(`[trace] round ${round}: ${roundSources.length} sources, ${newFindings.length} findings`);
    }
  }

  const dedupedSources = [];
  const seenUrls = new Set();
  for (const source of allSources) {
    if (!source.url || seenUrls.has(source.url)) continue;
    seenUrls.add(source.url);
    dedupedSources.push(source);
    if (dedupedSources.length >= 18) break;
  }

  const finalPrompt = buildFinalPrompt(prompt, findings.slice(0, 18), dedupedSources);
  const finalText = await invokeModel({
    client,
    modelId,
    prompt: finalPrompt,
    maxTokens: 1800,
    temperature: 0.2,
  });

  console.log('\n--- deep search response ---\n');
  console.log(finalText.trim());

  console.log('\n--- sources ---\n');
  dedupedSources.forEach((source, idx) => {
    console.log(`[${idx + 1}] ${source.title} | ${source.url}`);
  });
}

main().catch((error) => {
  console.error('deep_search_failed', {
    name: error?.name,
    message: error?.message,
    code: error?.code,
    statusCode: error?.$metadata?.httpStatusCode,
  });
  process.exit(1);
});
