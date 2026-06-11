import { NextRequest, NextResponse } from 'next/server';

const DEBUG = '[api/research-companies]';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SearchOutput {
  fullText: string;
  sources: Array<{ title: string; url: string }>;
  sourcesWithSnippets: SearchResult[];
}

// ── Category schemas (mirrors langgraph-5cat-research.mjs) ───────────────────

const CATEGORIES = {
  emissions: {
    label: 'Emissions Reductions',
    file: 'emissions_reductions',
    searchQuery: (c: string) =>
      `"${c}" carbon emissions reduction commitment net zero climate pledge science-based targets 2024 2025`,
    enrichQuery: (c: string) => `"${c}" headquarters country location founded`,
    dataEnrichQuery: (c: string) =>
      `"${c}" GHG greenhouse gas emissions target reduction sustainability report SBTi`,
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
    emptyRecord: (company: string) => ({
      Company: company,
      Country: '',
      'Emissions Reduction Target': '',
      'Target Year': '',
      'Baseline Year': '',
      'Pledge Year': '',
      'Net-Zero Target': false,
      Comments: '',
      Source: [] as string[],
    }),
  },

  investments: {
    label: 'Investments & Commitments',
    file: 'investments_commitments',
    searchQuery: (c: string) =>
      `"${c}" electrification infrastructure investment charging electric vehicles building renovation announced`,
    enrichQuery: (c: string) => `"${c}" headquarters country location founded`,
    dataEnrichQuery: (c: string) =>
      `"${c}" EV charging station electric vehicle fleet building renovation electrification investment announcement`,
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
    emptyRecord: (company: string) => ({
      Company: company,
      Country: '',
      'Investment Type': '',
      'Announcement Date': '',
      Description: '',
      Comments: '',
      Source: [] as string[],
    }),
  },

  purchases: {
    label: 'Machine Purchases',
    file: 'machine_purchases',
    searchQuery: (c: string) =>
      `"${c}" battery powered electric construction equipment purchase`,
    enrichQuery: (c: string) => `"${c}" headquarters country location founded`,
    dataEnrichQuery: (c: string) =>
      `"${c}" battery electric excavator loader dozer compactor paver construction machine purchase order`,
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
    emptyRecord: (company: string) => ({
      Company: company,
      Country: '',
      Manufacturer: '',
      'Machine Type': '',
      Model: '',
      Quantity: '',
      'Purchase Date': '',
      Comments: '',
      Source: [] as string[],
    }),
  },

  pilots: {
    label: 'Pilot Projects',
    file: 'pilot_projects',
    searchQuery: (c: string) =>
      `"${c}" solar wind renewable energy electric clean low-emission project construction 2024 2025`,
    enrichQuery: (c: string) => `"${c}" headquarters country location founded`,
    dataEnrichQuery: (c: string) =>
      `"${c}" clean energy renewable infrastructure project involvement contractor`,
    keyFields: ['Project Name', 'Project Type'],
    schema: `{
  "Company": "<company name>",
  "Country": "<country where company is headquartered>",
  "Project Name": "<name or short title of the pilot project>",
  "Project Type": "<e.g. Solar Farm, EV Fleet Trial, Carbon Capture, Battery Storage — extract from text>",
  "Involvement": "<company's role, e.g. Contractor, Owner, Partner>",
  "Lower Emissions Approach": "<specific technology or method used to reduce emissions>",
  "Electric Equipment & Manufacturer": "<any electric/low-emission equipment used and who made it>",
  "Project Description": "<detailed description of the project>",
  "Comments": "<timeline, outcomes, partners, scale>",
  "Source": ["<url1>", "<url2>"]
}`,
    emptyRecord: (company: string) => ({
      Company: company,
      Country: '',
      'Project Name': '',
      'Project Type': '',
      Involvement: '',
      'Lower Emissions Approach': '',
      'Electric Equipment & Manufacturer': '',
      'Project Description': '',
      Comments: '',
      Source: [] as string[],
    }),
  },

  environments: {
    label: 'Environmental Constraints',
    file: 'environmental_constraints',
    searchQuery: (c: string) =>
      `"${c}" construction project air quality indoor underground tunnel noise sensitive hospital school wildlife`,
    enrichQuery: (c: string) => `"${c}" headquarters country location founded`,
    dataEnrichQuery: (c: string) =>
      `"${c}" project air quality standards enclosed underground tunnel noise curfew sensitive area contractor`,
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
    emptyRecord: (company: string) => ({
      Company: company,
      Country: '',
      Project: '',
      'Constraint Type': [] as string[],
      'Project Date': '',
      Description: '',
      Comments: '',
      Source: [] as string[],
    }),
  },
} as const;

