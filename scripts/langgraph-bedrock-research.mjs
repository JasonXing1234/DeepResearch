#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

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
  node scripts/langgraph-bedrock-research.mjs --prompt "What are sustainability risks for data centers?"

Optional args:
  --company <name>        Company for structured category research
  --category <id>         emissions|investments|equipment|pilots|constraints
  --region <region>       Defaults to AWS_REGION or us-east-1
  --model-id <id>         Defaults to BEDROCK_MODEL_ID or BEDROCK_RESEARCH_MODEL_ID
  --rounds <n>            Research rounds (default: 2)
  --queries <n>           Queries per round (default: 3)
  --results <n>           Results per query (default: 3)
  --self-test-web         Skip Bedrock and only test web search/fetch path
  --self-test-category    Structured open-web search for one company/category
  --self-test-query <q>   Query used by --self-test-web (default: prompt)
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

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how',
  'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to', 'what', 'with',
]);

const GENERIC_RESULT_PATTERNS = [
  /wikipedia\.org\/wiki\/data\/?$/i,
  /wikipedia\.org\/wiki\//i,
  /^https?:\/\/data\.gov\/?$/i,
  /ibm\.com\/think\/topics\/data\/?$/i,
  /merriam-webster\.com\/dictionary\/data\/?$/i,
  /geeksforgeeks\.org\/data-analysis\/what-is-data\/?$/i,
  /mygreatlearning\.com\/blog\/what-is-data/i,
  /\/what-is-data\/?$/i,
  /\/definition\/data\/?$/i,
];

const LOW_SIGNAL_QUERY_TOKENS = new Set(['data', 'info', 'information', 'overview', 'guide']);

const SUSTAINABILITY_SIGNAL_TOKENS = new Set([
  'sustainability', 'esg', 'emissions', 'carbon', 'climate', 'scope', 'ghg',
  'net', 'zero', 'decarbonization', 'renewable', 'water', 'energy', 'target',
  'report', 'disclosure', 'commitment', 'compliance', 'risk', 'regulatory',
]);

const LOW_VALUE_HOST_PATTERNS = [
  /(^|\.)wikipedia\.org$/i,
  /(^|\.)yahoo\.com$/i,
  /(^|\.)marketwatch\.com$/i,
  /(^|\.)stockanalysis\.com$/i,
  /(^|\.)tradingview\.com$/i,
  /(^|\.)nasdaq\.com$/i,
  /(^|\.)finance\.yahoo\.com$/i,
];

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function isLowValueResultUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    const host = parsed.hostname.toLowerCase();
    const path = (parsed.pathname || '/').toLowerCase();

    if (LOW_VALUE_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
      return true;
    }

    if (/\/quote\//i.test(path) || /\/stocks?\//i.test(path) || /\/investing\//i.test(path)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function filterRelevantResults(results, query, maxResults, trace, sourceName) {
  const prefiltered = results.filter(
    (item) => !GENERIC_RESULT_PATTERNS.some((pattern) => pattern.test(item.url || ''))
  );

  const queryTokens = new Set(tokenize(query));
  const focusedQueryTokens = new Set(
    [...queryTokens].filter((token) => !LOW_SIGNAL_QUERY_TOKENS.has(token))
  );
  const relaxedTokenSet = focusedQueryTokens.size ? focusedQueryTokens : queryTokens;

  if (!queryTokens.size) {
    return prefiltered.slice(0, maxResults);
  }

  const scored = prefiltered.map((item) => {
    const haystack = `${item.title || ''} ${item.snippet || ''} ${item.url || ''}`;
    const tokens = new Set(tokenize(haystack));
    let overlap = 0;
    let relaxedOverlap = 0;
    let signalScore = 0;
    const lowValue = isLowValueResultUrl(item.url);

    for (const token of queryTokens) {
      if (tokens.has(token)) overlap += 1;
    }
    for (const token of relaxedTokenSet) {
      if (tokens.has(token)) relaxedOverlap += 1;
    }
    for (const token of SUSTAINABILITY_SIGNAL_TOKENS) {
      if (tokens.has(token)) signalScore += 1;
    }
    return { item, overlap, relaxedOverlap, signalScore, lowValue };
  });

  const minOverlap = Math.min(2, queryTokens.size);
  const rankingScore = (row) => (
    row.overlap * 4 + row.relaxedOverlap * 2 + row.signalScore * 3 - (row.lowValue ? 6 : 0)
  );

  const strict = scored
    .filter((row) => row.overlap >= minOverlap && (!row.lowValue || row.signalScore >= 2))
    .sort((a, b) => rankingScore(b) - rankingScore(a))
    .map((row) => row.item)
    .slice(0, maxResults);

  if (strict.length) {
    if (trace) {
      console.error(`[trace] ${sourceName} relevance filter kept ${strict.length}/${results.length} results (strict)`);
    }
    return strict;
  }

  const relaxed = scored
    .filter((row) => row.relaxedOverlap >= 1)
    .sort((a, b) => rankingScore(b) - rankingScore(a))
    .map((row) => row.item)
    .slice(0, maxResults);

  if (relaxed.length) {
    if (trace) {
      console.error(`[trace] ${sourceName} relevance filter kept ${relaxed.length}/${results.length} results (relaxed)`);
    }
    return relaxed;
  }

  const bestEffort = scored
    .filter((row) => row.relaxedOverlap >= 1)
    .sort((a, b) => rankingScore(b) - rankingScore(a))
    .map((row) => row.item)
    .slice(0, maxResults);

  if (trace) {
    console.error(`[trace] ${sourceName} relevance fallback kept ${bestEffort.length}/${results.length} results (best-effort)`);
  }

  return bestEffort;
}

