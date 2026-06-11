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
      `Each element in the list has a sublist with the company's name and the country that the company is in. Can you find me information on greenhouse gas emission reduction pledges from each of the companies in the following list of lists.
Only use the company name and country for your search. If you find information, tell me what the target emissions reduction is, the target year at which the emissions reductions need to be achieved, what is the baseline year, and the year the pledge was made. Put the results into a table in JSON format. Each item in the table needs to have an string entry called "Company" for the company doing the pledge written exactly like in the list, a string entry called "Country" with the country exactly like in the input list, a string entry called "Emissions Reduction Target" for the emissions reduction target, a string entry called "Target Year" for the target year, a string entry called "Baseline Year" for the baseline year, a string entry called "Pledge Year" for the pledge year, an entry called "Net-Zero Target" with a boolean value that tells whether the company has a net-zero emissions target, a string entry called "Comments" where you can include any relevant comments, and a column called "Source" in the format of a list of strings for the URL or URLs for the source or sources that you used. If there are no sources, return an empty list for the "Source" column. The table should have one row for each pledge you can find. There can be multiple pledges for a single customer. If you do not find information for a customer, add a row with the customer name, and an empty string for all the other fields. I do not want any freeform text around the tables. Just give me back the table and the list of sources you used to populate it. You can add a column for comments or any other information you think is relevant. Be thorough in your search`,

    'Investments & Commitments':
      `Each element in the list has a sublist with the company's name and the country that the company is in. Can you find me information on electrification infrastructure investments announced by each of the companies in the list of lists.
If you find information, tell me about the kind of electrification infrastructure investments (charging infrastructure, electric vehicles, building renovation), when the investment was announced, the amount invested and give me a summary of what you can find about the electrification infrastructure investments. Put the results into a table in JSON format. Each item in the table needs to have a string entry called "Company" for the name of the company doing the electrification infrastructure investments with the company name written exactly like in the list, a string entry called "Country" with the country exactly like in the input list, a string entry called "Investment Type" for the type of electrification infrastructure investments, a string entry called "Announcement Date" for the electrification infrastructure investments announcement date, a string entry called "Description" with a short description of the electrification infrastructure investment, a string entry called "Comments" where you can include any relevant comments and an entry called "Source" in the format of a list of strings for the URL or URLs for the source or sources that you used. If there are no sources, return an empty list for the "Source" column. The table should have one row for each electrification infrastructure investments you can find. If you do not find information for a customer, add a row with the customer name, and an empty string for all the other fields. I do not want any freeform text around the tables. Just give me back the table and the list of sources you used to populate it. You can add a column for comments or any other information you think is relevant. Be thorough in your search`,

    'Machine Purchases':
      `Each element in the list has a sublist with the company's name and the country that the company is in. Can you find me information on purchases of battery powered construction equipment by each of the companies in the list of lists.
Don't use internal Caterpillar data. Only use material you find online on public pages. If you find information, tell me how many battery powered construction machines were bought, from what manufacturer and what model. Put the results into a table in JSON format. Each item needs to have a string field called "Company" for the name of the company doing the purchase written exactly like in the list, a string entry called "Country" with the name of the country typed exactly like in the input list, a string field called "Manufacturer" for the battery powered construction machine manufacturer, a string field called "Machine Type" for the battery powered construction machine type, a string field called "Model" the battery powered construction machine model, a string field called "Quantity" for the number of purchased battery powered construction machines, a string field called "Purchase Date" for the date of the purchase, a string field called "Comments" where you can include any relevant comments, and a field called "Source" in the format of a list of strings for the URL or URLs for the source or sources that you used. If there are no sources, return an empty list for the "Source" column. The table should have one row for each purchase. If you do not find information for a customer, add a row with the customer name, and an empty string for all the other fields. I do not want any freeform text around the tables. Just give me back the table and the list of sources you used to populate it. You can add a column for comments or any other information you think is relevant. Be thorough in your search.`,

    'Pilot Projects':
      `Each element in the list has a sublist with the company's name and the country that the company is in. Can you find me information on lower emission construction projects involving each of the companies in the list of lists.
Don't use internal Caterpillar data. Only use material you find online on public pages. If you find information, tell me the name of the lower emissions construction project, the type of lower emissions construction project, how the company is involved, how the company intends to achieve lower emissions during the construction project, the type and manufacturer of the electric equipment involved in the lower emissions project and a short description of the lower emissions construction project. Put the results into a table in JSON format. Each entry in the table needs to have a string entry called "Company" for the company name written exactly like in the list, a string entry called "Country" with the name of the country typed exactly like in the input list, a string entry called "Project Name" for the name of the lower emissions construction project, a string entry called "Project Type" for the type of lower emissions construction project, a string entry called "Involvement" for the role the company had in the pilot project, a string entry called "Lower Emissions Approach" for how the company intends to achieve lower emissions during the construction project, a string entry called "Electric Equipment & Manufacturer" for the type and manufacturer of the electric equipment involved in the lower emissions project, a string entry called "Project Description" for a short description of the lower emissions construction project, a string entry called "Comments" where you can include any relevant comments and an entry called "Source" in the format of a list of strings for the URL or URLs for the source or sources that you used. If there are no sources, return an empty list for the "Source" column. The table should have one row for each project you can find. If you do not find information for a customer, add a row with the customer name, and an empty string for all the other fields. I do not want any freeform text around the tables. Just give me back the table and the list of sources you used to populate it. You can add a column for comments or any other information you think is relevant. Be thorough in your search`,

    'Environmental Constraints':
      `Each element in the list has a sublist with the company's name and the country code for the country that the company is in.
Can you tell me if this company has worked, is working or is planning to work on construction or mining projects with any of the following constraints:
- Areas with strict air quality standards
- Indoor, enclosed or underground sites. For example tunnels, parking garages, building interiors, basements, mines, warehouses
- Noise sensitive areas. For example near hospitals, schools, offices, projects in areas with noise curfews, overnight or early morning work, wildlife preserves, dairy farms and other areas in proximity to animals
Don't use internal Caterpillar data. Only use material you find online on public pages. Look at past, current and announced projects. Don't focus on any particular geographical region or time period. Include projects where the company is a partner, contractor or subcontractor.
Please return the results in the form of a json file with one item for each example that you can find. For each example, create a "Company" string field with the name of the company written exactly like in the list, a string entry called "Country" with the name of the country typed exactly like in the input list, a "Project" string field with a name for the project, a "Constraint Type" string field describing the type of constraint this particular project was in, a "Project Date" string field with information about when the project started or will start, a "Description" string field with a description of the project's constraints from the list above, a "Comments" string field where you can include relevant comments, and a "Source" field in the format of a list of strings, with the URL or URLs to the source that you found about this project. If there are no sources, return an empty list for the "Source" column. The json file can have multiple entries for a single project. If a project was under multiple of the constraints above, add one item for each constraint. If you don't find information for a company, create a record in the json file with only the "Company" field populated and put an empty string for the other fields. Only look at public information online. Do not look at any internal files. Do not use files on my computer or internal network. Do not look at Caterpillar files. Only look at public material online. Only return the json file. Don't return freeform text.`,
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
    itemLabel: 'emissions reduction pledge',
    searchQuery:    (c) => `"${c}" carbon emissions reduction commitment net zero climate pledge science-based targets 2024 2025`,
    enrichQuery:    (c) => `"${c}" headquarters country location founded`,
    dataEnrichQuery:(c) => `"${c}" GHG greenhouse gas emissions target reduction sustainability report SBTi`,
    keyFields: ['Emissions Reduction Target', 'Target Year'],
    schema: `[{
  "Company": "<company name>",
  "Country": "<country where company is headquartered, e.g. United States>",
  "Emissions Reduction Target": "<e.g. 30% reduction in Scope 1 and 2 emissions>",
  "Target Year": "<e.g. 2030>",
  "Baseline Year": "<e.g. 2021>",
  "Pledge Year": "<year the commitment was made>",
  "Net-Zero Target": <true if ANY emissions reduction goal, target, or sustainability commitment is found — false only if absolutely no goal exists>,
  "Comments": "<detailed summary of commitments, initiatives, and context>",
  "Source": ["<url1>", "<url2>"]
}]`,
    emptyRecord: (company) => ({
      Company: company, Country: '', 'Emissions Reduction Target': '',
      'Target Year': '', 'Baseline Year': '', 'Pledge Year': '',
      'Net-Zero Target': false, Comments: '', Source: [],
    }),
  },

  investments: {
    label: 'Investments & Commitments',
    file:  'investments_commitments',
    itemLabel: 'electrification infrastructure investment',
    searchQuery:    (c) => `"${c}" electric vehicle EV fleet charging infrastructure electrification investment sustainability capital announced`,
    enrichQuery:    (c) => `"${c}" headquarters country location founded`,
    dataEnrichQuery:(c) => `"${c}" electric vehicle fleet EV charging station building renovation electrification investment sustainability announcement`,
    keyFields: ['Investment Type', 'Announcement Date'],
    schema: `[{
  "Company": "<company name>",
  "Country": "<country where company is headquartered>",
  "Investment Type": "<type of electrification infrastructure investment, e.g. Charging Infrastructure, Electric Vehicles, Building Renovation>",
  "Announcement Date": "<date or year announced>",
  "Description": "<full detailed description of the electrification infrastructure investment>",
  "Comments": "<additional context, amounts, partners, outcomes>",
  "Source": ["<url1>", "<url2>"]
}]`,
    emptyRecord: (company) => ({
      Company: company, Country: '', 'Investment Type': '',
      'Announcement Date': '', Description: '', Comments: '', Source: [],
    }),
  },

  purchases: {
    label: 'Machine Purchases',
    file:  'machine_purchases',
    itemLabel: 'battery-powered machine purchase',
    searchQuery:    (c) => `"${c}" battery electric zero-emission construction equipment excavator loader dozer compactor machine purchase fleet`,
    enrichQuery:    (c) => `"${c}" headquarters country location founded`,
    dataEnrichQuery:(c) => `"${c}" electric battery zero emission excavator loader dozer grader compactor paver scraper drill machine order purchase`,
    keyFields: ['Machine Type', 'Manufacturer'],
    schema: `[{
  "Company": "<company name>",
  "Country": "<country where company is headquartered>",
  "Manufacturer": "<battery powered construction equipment manufacturer, e.g. Caterpillar, Komatsu, Volvo>",
  "Machine Type": "<type of battery powered construction equipment, e.g. Excavator, Loader, Truck, Crane — extract from text, do not guess>",
  "Model": "<specific model if mentioned>",
  "Quantity": "<number of units if mentioned>",
  "Purchase Date": "<date or year>",
  "Comments": "<context about the purchase or fleet electrification goals>",
  "Source": ["<url1>", "<url2>"]
}]`,
    emptyRecord: (company) => ({
      Company: company, Country: '', Manufacturer: '', 'Machine Type': '',
      Model: '', Quantity: '', 'Purchase Date': '', Comments: '', Source: [],
    }),
  },

  pilots: {
    label: 'Pilot Projects',
    file:  'pilot_projects',
    itemLabel: 'lower-emission construction project',
    searchQuery:    (c) => `"${c}" solar wind renewable energy electric clean low-emission project construction 2024 2025`,
    enrichQuery:    (c) => `"${c}" headquarters country location founded`,
    dataEnrichQuery:(c) => `"${c}" clean energy renewable infrastructure project involvement contractor`,
    keyFields: ['Project Name'],   // Project Type varies too much across runs; Name alone is sufficient
    schema: `[{
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
}]`,
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
    itemLabel: 'construction or mining project with environmental constraints',
    searchQuery:    (c) => `"${c}" construction project air quality indoor underground tunnel noise sensitive hospital school wildlife`,
    enrichQuery:    (c) => `"${c}" headquarters country location founded`,
    dataEnrichQuery:(c) => `"${c}" project air quality standards enclosed underground tunnel noise curfew sensitive area contractor`,
    keyFields: ['Project'],        // Constraint Type split across runs gets merged below
    schema: `[{
  "Company": "<company name>",
  "Country": "<country where company is headquartered>",
  "Project": "<name of the construction or mining project>",
  "Constraint Type": ["<one or more of: Air Quality, Indoor/Enclosed/Underground, Noise Sensitive>"],
  "Project Date": "<date or year the project started or is planned>",
  "Description": "<description of the constraint: air quality standards, enclosed/underground site details, or noise-sensitive surroundings>",
  "Comments": "<company role (contractor/partner/subcontractor), mitigation measures, any other relevant context>",
  "Source": ["<url1>", "<url2>"]
}]`,
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
    // Pre-filter: remove spam domains outright
    if (isSpamDomain(url)) return false;

    const snippetText = snippetMap.get(url) || '';

    // Tier 1: no snippet → keep (can't disprove — URL came from Nova Grounding)
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

    // Tier 3: keyword appears as a whole word in snippet/title text → keep
    // Uses word-boundary matching so "andersons" won't match snippets that only say "anderson"
    return keywords.some(kw => {
      const pattern = new RegExp(`\\b${kw.replace(/ /g, '[\\s\\-]+')}\\b`);
      return pattern.test(snippetText);
    });
  });
}