type Category = keyof typeof CATEGORIES;
type CatConfig = (typeof CATEGORIES)[Category];

// ── Utilities ─────────────────────────────────────────────────────────────────

function stripThinking(text: string): string {
  if (!text) return '';
  return text
    .replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<thinking[^>]*>[\s\S]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  // Try fenced code block first
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch {}
  }
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Returns true when the domain appears to belong to a DIFFERENT similarly-named entity.
// e.g. "zieglercompanies.com" for "ZIEGLER CAT" → true  ("companies" ∉ company name)
// e.g. "zieglercat.com"       for "ZIEGLER CAT" → false ("cat" ∈ company name)
function isAmbiguousDomain(url: string, company: string): boolean {
  const COMP_STOP = new Set(['inc', 'corp', 'co', 'llc', 'ltd', 'group', 'the', 'and', '&',
                              'sons', 'company', 'corporation', 'industries', 'services',
                              'agriservices', 'metals', 'products']);
  const URL_SUFFIX = new Set(['inc', 'corp', 'co', 'llc', 'ltd', 'grp', 'us']);
  const domainBase = getDomain(url).replace(/\.[a-z]{2,}(\.[a-z]{2})?$/, '');
  const compWords = company.toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length > 1 && !COMP_STOP.has(w));
  if (compWords.length === 0) return false;
  const firstKw = compWords[0];
  if (!domainBase.includes(firstKw)) return false;
  const remaining = domainBase.replace(firstKw, '').replace(/[^a-z]/g, '');
  if (!remaining) return false;
  if (URL_SUFFIX.has(remaining)) return false;
  if (compWords.some(w => remaining.includes(w) || w.includes(remaining))) return false;
  return true;
}

// Build keyword variants from a company name for snippet verification.
function companyKeywords(company: string): string[] {
  const STOP = new Set(['inc', 'corp', 'co', 'llc', 'ltd', 'group', 'the', 'and', '&', 'sons',
                        'company', 'corporation', 'industries', 'services', 'agriservices', 'metals']);
  const words = company.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const significant = words.filter(w => !STOP.has(w));
  const keywords: string[] = [];
  if (significant.length >= 2) keywords.push(significant.slice(0, 2).join(' '));
  if (significant.length >= 1) keywords.push(significant[0]);
  return keywords;
}

// 3-tier source verification: URL path → domain → snippet/title text
function verifySourcesBySnippet(
  company: string,
  obj: Record<string, unknown>,
  sourcesWithSnippets: SearchResult[]
): void {
  if (!Array.isArray(obj['Source']) || (obj['Source'] as string[]).length === 0) return;
  const keywords = companyKeywords(company);
  const snippetMap = new Map(
    sourcesWithSnippets.map(s => [s.url, `${s.title} ${s.snippet}`.toLowerCase()])
  );
  obj['Source'] = (obj['Source'] as string[]).filter((url: string) => {
    const snippetText = snippetMap.get(url) ?? '';
    if (!snippetText) return true; // Tier 1: no snippet → keep (benefit of the doubt)
    let urlPath = '';
    try { urlPath = new URL(url).pathname.toLowerCase(); } catch {}
    // Tier 2a: keyword in URL path (catches globenewswire.com/.../Harsco-... patterns)
    if (keywords.some(kw => urlPath.includes(kw.replace(/ /g, '')))) return true;
    // Tier 2b: keyword in domain AND domain unambiguously belongs to this company
    if (keywords.some(kw => getDomain(url).includes(kw)) && !isAmbiguousDomain(url, company)) return true;
    // Tier 3: keyword appears in snippet/title text
    return keywords.some(kw => snippetText.includes(kw));
  });
}

const SKIP_FIELDS = new Set(['Company', 'Country', 'Source', 'Comments']);