function buildBingQueryVariants(query) {
  const variants = [];
  const trimmed = String(query || '').trim();
  if (!trimmed) return variants;

  const withPhrase = /data center/i.test(trimmed)
    ? trimmed.replace(/data center/gi, '"data center"')
    : trimmed;

  const prioritized = [
    withPhrase,
    `${withPhrase} ESG energy water emissions`,
    `${withPhrase} sustainability report pdf`,
    `${withPhrase} annual sustainability report`,
    `${withPhrase} climate risk scope 1 scope 2 scope 3`,
    trimmed,
  ];

  const seen = new Set();
  for (const item of prioritized) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push(item);
  }

  return variants;
}

function buildGoogleNewsQueryVariants(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];

  const prioritized = [
    `${trimmed} sustainability report`,
    `${trimmed} ESG`,
    `${trimmed} emissions climate risk`,
  ];

  const seen = new Set();
  const variants = [];
  for (const item of prioritized) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push(item);
  }

  return variants;
}

const CATEGORY_CONFIG = {
  emissions: {
    id: 'emissions',
    label: 'Emissions Reductions',
    templates: [
      '{company} scope 1 scope 2 scope 3 emissions target',
      '{company} net zero target year sustainability report pdf',
      '{company} carbon emissions reduction program',
      '{company} ghg emissions disclosure',
    ],
  },
  investments: {
    id: 'investments',
    label: 'Investments & Commitments',
    templates: [
      '{company} sustainability investment commitment',
      '{company} climate capital expenditure announcement',
      '{company} renewable energy procurement deal',
      '{company} ESG commitment press release',
    ],
  },
  equipment: {
    id: 'equipment',
    label: 'Machine/Equipment Purchases',
    templates: [
      '{company} purchased equipment for efficiency or decarbonization',
      '{company} clean technology procurement',
      '{company} energy efficient machinery upgrade',
      '{company} vendor contract sustainability equipment',
    ],
  },
  pilots: {
    id: 'pilots',
    label: 'Pilot Projects',
    templates: [
      '{company} sustainability pilot project',
      '{company} decarbonization pilot launch',
      '{company} trial project emissions reduction',
      '{company} demonstration project climate initiative',
    ],
  },
  constraints: {
    id: 'constraints',
    label: 'Environmental Constraints',
    templates: [
      '{company} sustainability risk water stress regulation',
      '{company} environmental compliance challenge',
      '{company} climate risk physical transition risk',
      '{company} environmental permit constraints operations',
    ],
  },
};