function buildExtractionPrompt(company, catConfig, fullText, sources) {
  const sourceUrls = sources.map(s => s.url).join('\n');
  const subjectLabel = catConfig.label;

  const CATEGORY_INSTRUCTIONS = {
    'Emissions Reductions':
      '- Extract greenhouse gas emission reduction pledges: target reduction amount, target year, baseline year, year pledge was made\n' +
      '   - Set Net-Zero Target to true if ANY emissions reduction goal or sustainability commitment is found\n' +
      '   - Be thorough: check sustainability reports, SBTi commitments, CDP disclosures, annual reports\n' +
      '   - INCLUDE pledges by the company\'s parent or operating division if the company is clearly a subsidiary or brand name of a larger group\n' +
      '   - REJECT: pledges by a completely unrelated company that happens to share a word or abbreviation in its name (e.g. "AMAT" meaning Applied Materials Inc ≠ a building materials company)',

    'Investments & Commitments':
      '- Focus ONLY on electrification infrastructure investments: EV charging infrastructure, electric vehicle fleet, building renovation/electrification\n' +
      '   - Extract investment type, announcement date, amount invested if available, and a summary description\n' +
      '   - INCLUDE strategic agreements and partnerships that have a concrete, named electrification deliverable (e.g. developing and deploying EV trucks for quarry operations)\n' +
      '   - REJECT: general sustainability goals, carbon reduction pledges, renewable energy purchases for own operations, carbon offsets with no electrification component\n' +
      '   - REJECT: investments by a completely unrelated company that shares a word or abbreviation in its name',

    'Machine Purchases':
      '- Focus ONLY on battery powered / electric construction equipment purchases — not diesel, hybrid, or general fleet\n' +
      '   - Do NOT use internal Caterpillar data — only public online sources\n' +
      '   - Extract manufacturer, machine type, model, quantity, and purchase date for each purchase found\n' +
      '   - INCLUDE confirmed orders, deliveries, and pilot deployments of electric equipment\n' +
      '   - REJECT: results where ALL sources are equipment manufacturer product/spec pages (e.g. only cat.com/products/ pages with no mention of the company buying it) — these describe the machine specs, not who bought it\n' +
      '   - REJECT: results from a completely unrelated company that shares a word or abbreviation in its name',

    'Pilot Projects':
      '- Focus on lower emission construction projects where the company is involved as owner, contractor, partner, or subcontractor\n' +
      '   - Do NOT use internal Caterpillar data — only public online sources\n' +
      '   - Extract the project name, type, company\'s role, how lower emissions are achieved, and any electric equipment used\n' +
      '   - INCLUDE projects where the company supplies materials AND is also performing construction or site work\n' +
      '   - REJECT: general sustainability programs or energy efficiency upgrades to the company\'s own office/plant with no construction project element\n' +
      '   - REJECT: projects where the research text makes clear the company\'s only role was supplying raw materials (concrete, aggregate, grain) with no on-site construction involvement\n' +
      '   - The project must describe a lower-emission construction approach (electric equipment, alternative fuels, solar/wind on-site, carbon capture, etc.)',

    'Environmental Constraints':
      '- Look for construction or mining projects with ANY of these three constraint types:\n' +
      '     1. Air Quality: strict air quality standards, low-emission zones, emissions limits on site\n' +
      '     2. Indoor/Enclosed/Underground: tunnels, parking garages, building interiors, basements, mines, warehouses\n' +
      '     3. Noise Sensitive: near hospitals, schools, offices, noise curfews, overnight/early morning work, wildlife preserves, dairy farms\n' +
      '   - Include past, current, and planned projects. Include projects where the company is a partner, contractor, or subcontractor\n' +
      '   - Do not restrict to any particular region or time period\n' +
      '   - If a project qualifies under multiple constraint types, include all that apply in the Constraint Type array\n' +
      '   - Do NOT use internal Caterpillar data — only public online sources\n' +
      '   - REJECT: equipment product pages, dealer inventory pages, or general company profile pages — these describe products for sale, not a specific project the company worked on\n' +
      '   - REJECT: projects that share a geographic or common noun name with the company but are clearly unrelated (verify the text actually links the company to the project)\n' +
      '   - The source must describe the company as performing, managing, or partnering on the specific project',
  };

  const categoryInstructions = CATEGORY_INSTRUCTIONS[subjectLabel] ?? '';

  return `You are a data extraction assistant. Extract structured information about "${company}" from the research text below.

Output ONLY a valid JSON array. Each element must match this schema — include one element per ${catConfig.itemLabel} found. If multiple found, include all as separate elements:
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
   - Return an empty array []
   - Do NOT write explanatory notes or filler records

3. SOURCE RULE: In the Source field, ONLY include URLs from the "Available URLs" list below.
   Do NOT add any URL that does not appear in the Available URLs list — any URL you invent will be removed automatically.
   Be inclusive — if a listed URL's page discusses the company's ${subjectLabel} activity even partially, include it.
   Only exclude listed URLs that are entirely unrelated to the company or ${subjectLabel}.

4. Country: infer from HQ location, state mentions, or context (e.g. "Iowa-based" → "United States")

5. Do NOT invent or hallucinate any data. Do NOT include explanations outside the JSON.

6. DATES: Use only specific dates or years explicitly stated. Do NOT fabricate date ranges.

7. COMPANY MATCH: Every record must be grounded in source text that connects "${company}" (or a recognizable short form, ticker, or parent/subsidiary name) to the specific activity. Discard records where the only connection is a coincidental name match (e.g. a project or place that shares a word with the company name but isn't about the company), or where all sources are about a completely different organization that happens to share an abbreviation or word. When in doubt about identity, keep the record but note the uncertainty in Comments.

Available URLs (only use ones with direct evidence):
${sourceUrls || '(none)'}

Research text:
---
${fullText.slice(0, 6000)}
---

Respond with ONLY the JSON array. If nothing found, return [].`;
}