function hasRealDataFields(obj: Record<string, unknown>): boolean {
  return Object.entries(obj).some(([k, v]) => {
    if (SKIP_FIELDS.has(k)) return false;
    if (v === null || v === undefined || v === '' || v === false) return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
}

function wipeRecord(obj: Record<string, unknown>): void {
  for (const k of Object.keys(obj)) {
    if (k === 'Company' || k === 'Country') continue;
    if (Array.isArray(obj[k])) obj[k] = [];
    else if (typeof obj[k] === 'boolean') obj[k] = false;
    else obj[k] = '';
  }
}

function cleanupRecord(obj: Record<string, unknown>, catConfig: CatConfig): Record<string, unknown> {
  const hasAnyData = hasRealDataFields(obj);
  if (!hasAnyData) {
    obj['Comments'] = '';
    obj['Source']   = [];
    return obj;
  }
  // Hallucination guard: populated data MUST have at least one source URL
  const hasSources = Array.isArray(obj['Source']) && (obj['Source'] as string[]).length > 0;
  if (!hasSources) {
    wipeRecord(obj);
    return obj;
  }
  // For emissions: any goal field → Net-Zero Target must be true
  if ('Net-Zero Target' in obj) {
    const hasGoal = obj['Emissions Reduction Target'] || obj['Target Year'] ||
                    obj['Baseline Year'] || obj['Pledge Year'] || obj['Comments'];
    if (hasGoal) obj['Net-Zero Target'] = true;
  }
  // Rescue Quantity and Machine Type stranded in Comments
  if ('Quantity' in obj && !obj['Quantity'] && obj['Comments']) {
    const qMatch = (obj['Comments'] as string).match(
      /\b(\d[\d,+]*\+?)\s*(rebuilt|new|used|electric|hybrid)?\s*(unit|machine|truck|excavator|loader|grader|dozer|crane|drill|compactor|paver|scraper|roller)[s]?\b/i
    );
    if (qMatch) obj['Quantity'] = qMatch[1];
  }
  if ('Machine Type' in obj && !obj['Machine Type'] && obj['Comments']) {
    const mtMatch = (obj['Comments'] as string).match(
      /\b(\d[\d,+]*\+?\s+(?:rebuilt |new |used |electric |hybrid )?(unit|machine|truck|excavator|loader|grader|dozer|crane|drill|compactor|paver|scraper|roller)[s]?)\b/i
    );
    if (mtMatch) obj['Machine Type'] = mtMatch[2].charAt(0).toUpperCase() + mtMatch[2].slice(1);
  }
  void catConfig; // used for potential future per-category cleanup
  return obj;
}

// Score a result by richness — used to pick best result across multiple runs
function scoreResult(obj: Record<string, unknown>): number {
  let score = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP_FIELDS.has(k)) continue;
    if (v === null || v === undefined || v === '' || v === false) continue;
    if (Array.isArray(v)) { if (v.length > 0) score += v.length; continue; }
    if (typeof v === 'string') score += 1 + Math.floor(v.length / 100);
    else score++;
  }
  score += ((obj['Source'] as string[] | undefined)?.length ?? 0) * 3;
  return score;
}

// ── Financial claim verification ──────────────────────────────────────────────

const AGGREGATOR_DOMAINS = new Set([
  'cbinsights.com', 'datanyze.com', 'crunchbase.com', 'zoominfo.com',
  'pitchbook.com', 'dnb.com', 'mergr.com', 'owler.com', 'craft.co',
  'globaldata.com', 'manta.com', 'marketscreener.com',
]);

function extractDollarClaims(obj: Record<string, unknown>): Array<{ num: string; scale: string; raw: string }> {
  const claims: Array<{ num: string; scale: string; raw: string }> = [];
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

async function fetchPageText(url: string, maxLen = 4000): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLen);
  } catch {
    return '';
  }
}