function normalizeCategory(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return null;

  if (CATEGORY_CONFIG[raw]) return CATEGORY_CONFIG[raw];
  if (raw === 'emission' || raw === 'emissions_reductions') return CATEGORY_CONFIG.emissions;
  if (raw === 'investment' || raw === 'commitments') return CATEGORY_CONFIG.investments;
  if (raw === 'machine' || raw === 'machine_purchases' || raw === 'purchases') return CATEGORY_CONFIG.equipment;
  if (raw === 'pilot' || raw === 'pilot_projects') return CATEGORY_CONFIG.pilots;
  if (raw === 'environment' || raw === 'environmental' || raw === 'environmental_constraints') return CATEGORY_CONFIG.constraints;

  return null;
}

function buildCompanyCategoryQueries(company, categoryConfig) {
  const companyName = String(company || '').trim();
  if (!companyName || !categoryConfig) return [];

  const baseQueries = categoryConfig.templates.map((template) =>
    template.replaceAll('{company}', companyName)
  );

  // Include long-tail terms to improve recall for smaller/private companies.
  const longTail = [
    `${companyName} ${categoryConfig.label} local news`,
    `${companyName} ${categoryConfig.label} supplier customer case study`,
  ];

  const seen = new Set();
  const out = [];
  for (const query of [...baseQueries, ...longTail]) {
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(query);
  }

  return out;
}

function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model output does not contain a JSON object.');
  }
  return JSON.parse(text.slice(start, end + 1));
}

function isNovaModel(modelId) {
  return modelId.startsWith('amazon.nova-');
}

function buildInvokeModelBody({ modelId, prompt, maxTokens, temperature }) {
  if (isNovaModel(modelId)) {
    return {
      messages: [
        {
          role: 'user',
          content: [{ text: prompt }],
        },
      ],
      inferenceConfig: {
        maxTokens,
        temperature,
      },
    };
  }

  return {
    anthropic_version: 'bedrock-2023-06-01',
    max_tokens: maxTokens,
    temperature,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  };
}

function extractModelText({ modelId, payload }) {
  if (isNovaModel(modelId)) {
    const text = payload?.output?.message?.content?.find((item) => typeof item?.text === 'string')?.text;
    if (text) return text;
  }

  const anthropicText = payload?.content?.[0]?.text;
  if (anthropicText && typeof anthropicText === 'string') {
    return anthropicText;
  }

  const fallbackText = payload?.outputText;
  if (fallbackText && typeof fallbackText === 'string') {
    return fallbackText;
  }

  throw new Error('InvokeModel returned an unexpected payload (missing text).');
}

async function invokeModel({ client, modelId, prompt, maxTokens = 1200, temperature = 0.2 }) {
  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(buildInvokeModelBody({
      modelId,
      prompt,
      maxTokens,
      temperature,
    })),
  });

  const response = await client.send(command);
  const payloadText = new TextDecoder().decode(response.body);
  const payload = JSON.parse(payloadText);
  return extractModelText({ modelId, payload });
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

function extractDuckDuckGoHtmlResults(html, maxResults) {
  const results = [];
  const seen = new Set();
  const resultRegex = /<article[^>]*class="[^"]*result[^"]*"[\s\S]*?<\/article>/gi;
  const titleRegex = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i;
  const snippetRegex = /<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i;

  for (const block of html.match(resultRegex) || []) {
    const titleMatch = block.match(titleRegex);
    if (!titleMatch) continue;

    const url = decodeHtmlEntities(titleMatch[1]);
    if (!url.startsWith('http') || seen.has(url)) continue;

    seen.add(url);
    const rawTitle = titleMatch[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const snippetMatch = block.match(snippetRegex);
    const rawSnippet = snippetMatch
      ? snippetMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : '';

    results.push({
      title: decodeHtmlEntities(rawTitle) || 'DuckDuckGo Result',
      url,
      snippet: decodeHtmlEntities(rawSnippet),
    });

    if (results.length >= maxResults) break;
  }

  return results;
}

function extractXmlTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i'));
  if (!match) return '';
  return match[1]
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .trim();
}