function extractJsonArray(text) {
  // Try fenced code block first
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {}
  }
  // Try raw array
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    try {
      const parsed = JSON.parse(text.slice(arrStart, arrEnd + 1));
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {}
  }
  // Fallback: single object → wrap in array
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    try { return [JSON.parse(text.slice(objStart, objEnd + 1))]; } catch {}
  }
  return null;
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

// Reject domains that look like SEO spam / doorway pages: contain luxury brand names,
// gambling terms, or other patterns completely unrelated to construction/industry.
const SPAM_DOMAIN_PATTERNS = [
  /rolex/i, /luxury/i, /casino/i, /poker/i, /\bslot[s]?\b/i, /\bbet[s]?\b/i,
  /\bfashion\b/i, /\bjewel/i, /\bwatch(?:es)?\b/i, /\bperfume/i,
];

function isSpamDomain(url) {
  try {
    const domain = new URL(url).hostname;
    return SPAM_DOMAIN_PATTERNS.some(p => p.test(domain));
  } catch { return false; }
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function isAggregatorDomain(url) {
  const domain = getDomain(url);
  return [...AGGREGATOR_DOMAINS].some(d => domain === d || domain.endsWith('.' + d));
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
  const credibleSources = obj.Source.filter(url => !isAggregatorDomain(url));
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
    return { extracted: null, result: [] };
  }

  const prompt = buildExtractionPrompt(company, catConfig, fullText, sources);
  try {
    const raw = await extractWithLLM(prompt);
    const records = extractJsonArray(raw);
    if (!records || records.length === 0) {
      return { extracted: null, result: [] };
    }
    const normalized = normalizeRecords(records, company, catConfig, sourcesWithSnippets);
    return { extracted: normalized[0] || null, result: normalized };
  } catch {
    return { extracted: null, result: [] };
  }
}

