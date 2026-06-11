#!/usr/bin/env node
/**
 * langgraph-5cat-research.mjs
 *
 * Multi-agent 5-category sustainability research using LangGraph + Nova web grounding.
 *
 * Flow per company × category:
 *   search  →  extract  →  (enrich if fields sparse)  →  end
 *
 * Usage:
 *   node scripts/langgraph-5cat-research.mjs --companies "VULCAN MATERIALS,MICHELS CORPORATION"
 *   node scripts/langgraph-5cat-research.mjs --companies "Manatts Inc" --industry "construction contractor"
 *   node scripts/langgraph-5cat-research.mjs --companies "Tesla" --output ./output/research --model amazon.nova-premier-v1:0
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

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

if (!args.companies) {
  console.error('Usage: node scripts/langgraph-5cat-research.mjs --companies "Company1,Company2" [--output ./output/research] [--industry "construction"] [--model amazon.nova-premier-v1:0] [--runs 2]');
  process.exit(1);
}

const companies   = args.companies.split(',').map(c => c.trim()).filter(Boolean);
const outputDir   = resolve(args.output || './output/research');
const industry    = args.industry || 'construction infrastructure materials heavy industry';
const rawModelId  = args.model || process.env.BEDROCK_RESEARCH_MODEL_ID || 'amazon.nova-premier-v1:0';
const modelId     = /^(us|eu|ap)\./.test(rawModelId) ? rawModelId : `us.${rawModelId}`;
const region      = args.region || process.env.AWS_REGION || 'us-east-2';
const numRuns     = Math.max(1, parseInt(args.runs || '3', 10));

console.log(`\n🔬 LangGraph 5-Category Research`);
console.log(`   Companies : ${companies.join(', ')}`);
console.log(`   Industry  : ${industry}`);
console.log(`   Model     : ${modelId}`);
console.log(`   Region    : ${region}`);
console.log(`   Runs/task : ${numRuns}`);
console.log(`   Output    : ${outputDir}\n`);

// ── Bedrock client ────────────────────────────────────────────────────────────

const client = new BedrockRuntimeClient({ region });

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripThinking(text) {
  if (!text) return '';
  return text
    .replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<thinking[^>]*>[\s\S]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJsonObject(text) {
  // Try markdown code block first
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch {}
  }
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

// ── Page fetcher ──────────────────────────────────────────────────────────────
// Fetches the actual text content of a URL to supplement Nova's variable snippets.
// Returns up to 4000 chars of cleaned plain text, or '' on any error.

async function fetchPageText(url, maxLen = 4000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, maxLen);
  } catch {
    return '';
  }
}

// ── Nova grounding search ─────────────────────────────────────────────────────

async function novaGroundingSearch(query, categoryLabel) {
  const NOVA_SYSTEM_PROMPTS = {
    'Emissions Reductions':
      `You are researching greenhouse gas emission reduction pledges made by companies in the ${industry} sector. ` +
      'Look for: emissions reduction targets (%, absolute), target years, baseline years, net-zero commitments, ' +
      'SBTi validation, CDP disclosures, and sustainability report commitments. ' +
      'Focus on the named company as a business — not law firms, financial advisors, or similarly-named organizations.',

    'Investments & Commitments':
      `You are researching electrification infrastructure investments announced by companies in the ${industry} sector. ` +
      'Look for: investments in EV charging infrastructure, electric vehicle fleet purchases, ' +
      'building electrification or renovation, and related announced amounts and dates. ' +
      'Focus on the named company as a business — not law firms, financial advisors, or similarly-named organizations.',

    'Machine Purchases':
      `You are researching purchases of battery powered or electric construction equipment by companies in the ${industry} sector. ` +
      'Look for: electric excavators, electric loaders, battery-powered dozers, electric compactors, ' +
      'electric pavers, or any zero-emission construction machinery — including manufacturer, model, quantity, and purchase date. ' +
      'Only use public online sources. ' +
      'Focus on the named company as a business — not law firms, financial advisors, or similarly-named organizations.',

    'Pilot Projects':
      `You are researching lower emission construction projects involving companies in the ${industry} sector as owner, contractor, partner, or subcontractor. ` +
      'Look for: projects using electric equipment, solar or wind energy on-site, carbon capture, alternative fuels, ' +
      'or other approaches to reduce construction emissions. Only use public online sources. ' +
      'Focus on the named company as a business — not law firms, financial advisors, or similarly-named organizations.',

    'Environmental Constraints':
      `You are researching construction or mining projects involving companies in the ${industry} sector that had any of these environmental constraints: ` +
      '(1) Areas with strict air quality standards or low-emission zones; ' +
      '(2) Indoor, enclosed, or underground sites such as tunnels, parking garages, building interiors, basements, mines, or warehouses; ' +
      '(3) Noise-sensitive areas such as near hospitals, schools, offices, projects with noise curfews, overnight/early morning work, wildlife preserves, or dairy farms. ' +
      'Include past, current, and planned projects. Include projects where the company is a partner, contractor, or subcontractor. ' +
      'Only use public online sources. ' +
      'Focus on the named company as a business — not law firms, financial advisors, or similarly-named organizations.',
  };

  const systemText = (categoryLabel && NOVA_SYSTEM_PROMPTS[categoryLabel])
    ? NOVA_SYSTEM_PROMPTS[categoryLabel]
    : `You are researching companies in the ${industry} sector. Focus on the named company as a ${industry} business — not law firms, financial advisors, or similarly-named organizations.`;

  const cmd = new ConverseCommand({
    modelId,
    messages: [{ role: 'user', content: [{ text: `Search for: ${query}` }] }],
    system: [{ text: systemText }],
    toolConfig: { tools: [{ systemTool: { name: 'nova_grounding' } }] },
  });

  const resp = await client.send(cmd);
  const items = resp?.output?.message?.content || [];

  let answerText = '';
  const rawCitations = [];

  for (const item of items) {
    if (typeof item?.text === 'string') answerText += item.text + ' ';
    for (const citation of (item?.citationsContent?.citations || [])) {
      const url = citation?.location?.web?.url;
      if (!url?.startsWith('http')) continue;
      rawCitations.push({
        title:   citation?.location?.web?.title || url,
        url,
        snippet: citation?.sourceContent?.text || citation?.generatedResponsePart?.textResponsePart?.text || '',
      });
    }
  }

  const cleanAnswer = stripThinking(answerText);

  // Deduplicate citations by URL — keep snippet for company verification later
  const seen = new Set();
  const sources = [];
  const sourcesWithSnippets = [];
  for (const c of rawCitations) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    sources.push({ title: c.title, url: c.url });
    sourcesWithSnippets.push({ title: c.title, url: c.url, snippet: stripThinking(c.snippet) });
  }

  // Build full research text: deduplicated snippets + full answer
  const snippetSeen = new Set();
  const snippets = rawCitations
    .map(c => stripThinking(c.snippet))
    .filter(s => { if (!s || snippetSeen.has(s)) return false; snippetSeen.add(s); return true; });

  // ── Page fetching (disabled) ───────────────────────────────────────────────
  // Fetches actual page content from found URLs to supplement Nova's short snippets.
  // Disabled because fetched general page content can drown out Nova's targeted
  // snippets; re-enable by uncommenting and switching fullText below.
  //
  // const pageTexts = await Promise.all(
  //   sources.slice(0, 4).map(async (s) => {
  //     const text = await fetchPageText(s.url, 2000);
  //     return text ? `[Source: ${s.title}]\n${text}` : '';
  //   })
  // );
  // const fetchedContent = pageTexts.filter(Boolean).join('\n\n---\n\n');
  //
  // With page fetching (snippets first so they aren't drowned out):
  // const fullText = [...snippets, cleanAnswer, fetchedContent].filter(Boolean).join('\n\n');
  // ──────────────────────────────────────────────────────────────────────────

  const fullText = [...snippets, cleanAnswer].filter(Boolean).join('\n\n');

  return { fullText, sources, sourcesWithSnippets };
}

// ── LLM extraction call (no grounding) ───────────────────────────────────────

async function extractWithLLM(prompt) {
  const cmd = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 1500, temperature: 0.1 },
    }),
  });
  const resp = await client.send(cmd);
  const raw = JSON.parse(new TextDecoder().decode(resp.body));
  const text = raw?.output?.message?.content?.find(i => typeof i?.text === 'string')?.text || '';
  return stripThinking(text);
}

// ── 5 Category definitions ────────────────────────────────────────────────────

const CATEGORIES = {
  emissions: {
    label: 'Emissions Reductions',
    file:  'emissions_reductions',
    searchQuery:    (c) => `"${c}" carbon emissions reduction commitment net zero climate pledge science-based targets 2024 2025`,
    enrichQuery:    (c) => `"${c}" headquarters country location founded`,
    dataEnrichQuery:(c) => `"${c}" GHG greenhouse gas emissions target reduction sustainability report SBTi`,
    keyFields: ['Emissions Reduction Target', 'Target Year'],
    schema: `{
  "Company": "<company name>",
  "Country": "<country where company is headquartered, e.g. United States>",
  "Emissions Reduction Target": "<e.g. 30% reduction in Scope 1 and 2 emissions>",
  "Target Year": "<e.g. 2030>",
  "Baseline Year": "<e.g. 2021>",
  "Pledge Year": "<year the commitment was made>",
  "Net-Zero Target": <true if ANY emissions reduction goal, target, or sustainability commitment is found — false only if absolutely no goal exists>,
  "Comments": "<detailed summary of commitments, initiatives, and context>",
  "Source": ["<url1>", "<url2>"]
}`,
    emptyRecord: (company) => ({
      Company: company, Country: '', 'Emissions Reduction Target': '',
      'Target Year': '', 'Baseline Year': '', 'Pledge Year': '',
      'Net-Zero Target': false, Comments: '', Source: [],
    }),
  },

  investments: {
    label: 'Investments & Commitments',
    file:  'investments_commitments',
    searchQuery:    (c) => `"${c}" electrification infrastructure investment charging electric vehicles building renovation announced`,
    enrichQuery:    (c) => `"${c}" headquarters country location founded`,
    dataEnrichQuery:(c) => `"${c}" EV charging station electric vehicle fleet building renovation electrification investment announcement`,
    keyFields: ['Investment Type', 'Description'],
    schema: `{
  "Company": "<company name>",
  "Country": "<country where company is headquartered>",
  "Investment Type": "<type of electrification infrastructure investment, e.g. Charging Infrastructure, Electric Vehicles, Building Renovation>",
  "Announcement Date": "<date or year announced>",
  "Description": "<full detailed description of the electrification infrastructure investment>",
  "Comments": "<additional context, amounts, partners, outcomes>",
  "Source": ["<url1>", "<url2>"]
}`,
    emptyRecord: (company) => ({
      Company: company, Country: '', 'Investment Type': '',
      'Announcement Date': '', Description: '', Comments: '', Source: [],
    }),
  },

  purchases: {
    label: 'Machine Purchases',
    file:  'machine_purchases',
    searchQuery:    (c) => `"${c}" battery powered electric construction equipment purchase`,
    enrichQuery:    (c) => `"${c}" headquarters country location founded`,
    dataEnrichQuery:(c) => `"${c}" battery electric excavator loader dozer compactor paver construction machine purchase order`,
    keyFields: ['Machine Type', 'Manufacturer'],
    schema: `{
  "Company": "<company name>",
  "Country": "<country where company is headquartered>",
  "Manufacturer": "<battery powered construction equipment manufacturer, e.g. Caterpillar, Komatsu, Volvo>",
  "Machine Type": "<type of battery powered construction equipment, e.g. Excavator, Loader, Truck, Crane — extract from text, do not guess>",
  "Model": "<specific model if mentioned>",
  "Quantity": "<number of units if mentioned>",
  "Purchase Date": "<date or year>",
  "Comments": "<context about the purchase or fleet electrification goals>",
  "Source": ["<url1>", "<url2>"]
}`,
    emptyRecord: (company) => ({
      Company: company, Country: '', Manufacturer: '', 'Machine Type': '',
      Model: '', Quantity: '', 'Purchase Date': '', Comments: '', Source: [],
    }),
  },

  pilots: {
    label: 'Pilot Projects',
    file:  'pilot_projects',
    searchQuery:    (c) => `"${c}" solar wind renewable energy electric clean low-emission project construction 2024 2025`,
    enrichQuery:    (c) => `"${c}" headquarters country location founded`,
    dataEnrichQuery:(c) => `"${c}" clean energy renewable infrastructure project involvement contractor`,
    keyFields: ['Project Name', 'Project Type'],
    schema: `{
  "Company": "<company name>",
  "Country": "<country where company is headquartered>",
  "Project Name": "<name or short title of the pilot project>",
  "Project Type": "<e.g. Solar Farm, EV Fleet Trial, Carbon Capture, Battery Storage>",
  "Involvement": "<company's role, e.g. Contractor, Owner, Partner>",
  "Lower Emissions Approach": "<specific technology or method used to reduce emissions>",
  "Electric Equipment & Manufacturer": "<any electric/low-emission equipment used and who made it>",
  "Project Description": "<detailed description of the project>",
  "Comments": "<timeline, outcomes, partners, scale>",
  "Source": ["<url1>", "<url2>"]
}`,
    emptyRecord: (company) => ({
      Company: company, Country: '', 'Project Name': '', 'Project Type': '',
      Involvement: '', 'Lower Emissions Approach': '',
      'Electric Equipment & Manufacturer': '', 'Project Description': '',
      Comments: '', Source: [],
    }),
  },

  environments: {
    label: 'Environmental Constraints',
    file:  'environmental_constraints',
    searchQuery:    (c) => `"${c}" construction project air quality indoor underground tunnel noise sensitive hospital school wildlife`,
    enrichQuery:    (c) => `"${c}" headquarters country location founded`,
    dataEnrichQuery:(c) => `"${c}" project air quality standards enclosed underground tunnel noise curfew sensitive area contractor`,
    keyFields: ['Project', 'Description'],
    schema: `{
  "Company": "<company name>",
  "Country": "<country where company is headquartered>",
  "Project": "<name of the construction or mining project>",
  "Constraint Type": ["<one or more of: Air Quality, Indoor/Enclosed/Underground, Noise Sensitive>"],
  "Project Date": "<date or year the project started or is planned>",
  "Description": "<description of the constraint: air quality standards, enclosed/underground site details, or noise-sensitive surroundings>",
  "Comments": "<company role (contractor/partner/subcontractor), mitigation measures, any other relevant context>",
  "Source": ["<url1>", "<url2>"]
}`,
    emptyRecord: (company) => ({
      Company: company, Country: '', Project: '', 'Constraint Type': [],
      'Project Date': '', Description: '', Comments: '', Source: [],
    }),
  },
};

// ── LangGraph state ───────────────────────────────────────────────────────────

const ResearchState = Annotation.Root({
  company:              Annotation({ reducer: (_, v) => v }),
  category:             Annotation({ reducer: (_, v) => v }),
  catConfig:            Annotation({ reducer: (_, v) => v }),
  fullText:             Annotation({ reducer: (_, v) => v, default: () => '' }),
  sources:              Annotation({ reducer: (_, v) => v, default: () => [] }),
  sourcesWithSnippets:  Annotation({ reducer: (_, v) => v, default: () => [] }),
  extracted:            Annotation({ reducer: (_, v) => v, default: () => null }),
  enriched:             Annotation({ reducer: (_, v) => v, default: () => false }),
  result:               Annotation({ reducer: (_, v) => v, default: () => null }),
});

// ── Node: search ──────────────────────────────────────────────────────────────

async function searchNode(state) {
  const { company, catConfig } = state;
  const query = catConfig.searchQuery(company);
  try {
    const { fullText, sources, sourcesWithSnippets } = await novaGroundingSearch(query, catConfig.label);
    return { fullText, sources, sourcesWithSnippets };
  } catch (err) {
    return { fullText: '', sources: [], sourcesWithSnippets: [] };
  }
}

// ── Node: extract ─────────────────────────────────────────────────────────────

// Build keyword variants from a company name for snippet verification.
// e.g. "FABICK CAT" → ["fabick cat", "fabick"]
// e.g. "CEMSTONE PRODUCTS CO." → ["cemstone products", "cemstone"]
function companyKeywords(company) {
  const STOP = new Set(['inc', 'corp', 'co', 'llc', 'ltd', 'group', 'the', 'and', '&', 'sons',
                        'company', 'corporation', 'industries', 'services', 'agriservices', 'metals']);
  const words = company.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const significant = words.filter(w => !STOP.has(w));
  const keywords = [];
  if (significant.length >= 2) keywords.push(significant.slice(0, 2).join(' '));
  if (significant.length >= 1) keywords.push(significant[0]);
  return keywords;
}

// Remove URLs from obj.Source whose Nova snippet/title doesn't mention the company.
// This catches cross-company hallucinations where the LLM attributes data from
// one company's source page to a different company being researched.
// Three-tier check to avoid over-filtering:
//   1. If no snippet available → keep (benefit of the doubt)
//   2. If company keyword appears in URL path OR in an unambiguous domain → keep
//      (e.g. globenewswire.com/…/Harsco-Environmental → "harsco" in path ✓)
//      (e.g. emerysapp.com → "emery" in domain, unambiguous ✓)
//      (NOT zieglercompanies.com → "ziegler" in domain but ambiguous ✗)
//   3. If company keyword in snippet/title text → keep
// Only removes URLs where neither the URL nor the snippet mention the company.
function verifySourcesBySnippet(company, obj, sourcesWithSnippets) {
  if (!Array.isArray(obj.Source) || obj.Source.length === 0) return;
  const keywords = companyKeywords(company);
  const snippetMap = new Map(sourcesWithSnippets.map(s => [s.url, `${s.title} ${s.snippet}`.toLowerCase()]));

  obj.Source = obj.Source.filter(url => {
    const snippetText = snippetMap.get(url) || '';

    // Tier 1: no snippet → keep (can't disprove)
    if (!snippetText) return true;

    // Tier 2a: keyword in URL path (after the domain) → keep
    // e.g. globenewswire.com/.../Harsco-Environmental-Secures → "harsco" in path
    let urlPath = '';
    try { urlPath = new URL(url).pathname.toLowerCase(); } catch {}
    if (keywords.some(kw => urlPath.includes(kw.replace(/ /g, '')))) return true;

    // Tier 2b: keyword in domain AND domain unambiguously belongs to this company
    // e.g. emerysapp.com → "emery" in domain, remaining "sapp" ∈ company name → unambiguous ✓
    // NOT: zieglercompanies.com → "ziegler" in domain, "companies" ∉ company name → ambiguous ✗
    if (keywords.some(kw => getDomain(url).includes(kw)) && !isAmbiguousDomain(url, company)) return true;

    // Tier 3: keyword in snippet/title text → keep
    return keywords.some(kw => snippetText.includes(kw));
  });
}

function buildExtractionPrompt(company, catConfig, fullText, sources) {
  const sourceUrls = sources.map(s => s.url).join('\n');
  const subjectLabel = catConfig.label;

  const CATEGORY_INSTRUCTIONS = {
    'Emissions Reductions':
      '- Extract greenhouse gas emission reduction pledges: target reduction amount, target year, baseline year, year pledge was made\n' +
      '   - Set Net-Zero Target to true if ANY emissions reduction goal or sustainability commitment is found\n' +
      '   - Be thorough: check sustainability reports, SBTi commitments, CDP disclosures, annual reports',

    'Investments & Commitments':
      '- Focus ONLY on electrification infrastructure investments: EV charging infrastructure, electric vehicle fleet, building renovation/electrification\n' +
      '   - Extract investment type, announcement date, amount invested if available, and a summary description\n' +
      '   - Do NOT include general sustainability or renewables investments unless they are specifically electrification infrastructure',

    'Machine Purchases':
      '- Focus ONLY on battery powered / electric construction equipment purchases — not diesel, hybrid, or general fleet\n' +
      '   - Do NOT use internal Caterpillar data — only public online sources\n' +
      '   - Extract manufacturer, machine type, model, quantity, and purchase date for each purchase found',

    'Pilot Projects':
      '- Focus on lower emission construction projects where the company is involved as owner, contractor, partner, or subcontractor\n' +
      '   - Do NOT use internal Caterpillar data — only public online sources\n' +
      '   - Extract the project name, type, company\'s role, how lower emissions are achieved, and any electric equipment used',

    'Environmental Constraints':
      '- Look for construction or mining projects with ANY of these three constraint types:\n' +
      '     1. Air Quality: strict air quality standards, low-emission zones, emissions limits on site\n' +
      '     2. Indoor/Enclosed/Underground: tunnels, parking garages, building interiors, basements, mines, warehouses\n' +
      '     3. Noise Sensitive: near hospitals, schools, offices, noise curfews, overnight/early morning work, wildlife preserves, dairy farms\n' +
      '   - Include past, current, and planned projects. Include projects where the company is a partner, contractor, or subcontractor\n' +
      '   - Do not restrict to any particular region or time period\n' +
      '   - If a project qualifies under multiple constraint types, include all that apply in the Constraint Type array\n' +
      '   - Do NOT use internal Caterpillar data — only public online sources',
  };

  const categoryInstructions = CATEGORY_INSTRUCTIONS[subjectLabel] ?? '';

  return `You are a data extraction assistant. Extract structured information about "${company}" from the research text below.

Output ONLY a valid JSON object matching this schema exactly:
${catConfig.schema}

CATEGORY-SPECIFIC INSTRUCTIONS for ${subjectLabel}:
${categoryInstructions}

CRITICAL RULES — read carefully:

1. FIELD EXTRACTION: Extract every piece of data into its specific field.
   - If the text says "purchased 55 diamond grinders" → set Machine Type: "Diamond grinder", Quantity: "55"
   - If the text says "added 155+ rebuilt units including 10 mining machines" → set Machine Type: "Rebuilt units, Mining machines", Quantity: "155+"
   - If the text says "Iowa-based contractor" → set Country: "United States"
   - Do NOT summarize data into Comments that belongs in a specific field
   - Comments is ONLY for supplementary context that doesn't fit any other field
   - Numbers of units/machines/equipment ALWAYS go in Quantity, not Comments

2. NO-INFO RULE: If the research text does NOT contain ANY evidence of "${subjectLabel}" for this company:
   - Set ALL fields to empty ("", false, or []) EXCEPT Company and Country — this includes Comments and Source
   - Do NOT write explanatory notes like "no data found" or "no quantified figures" into Comments
   - Set Source to [] (empty array) — do not include general company URLs as sources
   - Only apply this rule if the text is truly irrelevant or about a different company

3. SOURCE RULE: Include ALL Available URLs below that contain relevant information about ${subjectLabel} for this company.
   Be inclusive — if a URL's page discusses the company's ${subjectLabel} activity even partially, include it.
   Only exclude URLs that are entirely unrelated to the company or ${subjectLabel}.

4. Country: infer from HQ location, state mentions, or context (e.g. "Iowa-based" → "United States")

5. Do NOT invent or hallucinate any data. Do NOT include explanations outside the JSON.

6. DATES: Use only specific dates or years explicitly stated. Do NOT fabricate date ranges.

Available URLs (only use ones with direct evidence):
${sourceUrls || '(none)'}

Research text:
---
${fullText.slice(0, 6000)}
---

Respond with ONLY the JSON object.`;
}

// Post-processing: wipe Comments and Source if no real data fields are populated.
// Comments is excluded from the "has data" check — an LLM-written "no info found"
// note in Comments must not prevent the record from being treated as empty.
const SKIP_FIELDS = new Set(['Company', 'Country', 'Source', 'Comments']);

function hasRealDataFields(obj) {
  return Object.entries(obj).some(([k, v]) => {
    if (SKIP_FIELDS.has(k)) return false;
    if (v === null || v === undefined || v === '' || v === false) return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
}

function cleanupRecord(obj, catConfig) {
  const hasAnyData = hasRealDataFields(obj);
  if (!hasAnyData) {
    obj.Comments = '';
    obj.Source   = [];
    return obj;
  }

  // Universal hallucination guard: any populated record MUST have at least one source URL.
  // Nova grounding always returns citation URLs when it finds real data; if the LLM
  // populated data fields but left Source empty, the data is not verifiable and is discarded.
  const hasSources = Array.isArray(obj.Source) && obj.Source.length > 0;
  if (!hasSources) {
    for (const k of Object.keys(obj)) {
      if (k === 'Company' || k === 'Country') continue;
      if (Array.isArray(obj[k])) obj[k] = [];
      else if (typeof obj[k] === 'boolean') obj[k] = false;
      else obj[k] = '';
    }
    return obj;
  }
  // For emissions records: if any goal field is populated, Net-Zero Target must be true
  if ('Net-Zero Target' in obj) {
    const hasGoal = obj['Emissions Reduction Target'] || obj['Target Year'] ||
                    obj['Baseline Year'] || obj['Pledge Year'] || obj.Comments;
    if (hasGoal) obj['Net-Zero Target'] = true;
  }

  // For machine purchase records: rescue Quantity and Machine Type stranded in Comments.
  // e.g. "Added 155+ rebuilt units including 10 mining machines" → Quantity: "155+", Machine Type: "Rebuilt units"
  if ('Quantity' in obj && !obj.Quantity && obj.Comments) {
    const qMatch = obj.Comments.match(/\b(\d[\d,+]*\+?)\s*(rebuilt|new|used|electric|hybrid)?\s*(unit|machine|truck|excavator|loader|grader|dozer|crane|drill|compactor|paver|scraper|roller)[s]?\b/i);
    if (qMatch) obj.Quantity = qMatch[1];
  }
  if ('Machine Type' in obj && !obj['Machine Type'] && obj.Comments) {
    const mtMatch = obj.Comments.match(/\b(\d[\d,+]*\+?\s+(?:rebuilt |new |used |electric |hybrid )?(unit|machine|truck|excavator|loader|grader|dozer|crane|drill|compactor|paver|scraper|roller)[s]?)\b/i);
    if (mtMatch) obj['Machine Type'] = mtMatch[2].charAt(0).toUpperCase() + mtMatch[2].slice(1);
  }

  return obj;
}

// ── Financial claim verification via page fetch ───────────────────────────────
// When extracted data contains dollar/billion/million figures, verify those
// amounts actually appear on the cited source pages. Three-layer defence:
//   1. Aggregator blocklist — CBInsights/Datanyze/Crunchbase etc. are company-profile
//      sites, not investment data sources; reject them for financial claims.
//   2. Domain ambiguity check — if pages can't be fetched, detect domains that belong
//      to a *different* similarly-named company (e.g. zieglercompanies.com ≠ Ziegler CAT).
//   3. Page content verification — if pages load, confirm the dollar figures appear.

// Business-profile aggregator domains — company info only, no investment data
const AGGREGATOR_DOMAINS = new Set([
  'cbinsights.com', 'datanyze.com', 'crunchbase.com', 'zoominfo.com',
  'pitchbook.com', 'dnb.com', 'mergr.com', 'owler.com', 'craft.co',
  'globaldata.com', 'manta.com', 'marketscreener.com',
]);

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Returns true if the URL's domain appears to belong to a DIFFERENT similarly-named entity.
// e.g. "zieglercompanies.com" for "ZIEGLER CAT" → true  ("companies" ∉ company name)
// e.g. "zieglercat.com"       for "ZIEGLER CAT" → false ("cat" ∈ company name)
// e.g. "andersonsinc.com"     for "THE ANDERSONS" → false ("inc" is a URL-suffix word)
function isAmbiguousDomain(url, company) {
  const COMP_STOP = new Set(['inc', 'corp', 'co', 'llc', 'ltd', 'group', 'the', 'and', '&',
                              'sons', 'company', 'corporation', 'industries', 'services',
                              'agriservices', 'metals', 'products']);
  const URL_SUFFIX = new Set(['inc', 'corp', 'co', 'llc', 'ltd', 'grp', 'us']);

  // Strip TLD to get domain basename (e.g. "zieglercompanies" from "zieglercompanies.com")
  const domainBase = getDomain(url).replace(/\.[a-z]{2,}(\.[a-z]{2})?$/, '');
  const compWords = company.toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length > 1 && !COMP_STOP.has(w));
  if (compWords.length === 0) return false;

  const firstKw = compWords[0];
  if (!domainBase.includes(firstKw)) return false; // domain doesn't match at all

  // Text remaining in domain after removing the first company keyword
  const remaining = domainBase.replace(firstKw, '').replace(/[^a-z]/g, '');
  if (!remaining) return false; // domain IS exactly the keyword (e.g. "crh.com")

  // Not ambiguous if remaining is just a URL-suffix word ("inc", "corp", etc.)
  if (URL_SUFFIX.has(remaining)) return false;
  // Not ambiguous if remaining matches any word in the company name
  if (compWords.some(w => remaining.includes(w) || w.includes(remaining))) return false;

  // Remaining text is a foreign word → domain belongs to a different entity
  return true;
}

function extractDollarClaims(obj) {
  const claims = [];
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP_FIELDS.has(k) || typeof v !== 'string' || !v) continue;
    const rx = /\$?([\d,]+(?:\.\d+)?)\s*(billion|million|[bm])\b/gi;
    for (const m of v.matchAll(rx)) {
      const num = m[1].replace(/,/g, '');
      const scale = m[2].toLowerCase().startsWith('b') ? 'billion' : 'million';
      if (parseFloat(num) > 0) claims.push({ num, scale, raw: m[0] });
    }
  }
  return claims;
}

function wipeRecord(obj) {
  for (const k of Object.keys(obj)) {
    if (k === 'Company' || k === 'Country') continue;
    if (Array.isArray(obj[k])) obj[k] = [];
    else if (typeof obj[k] === 'boolean') obj[k] = false;
    else obj[k] = '';
  }
}

async function verifyFinancialClaims(obj, company) {
  if (!Array.isArray(obj.Source) || obj.Source.length === 0) return;
  const claims = extractDollarClaims(obj);
  if (claims.length === 0) return; // No dollar claims — skip verification

  // ── Layer 1: reject aggregator-only sources ──────────────────────────────
  const credibleSources = obj.Source.filter(url => !AGGREGATOR_DOMAINS.has(getDomain(url)));
  if (credibleSources.length === 0) {
    console.log(`    ❌ [${company}] Financial sources are business-profile aggregators (no real data) — wiping`);
    wipeRecord(obj);
    return;
  }

  // ── Layer 2: fetch pages and verify numbers ──────────────────────────────
  const pageTexts = await Promise.all(
    credibleSources.slice(0, 3).map(url => fetchPageText(url, 8000))
  );
  const fetchedAny = pageTexts.some(t => t.length > 200);

  if (!fetchedAny) {
    // Pages blocked/paywalled — fall back to domain ambiguity check
    const hasUnambiguousSource = credibleSources.some(url => !isAmbiguousDomain(url, company));
    if (!hasUnambiguousSource) {
      console.log(`    ❌ [${company}] Source domains appear to belong to a different company — wiping`);
      wipeRecord(obj);
      return;
    }
    console.log(`    ⚠️  [${company}] Could not fetch source pages to verify financial claims`);
    return;
  }

  // ── Layer 3: confirm numeric values appear on page ───────────────────────
  const combined = pageTexts.join(' ').toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ');
  const verified = claims.some(({ num, scale }) => {
    const escaped = num.replace('.', '\\.');
    return new RegExp(`${escaped}\\s*(?:${scale}|${scale[0]})\\b`, 'i').test(combined);
  });

  if (!verified) {
    console.log(`    ❌ [${company}] Claimed amounts (${claims.map(c => c.raw).join(', ')}) not found on source pages — wiping`);
    wipeRecord(obj);
  } else {
    console.log(`    ✅ [${company}] Financial claims verified on source pages`);
  }
}

// Score a result by richness: non-empty data fields + bonus for verified sources.
// Used to pick the best result across multiple runs.
function scoreResult(obj) {
  let score = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP_FIELDS.has(k)) continue;
    if (v === null || v === undefined || v === '' || v === false) continue;
    if (Array.isArray(v)) { if (v.length > 0) score += v.length; continue; }
    if (typeof v === 'string' && v.length > 0) score += 1 + Math.floor(v.length / 100);
    else score++;
  }
  // Sources are the strongest signal of real verified data
  score += (obj.Source?.length || 0) * 3;
  return score;
}

async function extractNode(state) {
  const { company, catConfig, fullText, sources, sourcesWithSnippets } = state;

  if (!fullText.trim()) {
    return { extracted: catConfig.emptyRecord(company), result: catConfig.emptyRecord(company) };
  }

  const prompt = buildExtractionPrompt(company, catConfig, fullText, sources);
  try {
    const raw = await extractWithLLM(prompt);
    const obj = extractJsonObject(raw);
    if (!obj) {
      return { extracted: catConfig.emptyRecord(company), result: catConfig.emptyRecord(company) };
    }
    obj.Company = company;
    if (typeof obj.Source === 'string') obj.Source = obj.Source ? [obj.Source] : [];
    if (!Array.isArray(obj.Source)) obj.Source = [];
    if (catConfig.file === 'environmental_constraints') {
      if (typeof obj['Constraint Type'] === 'string') {
        obj['Constraint Type'] = obj['Constraint Type'] ? [obj['Constraint Type']] : [];
      }
      if (!Array.isArray(obj['Constraint Type'])) obj['Constraint Type'] = [];
    }
    // Verify each cited URL's snippet mentions the company — removes cross-company hallucinations
    verifySourcesBySnippet(company, obj, sourcesWithSnippets);
    cleanupRecord(obj, catConfig);
    return { extracted: obj, result: obj };
  } catch {
    return { extracted: catConfig.emptyRecord(company), result: catConfig.emptyRecord(company) };
  }
}

// ── Node: enrich ──────────────────────────────────────────────────────────────

function needsEnrichment(extracted, catConfig) {
  if (!extracted) return false;
  // Always enrich if Country is missing
  if (!extracted.Country) return true;
  // Enrich if no data fields have any values at all
  return !hasRealDataFields(extracted);
}

async function enrichNode(state) {
  const { company, catConfig, extracted, sources, sourcesWithSnippets } = state;

  const needsCountry = !extracted?.Country;
  const enrichQuery = needsCountry
    ? catConfig.enrichQuery(company)
    : (catConfig.dataEnrichQuery || catConfig.enrichQuery)(company);

  try {
    const { fullText: enrichText, sources: enrichSources, sourcesWithSnippets: enrichSnippets } = await novaGroundingSearch(enrichQuery, catConfig.label);
    if (!enrichText.trim()) return { enriched: true };

    // Merge sources and snippets
    const allSources = [...sources];
    const allSnippets = [...sourcesWithSnippets];
    const seenUrls = new Set(sources.map(s => s.url));
    for (const s of enrichSources) {
      if (!seenUrls.has(s.url)) { allSources.push(s); seenUrls.add(s.url); }
    }
    for (const s of enrichSnippets) {
      if (!allSnippets.find(x => x.url === s.url)) allSnippets.push(s);
    }

    const combinedText = [state.fullText, enrichText].filter(Boolean).join('\n\n');
    const prompt = buildExtractionPrompt(company, catConfig, combinedText, allSources);
    const raw = await extractWithLLM(prompt);
    const obj = extractJsonObject(raw);
    if (!obj) return { enriched: true };

    obj.Company = company;
    if (typeof obj.Source === 'string') obj.Source = obj.Source ? [obj.Source] : [];
    if (!Array.isArray(obj.Source)) obj.Source = [];
    if (catConfig.file === 'environmental_constraints') {
      if (typeof obj['Constraint Type'] === 'string') {
        obj['Constraint Type'] = obj['Constraint Type'] ? [obj['Constraint Type']] : [];
      }
      if (!Array.isArray(obj['Constraint Type'])) obj['Constraint Type'] = [];
    }
    verifySourcesBySnippet(company, obj, allSnippets);
    cleanupRecord(obj, catConfig);
    return { result: obj, sources: allSources, sourcesWithSnippets: allSnippets, enriched: true };
  } catch {
    return { enriched: true };
  }
}

// ── Build & run graph ─────────────────────────────────────────────────────────

function buildGraph() {
  return new StateGraph(ResearchState)
    .addNode('search',  searchNode)
    .addNode('extract', extractNode)
    .addNode('enrich',  enrichNode)
    .addEdge(START, 'search')
    .addEdge('search', 'extract')
    .addConditionalEdges('extract', (state) => {
      return needsEnrichment(state.extracted, state.catConfig) ? 'enrich' : END;
    }, { enrich: 'enrich', [END]: END })
    .addEdge('enrich', END)
    .compile();
}

async function researchOne(company, categoryKey, runs = 1) {
  const catConfig = CATEGORIES[categoryKey];
  const graph = buildGraph();

  const attempt = () =>
    graph.invoke({ company, category: categoryKey, catConfig })
      .then(s => s.result || catConfig.emptyRecord(company))
      .catch(() => catConfig.emptyRecord(company));

  if (runs <= 1) {
    const result = await attempt();
    await verifyFinancialClaims(result, company);
    return result;
  }

  // Run all attempts in parallel.
  // Multiple runs compensate for Nova's non-determinism — different runs surface
  // different snippets and sometimes completely different data.
  const attempts = await Promise.all(Array.from({ length: runs }, attempt));

  // Merge strategy: take the best-scored result as base, then backfill any empty
  // fields from other runs that have sources. This recovers data lost in one run
  // but found in another, without introducing sourceless hallucinations.
  const sorted = [...attempts].sort((a, b) => scoreResult(b) - scoreResult(a));
  const best = { ...sorted[0] };

  for (const candidate of sorted.slice(1)) {
    // Only merge fields from runs that also have source URLs (verified data)
    if (!candidate.Source?.length) continue;
    for (const [k, v] of Object.entries(candidate)) {
      if (k === 'Company' || k === 'Country') continue;
      if (k === 'Source') {
        // Merge source URLs — union across all runs
        const existing = new Set(best.Source);
        for (const url of (v || [])) { if (!existing.has(url)) best.Source.push(url); }
        continue;
      }
      // Backfill empty fields from other runs
      const bestVal = best[k];
      const isEmpty = bestVal === '' || bestVal === false || bestVal === null ||
                      bestVal === undefined || (Array.isArray(bestVal) && bestVal.length === 0);
      if (isEmpty && v && v !== '' && v !== false) best[k] = v;
    }
  }

  // After merging runs: verify any dollar claims against source pages.
  // This catches hallucinations like "$500M renewable" that don't appear on the cited page.
  await verifyFinancialClaims(best, company);

  return best;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(outputDir, { recursive: true });

  const categoryKeys = Object.keys(CATEGORIES);
  const tasks = [];

  for (const company of companies) {
    console.log(`\n📋 Researching: ${company}`);
    for (const catKey of categoryKeys) {
      tasks.push({ company, catKey });
    }
  }

  // Run all company × category in parallel
  const results = await Promise.all(
    tasks.map(async ({ company, catKey }) => {
      const catConfig = CATEGORIES[catKey];
      process.stdout.write(`  [${catKey}] ${company.slice(0, 40)}… `);
      try {
        const result = await researchOne(company, catKey, numRuns);
        console.log(`✓`);
        return { company, catKey, result };
      } catch (err) {
        console.log(`✗ ${err.message}`);
        return { company, catKey, result: catConfig.emptyRecord(company) };
      }
    })
  );

  // Group by category
  const byCategory = {};
  for (const catKey of categoryKeys) byCategory[catKey] = [];
  for (const { catKey, result } of results) byCategory[catKey].push(result);

  // Write output files
  console.log(`\n💾 Writing output files to ${outputDir}/`);
  for (const catKey of categoryKeys) {
    const catConfig = CATEGORIES[catKey];
    const data = byCategory[catKey];
    const filePath = `${outputDir}/${catConfig.file}.json`;
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`   ✓ ${catConfig.file}.json  (${data.length} entr${data.length === 1 ? 'y' : 'ies'})`);
  }
  console.log(`\n✅ Done.\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