function extractBingRssResults(xml, maxResults) {
  const results = [];
  const seen = new Set();
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;

  for (const match of xml.matchAll(itemRegex)) {
    const itemBlock = match[1] || '';
    const url = decodeHtmlEntities(extractXmlTag(itemBlock, 'link'));
    if (!url || !url.startsWith('http') || seen.has(url)) continue;

    seen.add(url);
    const title = decodeHtmlEntities(extractXmlTag(itemBlock, 'title')) || 'Bing Result';
    const snippet = decodeHtmlEntities(extractXmlTag(itemBlock, 'description'));

    results.push({ title, url, snippet });
    if (results.length >= maxResults) break;
  }

  return results;
}

async function webSearch(query, maxResults, trace) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    if (trace) {
      console.error(`[trace] search query: ${query}`);
    }

    const apiResponse = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'langgraph-bedrock-research/1.0',
      },
    });

    if (apiResponse.ok) {
      const data = await apiResponse.json();
      const combined = [];

      if (data?.AbstractURL && data?.AbstractText) {
        combined.push({
          title: data.Heading || 'DuckDuckGo Abstract',
          url: data.AbstractURL,
          snippet: data.AbstractText,
        });
      }

      combined.push(...flattenRelatedTopics(data?.RelatedTopics));

      const seen = new Set();
      const deduped = [];
      for (const item of combined) {
        if (!item?.url || seen.has(item.url)) continue;
        seen.add(item.url);
        deduped.push(item);
        if (deduped.length >= maxResults) break;
      }

      if (deduped.length) {
        const filtered = filterRelevantResults(deduped, query, maxResults, trace, 'DuckDuckGo instant');
        if (filtered.length) return filtered;
      }
    }

    if (trace) {
      console.error('[trace] DuckDuckGo instant API had no hits, trying HTML fallback');
    }

    const htmlResponse = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: {
        accept: 'text/html',
        'user-agent': 'langgraph-bedrock-research/1.0',
      },
    });

    if (htmlResponse.ok) {
      const html = await htmlResponse.text();
      const htmlResults = extractDuckDuckGoHtmlResults(html, maxResults);
      if (htmlResults.length) {
        const filtered = filterRelevantResults(htmlResults, query, maxResults, trace, 'DuckDuckGo HTML');
        if (filtered.length) return filtered;
      }
    }

    if (trace) {
      console.error('[trace] DuckDuckGo HTML had no hits, trying Bing RSS fallback');
    }

    const bingQueries = buildBingQueryVariants(query);
    const aggregateBingResults = [];

    for (const bingQuery of bingQueries) {
      if (trace) {
        console.error(`[trace] Bing RSS query variant: ${bingQuery}`);
      }

      const bingResponse = await fetch(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(bingQuery)}`, {
        signal: controller.signal,
        headers: {
          accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          'user-agent': 'langgraph-bedrock-research/1.0',
        },
      });

      if (!bingResponse.ok) {
        continue;
      }

      const bingXml = await bingResponse.text();
      const parsed = extractBingRssResults(bingXml, maxResults * 3);
      aggregateBingResults.push(...parsed);

      if (aggregateBingResults.length >= maxResults * 5) {
        break;
      }
    }

    const seenUrls = new Set();
    const bingResults = [];
    for (const item of aggregateBingResults) {
      if (!item?.url || seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      bingResults.push(item);
    }

    const filteredBing = filterRelevantResults(bingResults, query, maxResults, trace, 'Bing RSS');
    if (filteredBing.length) {
      return filteredBing;
    }

    if (trace) {
      console.error('[trace] Bing RSS had no hits, trying Google News RSS fallback');
    }

    const googleNewsQueries = buildGoogleNewsQueryVariants(query);
    const aggregateGoogleResults = [];

    for (const newsQuery of googleNewsQueries) {
      if (trace) {
        console.error(`[trace] Google News RSS query variant: ${newsQuery}`);
      }

      const newsResponse = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(newsQuery)}&hl=en-US&gl=US&ceid=US:en`, {
        signal: controller.signal,
        headers: {
          accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          'user-agent': 'langgraph-bedrock-research/1.0',
        },
      });

      if (!newsResponse.ok) {
        continue;
      }

      const newsXml = await newsResponse.text();
      const parsed = extractBingRssResults(newsXml, maxResults * 3);
      aggregateGoogleResults.push(...parsed);

      if (aggregateGoogleResults.length >= maxResults * 5) {
        break;
      }
    }

    const googleSeen = new Set();
    const googleResults = [];
    for (const item of aggregateGoogleResults) {
      if (!item?.url || googleSeen.has(item.url)) continue;
      googleSeen.add(item.url);
      googleResults.push(item);
    }

    return filterRelevantResults(googleResults, query, maxResults, trace, 'Google News RSS');
  } catch (error) {
    if (trace) {
      console.error('[trace] search failed', {
        query,
        name: error?.name,
        message: error?.message,
        cause: error?.cause?.message,
      });
    }
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
        accept: 'text/html, text/plain;q=0.9, */*;q=0.8',
        'user-agent': 'langgraph-bedrock-research/1.0',
      },
      redirect: 'follow',
    });

    if (!response.ok) return '';

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return '';
    }

    const raw = await response.text();
    return stripHtml(raw).slice(0, 900);
  } catch (error) {
    if (trace) {
      console.error('[trace] page fetch failed', {
        url,
        name: error?.name,
        message: error?.message,
        cause: error?.cause?.message,
      });
    }
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function configureFetchProxy(httpsProxy, trace) {
  if (!httpsProxy) {
    return;
  }

  try {
    const undici = await import('undici');
    undici.setGlobalDispatcher(new undici.ProxyAgent(httpsProxy));
    if (trace) {
      console.error('[trace] configured undici global proxy dispatcher');
    }
  } catch (error) {
    if (trace) {
      console.error('[trace] unable to configure undici proxy dispatcher', {
        name: error?.name,
        message: error?.message,
      });
    }
  }
}

function buildPlannerPrompt(question, findings, roundIndex, queriesPerRound) {
  const findingsBlock = findings.length
    ? findings.map((item, idx) => `${idx + 1}. ${item}`).join('\n')
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
  if (!sources.length) {
    const findingLines = findings.map((f, idx) => `${idx + 1}. ${f}`);
    return `You are writing a concise deep-research summary.\nQuestion: "${question}"\n\nPreliminary findings:\n${findingLines.join('\n') || 'None'}\n\nNo external web sources were successfully retrieved in this run.\n\nWrite:\n1) Executive summary (3-5 bullets)\n2) Key risks and rationale\n3) Open questions\n4) A short limitations note explaining that no external sources were retrieved\n\nImportant:\n- Do not include numeric citations like [1], [2]\n- Do not imply external evidence was verified\n- Keep claims cautious and clearly marked as model-generated synthesis.`;
  }

  const sourceLines = sources.map((s, idx) => `[${idx + 1}] ${s.title} | ${s.url} | ${s.snippet || ''}`);
  const findingLines = findings.map((f, idx) => `${idx + 1}. ${f}`);

  return `You are writing a concise deep-research summary.\nQuestion: "${question}"\n\nFindings:\n${findingLines.join('\n') || 'None'}\n\nSources:\n${sourceLines.join('\n') || 'None'}\n\nWrite:\n1) Executive summary (3-5 bullets)\n2) Key evidence (bulleted, each with source citations like [1], [2])\n3) Open questions\n\nDo not invent citations. Only cite provided source ids.`;
}

const ResearchState = Annotation.Root({
  question: Annotation(),
  modelId: Annotation(),
  rounds: Annotation(),
  queriesPerRound: Annotation(),
  resultsPerQuery: Annotation(),
  trace: Annotation(),
  currentRound: Annotation(),
  plannedQueries: Annotation({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  findings: Annotation({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  allSources: Annotation({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  finalText: Annotation(),
});

function buildGraph(client) {
  const graph = new StateGraph(ResearchState)
    .addNode('plan', async (state) => {
      const roundNumber = state.currentRound + 1;
      const plannerPrompt = buildPlannerPrompt(
        state.question,
        state.findings,
        roundNumber,
        state.queriesPerRound
      );

      const plannerText = await invokeModel({
        client,
        modelId: state.modelId,
        prompt: plannerPrompt,
        maxTokens: 700,
        temperature: 0.1,
      });

      let queries = [];
      try {
        const parsed = extractJsonObject(plannerText);
        if (Array.isArray(parsed?.queries)) {
          queries = parsed.queries
            .filter((q) => typeof q === 'string' && q.trim())
            .slice(0, state.queriesPerRound);
        }
      } catch {
        queries = [state.question];
      }

      if (!queries.length) queries = [state.question];

      if (state.trace) {
        console.error(`[trace] round ${roundNumber} planned queries: ${queries.join(' | ')}`);
      }

      return {
        currentRound: roundNumber,
        plannedQueries: queries,
      };
    })
    .addNode('research', async (state) => {
      const roundSources = [];

      for (const query of state.plannedQueries) {
        const hits = await webSearch(query, state.resultsPerQuery, state.trace);

        for (const hit of hits) {
          const pageSummary = await fetchPageSummary(hit.url, state.trace);
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
        if (state.trace) {
          console.error(`[trace] no sources retrieved in round ${state.currentRound}`);
        }
        return { allSources: [], findings: [] };
      }

      const reviewerPrompt = buildReviewerPrompt(state.question, roundSources);
      const reviewerText = await invokeModel({
        client,
        modelId: state.modelId,
        prompt: reviewerPrompt,
        maxTokens: 1000,
        temperature: 0.2,
      });

      let newFindings = [];
      try {
        const parsed = extractJsonObject(reviewerText);
        if (Array.isArray(parsed?.findings)) {
          newFindings = parsed.findings.filter((f) => typeof f === 'string' && f.trim());
        }
      } catch {
        newFindings = [];
      }

      if (state.trace) {
        console.error(`[trace] round ${state.currentRound}: ${roundSources.length} sources, ${newFindings.length} findings`);
      }

      return {
        allSources: roundSources,
        findings: newFindings,
      };
    })
    .addNode('synthesize', async (state) => {
      const dedupedSources = [];
      const seen = new Set();
      for (const source of state.allSources) {
        if (!source.url || seen.has(source.url)) continue;
        seen.add(source.url);
        dedupedSources.push(source);
        if (dedupedSources.length >= 18) break;
      }

      const finalPrompt = buildFinalPrompt(
        state.question,
        state.findings.slice(0, 18),
        dedupedSources
      );

      const finalText = await invokeModel({
        client,
        modelId: state.modelId,
        prompt: finalPrompt,
        maxTokens: 1800,
        temperature: 0.2,
      });

      return { finalText };
    })
    .addEdge(START, 'plan')
    .addEdge('plan', 'research')
    .addConditionalEdges('research', (state) => {
      if (state.currentRound >= state.rounds) return 'synthesize';
      return 'plan';
    }, {
      plan: 'plan',
      synthesize: 'synthesize',
    })
    .addEdge('synthesize', END);

  return graph.compile();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    usage();
    return;
  }

  const company = args.company || '';
  const categoryConfig = normalizeCategory(args.category);
  const selfTestCategory = args['self-test-category'] === 'true';

  let prompt = args.prompt || args.p;
  if (!prompt && company && categoryConfig) {
    prompt = `Research ${company} for ${categoryConfig.label} with evidence and sources`;
  }

  if (!prompt && !selfTestCategory) {
    console.error('Missing required --prompt argument.');
    usage();
    process.exit(2);
  }

  const region = args.region || process.env.AWS_REGION || 'us-east-1';
  const modelId =
    args['model-id'] ||
    process.env.BEDROCK_MODEL_ID ||
    process.env.BEDROCK_RESEARCH_MODEL_ID ||
    'amazon.nova-lite-v1:0';

  const rounds = safeParseInt(args.rounds, 2);
  const queriesPerRound = safeParseInt(args.queries, 3);
  const resultsPerQuery = safeParseInt(args.results, 3);
  const selfTestWeb = args['self-test-web'] === 'true';
  const selfTestQuery = args['self-test-query'] || prompt || '';
  const trace = args.trace === 'true';
  const sessionId = `lg-${randomUUID().slice(0, 8)}`;

  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  await configureFetchProxy(httpsProxy, trace);

  if (selfTestCategory) {
    if (!company) {
      console.error('Missing required --company for --self-test-category mode.');
      usage();
      process.exit(2);
    }

    if (!categoryConfig) {
      console.error('Missing or invalid --category for --self-test-category mode.');
      usage();
      process.exit(2);
    }

    const categoryQueries = buildCompanyCategoryQueries(company, categoryConfig);
    const aggregate = [];

    for (const query of categoryQueries) {
      const hits = await webSearch(query, resultsPerQuery, trace);
      for (const hit of hits) {
        aggregate.push({
          ...hit,
          query,
        });
      }
      await sleep(150);
    }

    const seen = new Set();
    const deduped = [];
    for (const item of aggregate) {
      if (!item?.url || seen.has(item.url)) continue;
      seen.add(item.url);
      deduped.push(item);
      if (deduped.length >= resultsPerQuery * 4) break;
    }

    const focusedQuery = `${company} ${categoryConfig.label}`;
    const filtered = filterRelevantResults(
      deduped,
      focusedQuery,
      resultsPerQuery,
      trace,
      `Category self-test (${categoryConfig.id})`
    );

    console.log(JSON.stringify({
      mode: 'langgraph-category-self-test',
      company,
      category: categoryConfig.id,
      categoryLabel: categoryConfig.label,
      queryCount: categoryQueries.length,
      hitCount: filtered.length,
      proxyConfigured: !!httpsProxy,
    }, null, 2));

    if (!filtered.length) {
      console.log('\n--- structured self-test sources ---\n');
      console.log('No sources retrieved.');
      return;
    }

    console.log('\n--- structured self-test sources ---\n');
    for (const [index, hit] of filtered.entries()) {
      const summary = await fetchPageSummary(hit.url, trace);
      console.log(`[${index + 1}] ${hit.title} | ${hit.url}`);
      if (hit.query) {
        console.log(`    query: ${hit.query}`);
      }
      if (summary) {
        console.log(`    summary: ${summary.slice(0, 160)}${summary.length > 160 ? '...' : ''}`);
      }
    }
    return;
  }

  if (selfTestWeb) {
    const hits = await webSearch(selfTestQuery, resultsPerQuery, trace);
    console.log(JSON.stringify({
      mode: 'langgraph-web-self-test',
      query: selfTestQuery,
      hitCount: hits.length,
      proxyConfigured: !!httpsProxy,
    }, null, 2));

    if (!hits.length) {
      console.log('\n--- self-test sources ---\n');
      console.log('No sources retrieved.');
      return;
    }

    console.log('\n--- self-test sources ---\n');
    for (const [index, hit] of hits.entries()) {
      const summary = await fetchPageSummary(hit.url, trace);
      console.log(`[${index + 1}] ${hit.title} | ${hit.url}`);
      if (summary) {
        console.log(`    summary: ${summary.slice(0, 160)}${summary.length > 160 ? '...' : ''}`);
      }
    }
    return;
  }

  const clientConfig = { region };
  if (httpsProxy) {
    clientConfig.requestHandler = new NodeHttpHandler({
      connectionTimeout: 10000,
      requestTimeout: 60000,
      httpsAgent: new HttpsProxyAgent(httpsProxy),
    });
  }

  const client = new BedrockRuntimeClient(clientConfig);
  const app = buildGraph(client);

  console.log(JSON.stringify({
    mode: 'langgraph',
    region,
    modelId,
    sessionId,
    rounds,
    queriesPerRound,
    resultsPerQuery,
    trace,
  }, null, 2));

  const result = await app.invoke({
    question: prompt,
    modelId,
    rounds,
    queriesPerRound,
    resultsPerQuery,
    trace,
    currentRound: 0,
  });

  console.log('\n--- langgraph deep search response ---\n');
  console.log((result.finalText || '').trim());

  const uniqueSources = [];
  const seen = new Set();
  for (const source of result.allSources || []) {
    if (!source.url || seen.has(source.url)) continue;
    seen.add(source.url);
    uniqueSources.push(source);
  }

  console.log('\n--- sources ---\n');
  if (!uniqueSources.length) {
    console.log('No sources retrieved.');
    return;
  }

  uniqueSources.forEach((source, idx) => {
    console.log(`[${idx + 1}] ${source.title} | ${source.url}`);
  });
}

main().catch((error) => {
  console.error('langgraph_deep_search_failed', {
    name: error?.name,
    message: error?.message,
    code: error?.code,
    statusCode: error?.$metadata?.httpStatusCode,
  });
  process.exit(1);
});