// ── Node: enrich ──────────────────────────────────────────────────────────────

function needsEnrichment(extracted, catConfig) {
  if (!extracted) return true;
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
    const records = extractJsonArray(raw);
    if (!records || records.length === 0) return { enriched: true };

    const normalized = normalizeRecords(records, company, catConfig, allSnippets);
    return { result: normalized, sources: allSources, sourcesWithSnippets: allSnippets, enriched: true };
  } catch {
    return { enriched: true };
  }
}

// Replace "not specified", "N/A", "unknown", "n/a", "none", "not stated", "not available",
// "not found", "not disclosed", "not mentioned", "not provided" and similar with ""
const NA_PATTERN = /^\s*(not\s+(?:specified|stated|available|found|disclosed|mentioned|provided|applicable|known)|n\/?a|none|unknown|unspecified|not\s+applicable|not\s+given|tbd|tba|-+)[.\s]*$/i;

function sanitizeFieldValues(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'Net-Zero Target' || k === 'Company' || Array.isArray(v)) continue;
    if (typeof v === 'string' && NA_PATTERN.test(v)) obj[k] = '';
  }
}

// Normalize an array of extracted records: set Company, fix Source/Constraint Type arrays,
// verify snippets, clean up, and filter out truly empty records.
function normalizeRecords(records, company, catConfig, sourcesWithSnippets) {
  const normalized = records
    .filter(obj => obj && typeof obj === 'object')
    .map(obj => {
      obj.Company = company;
      if (!obj.Country) obj.Country = '';
      if (typeof obj.Source === 'string') obj.Source = obj.Source ? [obj.Source] : [];
      if (!Array.isArray(obj.Source)) obj.Source = [];
      if (catConfig.file === 'environmental_constraints') {
        if (typeof obj['Constraint Type'] === 'string') {
          obj['Constraint Type'] = obj['Constraint Type'] ? [obj['Constraint Type']] : [];
        }
        if (!Array.isArray(obj['Constraint Type'])) obj['Constraint Type'] = [];
      }
      sanitizeFieldValues(obj);
      verifySourcesBySnippet(company, obj, sourcesWithSnippets);
      cleanupRecord(obj, catConfig);
      return obj;
    })
    .filter(obj => hasRealDataFields(obj));
  return normalized;
}



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
      .then(s => {
        const r = s.result;
        return Array.isArray(r) ? r : (r ? [r] : []);
      })
      .catch(() => []);

  const allAttemptResults = await Promise.all(Array.from({ length: Math.max(1, runs) }, attempt));
  const allRecords = allAttemptResults.flat();

  if (allRecords.length === 0) return [catConfig.emptyRecord(company)];

  // Normalize a field value for deduplication: remove punctuation, sort words,
  // strip common filler words so minor phrasing differences don't create duplicates.
  // e.g. "South Fork Wind Farm" == "South Fork Wind" == "Wind Farm - South Fork"
  const DEDUP_FILLER = new Set([
    'the','a','an','and','or','of','in','at','for','to','on','by','with','from',
    'project','program','initiative','plan','pilot','phase','stage','scheme',
    'farm','park','plant','facility','complex','site','centre','center',
    'inc','llc','corp','ltd','group','co',
  ]);
  function normalizeKey(val) {
    return String(val || '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !DEDUP_FILLER.has(w))
      .sort()
      .join(' ');
  }
  const primaryKey = (r) => catConfig.keyFields
    .map(f => normalizeKey(r[f]))
    .join('||');

  const seen = new Map();
  for (const r of allRecords) {
    const key = primaryKey(r);
    const isBlank = !key.replace(/\|/g, '').trim();
    if (isBlank) continue;
    const existing = seen.get(key);
    if (!existing || scoreResult(r) > scoreResult(existing)) {
      seen.set(key, { ...r });
    }
    // Always union sources from all runs
    if (existing) {
      const existingSources = new Set(existing.Source || []);
      for (const url of (r.Source || [])) {
        if (!existingSources.has(url)) { existing.Source.push(url); existingSources.add(url); }
      }
      // For env constraints: union Constraint Type arrays across runs for the same project
      if (Array.isArray(existing['Constraint Type']) && Array.isArray(r['Constraint Type'])) {
        const ct = new Set(existing['Constraint Type']);
        for (const c of r['Constraint Type']) ct.add(c);
        existing['Constraint Type'] = [...ct];
      }
    }
  }

  const deduped = [...seen.values()];
  if (deduped.length === 0) return [catConfig.emptyRecord(company)];

  for (const r of deduped) await verifyFinancialClaims(r, company);
  return deduped;
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
        const count = Array.isArray(result) ? result.length : 1;
        console.log(`✓ (${count} record${count !== 1 ? 's' : ''})`);
        return { company, catKey, result };
      } catch (err) {
        console.log(`✗ ${err.message}`);
        return { company, catKey, result: [catConfig.emptyRecord(company)] };
      }
    })
  );

  // Group by category — each company contributes an array of records (one per result found)
  const byCategory = {};
  for (const catKey of categoryKeys) byCategory[catKey] = [];
  for (const { catKey, result } of results) {
    if (Array.isArray(result)) byCategory[catKey].push(...result);
    else byCategory[catKey].push(result);
  }

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