async function verifyFinancialClaims(obj: Record<string, unknown>, company: string): Promise<void> {
  if (!Array.isArray(obj['Source']) || (obj['Source'] as string[]).length === 0) return;
  const claims = extractDollarClaims(obj);
  if (claims.length === 0) return;

  const credibleSources = (obj['Source'] as string[]).filter(
    url => !AGGREGATOR_DOMAINS.has(getDomain(url))
  );
  if (credibleSources.length === 0) {
    console.log(`${DEBUG} [${company}] Financial sources are aggregators — wiping`);
    wipeRecord(obj);
    return;
  }

  const pageTexts = await Promise.all(credibleSources.slice(0, 3).map(url => fetchPageText(url, 8000)));
  const fetchedAny = pageTexts.some(t => t.length > 200);

  if (!fetchedAny) {
    const hasUnambiguousSource = credibleSources.some(url => !isAmbiguousDomain(url, company));
    if (!hasUnambiguousSource) {
      console.log(`${DEBUG} [${company}] Source domains belong to a different company — wiping`);
      wipeRecord(obj);
    }
    return;
  }

  const combined = pageTexts.join(' ').toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ');
  const verified = claims.some(({ num, scale }) => {
    const escaped = num.replace('.', '\\.');
    return new RegExp(`${escaped}\\s*(?:${scale}|${scale[0]})\\b`, 'i').test(combined);
  });

  if (!verified) {
    console.log(`${DEBUG} [${company}] Claimed amounts (${claims.map(c => c.raw).join(', ')}) not on source pages — wiping`);
    wipeRecord(obj);
  }
}

// ── Nova grounding search ─────────────────────────────────────────────────────

// Per-category system prompts for Nova grounding — tells Nova exactly what to look for
const NOVA_SYSTEM_PROMPTS: Record<string, string> = {
  'Emissions Reductions':
    'You are researching greenhouse gas emission reduction pledges made by companies. ' +
    'Look for: emissions reduction targets (%, absolute), target years, baseline years, net-zero commitments, ' +
    'SBTi validation, CDP disclosures, and sustainability report commitments. ' +
    'Focus on the named company as a business — not law firms, financial advisors, or similarly-named organizations.',

  'Investments & Commitments':
    'You are researching electrification infrastructure investments announced by companies. ' +
    'Look for: investments in EV charging infrastructure, electric vehicle fleet purchases, ' +
    'building electrification or renovation, and related announced amounts and dates. ' +
    'Focus on the named company as a business — not law firms, financial advisors, or similarly-named organizations.',

  'Machine Purchases':
    'You are researching purchases of battery powered or electric construction equipment by companies. ' +
    'Look for: electric excavators, electric loaders, battery-powered dozers, electric compactors, ' +
    'electric pavers, or any zero-emission construction machinery — including manufacturer, model, quantity, and purchase date. ' +
    'Only use public online sources. ' +
    'Focus on the named company as a business — not law firms, financial advisors, or similarly-named organizations.',

  'Pilot Projects':
    'You are researching lower emission construction projects involving companies as owner, contractor, partner, or subcontractor. ' +
    'Look for: projects using electric equipment, solar or wind energy on-site, carbon capture, alternative fuels, ' +
    'or other approaches to reduce construction emissions. Only use public online sources. ' +
    'Focus on the named company as a business — not law firms, financial advisors, or similarly-named organizations.',

  'Environmental Constraints':
    'You are researching construction or mining projects involving companies that had any of these environmental constraints: ' +
    '(1) Areas with strict air quality standards or low-emission zones; ' +
    '(2) Indoor, enclosed, or underground sites such as tunnels, parking garages, building interiors, basements, mines, or warehouses; ' +
    '(3) Noise-sensitive areas such as near hospitals, schools, offices, projects with noise curfews, overnight/early morning work, wildlife preserves, or dairy farms. ' +
    'Include past, current, and planned projects. Include projects where the company is a partner, contractor, or subcontractor. ' +
    'Only use public online sources. ' +
    'Focus on the named company as a business — not law firms, financial advisors, or similarly-named organizations.',
};

async function novaGroundingSearch(
  query: string,
  industry: string,
  modelId: string,
  region: string,
  categoryLabel?: string,
): Promise<SearchOutput> {
  const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');
  const client = new BedrockRuntimeClient({ region });
  const profileId = /^(us|eu|ap)\./.test(modelId) ? modelId : `us.${modelId}`;

  const systemText = categoryLabel && NOVA_SYSTEM_PROMPTS[categoryLabel]
    ? NOVA_SYSTEM_PROMPTS[categoryLabel]
    : `You are researching companies in the ${industry} sector. Focus on the named company as a ${industry} business — not law firms, financial advisors, or similarly-named organizations.`;

  const command = new ConverseCommand({
    modelId: profileId,
    system: [{ text: systemText }],
    messages: [{ role: 'user', content: [{ text: `Search for: ${query}` }] }],
    toolConfig: { tools: [{ systemTool: { name: 'nova_grounding' } }] },
  });

  const resp = await client.send(command) as {
    output?: { message?: { content?: Array<Record<string, unknown>> } }
  };
  const items = resp?.output?.message?.content || [];

  let answerText = '';
  const rawCitations: Array<{ title: string; url: string; snippet: string }> = [];

  for (const item of items) {
    if (typeof item?.text === 'string') answerText += item.text + ' ';
    const citations = (item?.citationsContent as { citations?: unknown[] } | undefined)?.citations || [];
    for (const citation of citations as Array<Record<string, unknown>>) {
      const loc = citation?.location as Record<string, unknown> | undefined;
      const web = loc?.web as Record<string, unknown> | undefined;
      const url = web?.url as string | undefined;
      if (!url?.startsWith('http')) continue;
      const srcContent = citation?.sourceContent as Record<string, unknown> | undefined;
      const genPart = citation?.generatedResponsePart as Record<string, unknown> | undefined;
      const textPart = genPart?.textResponsePart as Record<string, unknown> | undefined;
      rawCitations.push({
        title:   (web?.title || web?.domain || url) as string,
        url,
        snippet: stripThinking((srcContent?.text || textPart?.text || '') as string),
      });
    }
  }

  const cleanAnswer = stripThinking(answerText);
  const seen = new Set<string>();
  const sources: Array<{ title: string; url: string }> = [];
  const sourcesWithSnippets: SearchResult[] = [];

  for (const c of rawCitations) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    sources.push({ title: c.title, url: c.url });
    sourcesWithSnippets.push({ title: c.title, url: c.url, snippet: c.snippet });
  }

  const snippetSeen = new Set<string>();
  const snippets = rawCitations
    .map(c => c.snippet)
    .filter(s => { if (!s || snippetSeen.has(s)) return false; snippetSeen.add(s); return true; });

  const fullText = [...snippets, cleanAnswer].filter(Boolean).join('\n\n');
  return { fullText, sources, sourcesWithSnippets };
}

// ── LLM extraction call ───────────────────────────────────────────────────────

// Per-category extraction instructions derived from user prompt templates
const CATEGORY_INSTRUCTIONS: Record<string, string> = {
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
    '   - If a project qualifies under multiple constraint types, use all that apply in the Constraint Type array\n' +
    '   - Do NOT use internal Caterpillar data — only public online sources',
};

function buildExtractionPrompt(
  company: string,
  catConfig: CatConfig,
  fullText: string,
  sources: Array<{ title: string; url: string }>
): string {
  const sourceUrls = sources.map(s => s.url).join('\n');
  const subjectLabel = catConfig.label;
  const categoryInstructions = CATEGORY_INSTRUCTIONS[subjectLabel] ?? '';
  return `You are a data extraction assistant. Extract structured information about "${company}" from the research text below.

Output ONLY a valid JSON object matching this schema exactly:
${catConfig.schema}

CATEGORY-SPECIFIC INSTRUCTIONS for ${subjectLabel}:
${categoryInstructions}

CRITICAL RULES — read carefully:

1. FIELD EXTRACTION: Extract every piece of data into its specific field.
   - If the text says "Iowa-based contractor" → set Country: "United States"
   - Do NOT summarize data into Comments that belongs in a specific field
   - Comments is ONLY for supplementary context that doesn't fit any other field
   - Numbers of units/machines/equipment ALWAYS go in Quantity, not Comments

2. NO-INFO RULE: If the research text does NOT contain ANY evidence of "${subjectLabel}" for this company:
   - Set ALL fields to empty ("", false, or []) EXCEPT Company and Country
   - Do NOT write explanatory notes like "no data found" into Comments
   - Set Source to [] (empty array)
   - Only apply this rule if the text is truly irrelevant or about a different company

3. SOURCE RULE: Include ALL Available URLs that contain relevant information about ${subjectLabel} for this company.
   Only exclude URLs entirely unrelated to the company or ${subjectLabel}.

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

async function extractWithLLM(
  company: string,
  catConfig: CatConfig,
  fullText: string,
  sources: Array<{ title: string; url: string }>,
  sourcesWithSnippets: SearchResult[],
  modelId: string,
  region: string
): Promise<Record<string, unknown>> {
  const emptyRecord = catConfig.emptyRecord(company) as Record<string, unknown>;
  if (!fullText.trim()) return emptyRecord;

  const prompt = buildExtractionPrompt(company, catConfig, fullText, sources);

  try {
    const profileId = /^(us|eu|ap)\./.test(modelId) ? modelId : `us.${modelId}`;
    const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const client = new BedrockRuntimeClient({ region });

    const command = new InvokeModelCommand({
      modelId: profileId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 1500, temperature: 0.1 },
      }),
    });

    const response = await client.send(command) as { body: Uint8Array };
    const raw = JSON.parse(new TextDecoder().decode(response.body)) as {
      output?: { message?: { content?: Array<{ text?: string }> } }
    };
    const rawText = raw?.output?.message?.content?.find(
      i => typeof i?.text === 'string'
    )?.text || '';

    const obj = extractJsonObject(stripThinking(rawText));
    if (!obj) return emptyRecord;

    obj['Company'] = company;
    if (typeof obj['Source'] === 'string') obj['Source'] = obj['Source'] ? [obj['Source']] : [];
    if (!Array.isArray(obj['Source'])) obj['Source'] = [];

    // Normalize Constraint Type for environments category
    if ('Constraint Type' in obj) {
      if (typeof obj['Constraint Type'] === 'string') {
        obj['Constraint Type'] = obj['Constraint Type'] ? [obj['Constraint Type']] : [];
      }
      if (!Array.isArray(obj['Constraint Type'])) obj['Constraint Type'] = [];
    }

    // Normalize booleans in string fields to ''
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'Net-Zero Target') continue;
      if ((v === false || v === null) && !Array.isArray(emptyRecord[k])) obj[k] = '';
    }

    verifySourcesBySnippet(company, obj, sourcesWithSnippets);
    cleanupRecord(obj, catConfig);
    return obj;
  } catch (error) {
    console.error(`${DEBUG} LLM extraction failed for ${company}/${catConfig.label}:`, error);
    return emptyRecord;
  }
}

// ── Single company × category research with enrichment + multi-run ────────────

async function researchOne(
  company: string,
  catKey: Category,
  industry: string,
  numRuns: number,
  modelId: string,
  region: string
): Promise<Record<string, unknown>> {
  const catConfig = CATEGORIES[catKey];
  const emptyRecord = catConfig.emptyRecord(company) as Record<string, unknown>;

  const attempt = async (): Promise<Record<string, unknown>> => {
    // Step 1: search
    let searchOut: SearchOutput;
    try {
      searchOut = await novaGroundingSearch(catConfig.searchQuery(company), industry, modelId, region, catConfig.label);
    } catch {
      return emptyRecord;
    }

    // Step 2: extract
    let extracted = await extractWithLLM(
      company, catConfig, searchOut.fullText, searchOut.sources, searchOut.sourcesWithSnippets, modelId, region
    );

    // Step 3: enrich if Country missing or no data fields found
    const needsEnrichment = !extracted['Country'] || !hasRealDataFields(extracted);
    if (needsEnrichment) {
      const enrichQuery = !extracted['Country']
        ? catConfig.enrichQuery(company)
        : catConfig.dataEnrichQuery(company);
      try {
        const enrichOut = await novaGroundingSearch(enrichQuery, industry, modelId, region, catConfig.label);
        if (enrichOut.fullText.trim()) {
          const allSources = [...searchOut.sources];
          const allSnippets = [...searchOut.sourcesWithSnippets];
          const seenUrls = new Set(searchOut.sources.map(s => s.url));
          for (const s of enrichOut.sources) {
            if (!seenUrls.has(s.url)) { allSources.push(s); seenUrls.add(s.url); }
          }
          for (const s of enrichOut.sourcesWithSnippets) {
            if (!allSnippets.find(x => x.url === s.url)) allSnippets.push(s);
          }
          const combinedText = [searchOut.fullText, enrichOut.fullText].filter(Boolean).join('\n\n');
          extracted = await extractWithLLM(company, catConfig, combinedText, allSources, allSnippets, modelId, region);
        }
      } catch {
        // enrichment failed — keep original
      }
    }

    return extracted;
  };

  if (numRuns <= 1) {
    const result = await attempt();
    await verifyFinancialClaims(result, company);
    return result;
  }

  // Run all attempts in parallel for non-determinism coverage
  const attempts = await Promise.all(Array.from({ length: numRuns }, attempt));

  // Pick highest-scoring result as base; backfill empty fields from other sourced runs
  const sorted = [...attempts].sort((a, b) => scoreResult(b) - scoreResult(a));
  const best: Record<string, unknown> = { ...sorted[0] };

  for (const candidate of sorted.slice(1)) {
    if (!((candidate['Source'] as string[] | undefined)?.length)) continue;
    for (const [k, v] of Object.entries(candidate)) {
      if (k === 'Company' || k === 'Country') continue;
      if (k === 'Source') {
        const existing = new Set(best['Source'] as string[]);
        for (const url of (v as string[] | undefined) ?? []) {
          if (!existing.has(url)) (best['Source'] as string[]).push(url);
        }
        continue;
      }
      const bestVal = best[k];
      const isEmpty = bestVal === '' || bestVal === false || bestVal === null ||
                      bestVal === undefined || (Array.isArray(bestVal) && bestVal.length === 0);
      if (isEmpty && v && v !== '' && v !== false) best[k] = v;
    }
  }

  await verifyFinancialClaims(best, company);
  return best;
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    let companies: string[] = [];
    if (Array.isArray(body?.companies)) {
      companies = body.companies
        .map((c: string | { name?: string }) => {
          if (typeof c === 'string') return c;
          if (typeof c === 'object' && c?.name) return c.name;
          return null;
        })
        .filter(Boolean);
    }

    const industry: string = typeof body?.industry === 'string' && body.industry
      ? body.industry
      : 'construction infrastructure materials heavy industry';
    const numRuns: number = Math.max(1, parseInt(body?.runs ?? '2', 10));

    const modelId = process.env.BEDROCK_RESEARCH_MODEL_ID || process.env.BEDROCK_MODEL_ID || 'amazon.nova-premier-v1:0';
    const region  = process.env.AWS_REGION || 'us-east-1';

    console.log(`${DEBUG} POST request`, {
      companiesCount: companies.length,
      companies: companies.slice(0, 4),
      industry,
      numRuns,
      modelId,
    });

    if (companies.length === 0) {
      console.warn(`${DEBUG} No companies provided`);
      return NextResponse.json(
        { success: false, error: 'No companies provided' },
        { status: 400 }
      );
    }

    console.log(`${DEBUG} Starting 5-category research for ${companies.length} companies (${numRuns} run(s) each)`);

    const categories: Category[] = ['emissions', 'investments', 'purchases', 'pilots', 'environments'];

    // Research all companies × categories in parallel
    const tasks = companies.flatMap(company =>
      categories.map(catKey => ({ company, catKey }))
    );

    const results = await Promise.all(
      tasks.map(({ company, catKey }) =>
        researchOne(company, catKey, industry, numRuns, modelId, region)
          .catch(() => CATEGORIES[catKey].emptyRecord(company) as Record<string, unknown>)
      )
    );

    // Group results back by category
    const reports: Record<Category, object[]> = {
      emissions: [], investments: [], purchases: [], pilots: [], environments: [],
    };
    results.forEach((record, i) => {
      reports[tasks[i].catKey].push(record);
    });

    const hasAnyResults = categories.some(cat =>
      reports[cat].some(record =>
        Object.entries(record as Record<string, unknown>).some(([k, v]) => {
          if (k === 'Company' || k === 'Country' || k === 'Source' || k === 'Comments') return false;
          if (Array.isArray(v)) return v.length > 0;
          return v !== '' && v !== false && v !== null && v !== undefined;
        })
      )
    );

    console.log(`${DEBUG} Research complete`, { companiesCount: companies.length, hasAnyResults });

    return NextResponse.json({
      success: true,
      uploadedFiles: 0,
      researchId: crypto.randomUUID(),
      companiesResearched: companies.length,
      hasAnyResults,
      results: reports,
      message: hasAnyResults
        ? `Research completed for ${companies.length} companies across 5 categories`
        : `Research completed, but no sources were found for ${companies.length} companies`,
    });
  } catch (error) {
    console.error(`${DEBUG} POST request failed:`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'Research request failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
