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
    itemLabel: 'emissions reduction pledge',
    searchQuery: (c: string) =>
      `"${c}" carbon emissions reduction commitment net zero climate pledge science-based targets 2024 2025`,
    enrichQuery: (c: string) => `"${c}" headquarters country location founded`,
    dataEnrichQuery: (c: string) =>
      `"${c}" GHG greenhouse gas emissions target reduction sustainability report SBTi`,
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
    itemLabel: 'electrification infrastructure investment',
    searchQuery: (c: string) =>
      `"${c}" electric vehicle EV fleet charging infrastructure electrification investment sustainability capital announced`,
    enrichQuery: (c: string) => `"${c}" headquarters country location founded`,
    dataEnrichQuery: (c: string) =>
      `"${c}" electric vehicle fleet EV charging station building renovation electrification investment sustainability announcement`,
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
    itemLabel: 'battery-powered machine purchase',
    searchQuery: (c: string) =>
      `"${c}" battery electric zero-emission construction equipment excavator loader dozer compactor machine purchase fleet`,
    enrichQuery: (c: string) => `"${c}" headquarters country location founded`,
    dataEnrichQuery: (c: string) =>
      `"${c}" electric battery zero emission excavator loader dozer grader compactor paver scraper drill machine order purchase`,
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
    itemLabel: 'lower-emission construction project',
    searchQuery: (c: string) =>
      `"${c}" solar wind renewable energy electric clean low-emission project construction 2024 2025`,
    enrichQuery: (c: string) => `"${c}" headquarters country location founded`,
    dataEnrichQuery: (c: string) =>
      `"${c}" clean energy renewable infrastructure project involvement contractor`,
    keyFields: ['Project Name'],
    schema: `[{
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
}]`,
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
    itemLabel: 'construction or mining project with environmental constraints',
    searchQuery: (c: string) =>
      `"${c}" construction project air quality indoor underground tunnel noise sensitive hospital school wildlife`,
    enrichQuery: (c: string) => `"${c}" headquarters country location founded`,
    dataEnrichQuery: (c: string) =>
      `"${c}" project air quality standards enclosed underground tunnel noise curfew sensitive area contractor`,
    keyFields: ['Project'],
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

function extractJsonArray(text: string): Record<string, unknown>[] | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {}
  }
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

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function isAggregatorDomain(url: string): boolean {
  const domain = getDomain(url);
  return [...AGGREGATOR_DOMAINS].some(d => domain === d || domain.endsWith('.' + d));
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
    // Pre-filter: remove spam domains outright
    if (isSpamDomain(url)) return false;

    const snippetText = snippetMap.get(url) ?? '';
    if (!snippetText) return true; // Tier 1: no snippet → keep (benefit of the doubt)
    let urlPath = '';
    try { urlPath = new URL(url).pathname.toLowerCase(); } catch {}
    // Tier 2a: keyword in URL path (catches globenewswire.com/.../Harsco-... patterns)
    if (keywords.some(kw => urlPath.includes(kw.replace(/ /g, '')))) return true;
    // Tier 2b: keyword in domain AND domain unambiguously belongs to this company
    if (keywords.some(kw => getDomain(url).includes(kw)) && !isAmbiguousDomain(url, company)) return true;
    // Tier 3: whole-word match in snippet/title so "andersons" ≠ "anderson"
    return keywords.some(kw => {
      const pattern = new RegExp(`\\b${kw.replace(/ /g, '[\\s\\-]+')}\\b`);
      return pattern.test(snippetText);
    });
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

const SPAM_DOMAIN_PATTERNS = [
  /rolex/i, /luxury/i, /casino/i, /poker/i, /\bslot[s]?\b/i, /\bbet[s]?\b/i,
  /\bfashion\b/i, /\bjewel/i, /\bwatch(?:es)?\b/i, /\bperfume/i,
];

function isSpamDomain(url: string): boolean {
  try {
    const domain = new URL(url).hostname;
    return SPAM_DOMAIN_PATTERNS.some(p => p.test(domain));
  } catch { return false; }
}

const NA_PATTERN = /^\s*(not\s+(?:specified|stated|available|found|disclosed|mentioned|provided|applicable|known)|n\/?a|none|unknown|unspecified|not\s+applicable|not\s+given|tbd|tba|-+)[.\s]*$/i;

function sanitizeFieldValues(obj: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'Net-Zero Target' || k === 'Company' || Array.isArray(v)) continue;
    if (typeof v === 'string' && NA_PATTERN.test(v)) obj[k] = '';
  }
}

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
    url => !isAggregatorDomain(url)
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

// Per-category system prompts for Nova grounding — exact content from prompts/ folder (minus the opening "Here is a list of lists" line)
const NOVA_SYSTEM_PROMPTS: Record<string, string> = {
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

  // Nova interleaves `text` and `citationsContent` items. The `text` segment
  // immediately preceding a `citationsContent` block is the grounded excerpt
  // for those cited URLs (sourceContent is absent in this API version).
  const rawCitations: Array<{ title: string; url: string; snippet: string }> = [];
  let lastText = '';

  for (const item of items) {
    if (typeof item?.text === 'string') {
      lastText = stripThinking(item.text as string);
      continue;
    }
    const citations = (item?.citationsContent as { citations?: unknown[] } | undefined)?.citations || [];
    if (citations.length > 0) {
      const snippet = lastText;
      lastText = '';
      for (const citation of citations as Array<Record<string, unknown>>) {
        const loc = citation?.location as Record<string, unknown> | undefined;
        const web = loc?.web as Record<string, unknown> | undefined;
        const url = web?.url as string | undefined;
        if (!url?.startsWith('http')) continue;
        const srcContent = citation?.sourceContent as Record<string, unknown> | undefined;
        const genPart = citation?.generatedResponsePart as Record<string, unknown> | undefined;
        const textPart = genPart?.textResponsePart as Record<string, unknown> | undefined;
        const fallback = stripThinking((srcContent?.text || textPart?.text || '') as string);
        rawCitations.push({
          title:   (web?.title || web?.domain || url) as string,
          url,
          snippet: snippet || fallback,
        });
      }
    }
  }

  // Deduplicate by URL, keeping the longest snippet per URL
  const byUrl = new Map<string, { title: string; url: string; snippet: string }>();
  for (const c of rawCitations) {
    const existing = byUrl.get(c.url);
    if (!existing || c.snippet.length > existing.snippet.length) byUrl.set(c.url, c);
  }
  const deduped = [...byUrl.values()];

  const sources: Array<{ title: string; url: string }> = deduped.map(c => ({ title: c.title, url: c.url }));
  const sourcesWithSnippets: SearchResult[] = deduped;

  const snippetSeen = new Set<string>();
  const snippets = deduped
    .map(c => c.snippet)
    .filter(s => { if (!s || snippetSeen.has(s)) return false; snippetSeen.add(s); return true; });

  // Use only grounded web snippets for extraction — Nova's synthesized answer text
  // is excluded because it may contain hallucinated content when real sources are sparse.
  const fullText = snippets.filter(Boolean).join('\n\n');
  return { fullText, sources, sourcesWithSnippets };
}

// ── LLM extraction call ───────────────────────────────────────────────────────

// Per-category extraction instructions derived from user prompt templates
const CATEGORY_INSTRUCTIONS: Record<string, string> = {
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
    '   - If a project qualifies under multiple constraint types, use all that apply in the Constraint Type array\n' +
    '   - Do NOT use internal Caterpillar data — only public online sources\n' +
    '   - REJECT: equipment product pages, dealer inventory pages, or general company profile pages — these describe products for sale, not a specific project the company worked on\n' +
    '   - REJECT: projects that share a geographic or common noun name with the company but are clearly unrelated (verify the text actually links the company to the project)\n' +
    '   - The source must describe the company as performing, managing, or partnering on the specific project',
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

Output ONLY a valid JSON array. Each element must match this schema — include one element per ${(catConfig as Record<string, unknown>).itemLabel} found. If multiple found, include all as separate elements:
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

function normalizeRecords(
  records: Record<string, unknown>[],
  company: string,
  catConfig: CatConfig,
  sourcesWithSnippets: SearchResult[]
): Record<string, unknown>[] {
  const emptyRecord = catConfig.emptyRecord(company) as Record<string, unknown>;
  return records
    .filter(obj => obj && typeof obj === 'object')
    .map(obj => {
      obj['Company'] = company;
      if (!obj['Country']) obj['Country'] = '';
      if (typeof obj['Source'] === 'string') obj['Source'] = obj['Source'] ? [obj['Source']] : [];
      if (!Array.isArray(obj['Source'])) obj['Source'] = [];
      if ('Constraint Type' in obj) {
        if (typeof obj['Constraint Type'] === 'string') {
          obj['Constraint Type'] = obj['Constraint Type'] ? [obj['Constraint Type']] : [];
        }
        if (!Array.isArray(obj['Constraint Type'])) obj['Constraint Type'] = [];
      }
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'Net-Zero Target') continue;
        if ((v === false || v === null) && !Array.isArray(emptyRecord[k])) obj[k] = '';
      }
      sanitizeFieldValues(obj);
      verifySourcesBySnippet(company, obj, sourcesWithSnippets);
      cleanupRecord(obj, catConfig);
      return obj;
    })
    .filter(obj => hasRealDataFields(obj));
}

async function extractWithLLM(
  company: string,
  catConfig: CatConfig,
  fullText: string,
  sources: Array<{ title: string; url: string }>,
  sourcesWithSnippets: SearchResult[],
  modelId: string,
  region: string
): Promise<Record<string, unknown>[]> {
  if (!fullText.trim()) return [];

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
        inferenceConfig: { maxTokens: 2048, temperature: 0.1 },
      }),
    });

    const response = await client.send(command) as { body: Uint8Array };
    const raw = JSON.parse(new TextDecoder().decode(response.body)) as {
      output?: { message?: { content?: Array<{ text?: string }> } }
    };
    const rawText = raw?.output?.message?.content?.find(
      i => typeof i?.text === 'string'
    )?.text || '';

    const records = extractJsonArray(stripThinking(rawText));
    if (!records || records.length === 0) return [];

    return normalizeRecords(records, company, catConfig, sourcesWithSnippets);
  } catch (error) {
    console.error(`${DEBUG} LLM extraction failed for ${company}/${catConfig.label}:`, error);
    return [];
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
): Promise<Record<string, unknown>[]> {
  const catConfig = CATEGORIES[catKey];

  const attempt = async (): Promise<Record<string, unknown>[]> => {
    let searchOut: SearchOutput;
    try {
      searchOut = await novaGroundingSearch(catConfig.searchQuery(company), industry, modelId, region, catConfig.label);
    } catch {
      return [];
    }

    let extracted = await extractWithLLM(
      company, catConfig, searchOut.fullText, searchOut.sources, searchOut.sourcesWithSnippets, modelId, region
    );

    const needsEnrichment = extracted.length === 0 || !extracted[0]?.['Country'];
    if (needsEnrichment) {
      const enrichQuery = extracted.length === 0
        ? catConfig.dataEnrichQuery(company)
        : catConfig.enrichQuery(company);
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

  const allAttemptResults = await Promise.all(Array.from({ length: Math.max(1, numRuns) }, attempt));
  const allRecords = allAttemptResults.flat();

  if (allRecords.length === 0) return [catConfig.emptyRecord(company) as Record<string, unknown>];

  const DEDUP_FILLER = new Set([
    'the','a','an','and','or','of','in','at','for','to','on','by','with','from',
    'project','program','initiative','plan','pilot','phase','stage','scheme',
    'farm','park','plant','facility','complex','site','centre','center',
    'inc','llc','corp','ltd','group','co',
  ]);
  const normalizeKey = (val: unknown): string =>
    String(val || '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !DEDUP_FILLER.has(w))
      .sort()
      .join(' ');

  const primaryKey = (r: Record<string, unknown>) => catConfig.keyFields
    .map(f => normalizeKey(r[f]))
    .join('||');

  const seen = new Map<string, Record<string, unknown>>();
  for (const r of allRecords) {
    const key = primaryKey(r);
    if (!key.replace(/\|/g, '').trim()) continue;
    const existing = seen.get(key);
    if (!existing || scoreResult(r) > scoreResult(existing)) {
      seen.set(key, { ...r });
    }
    if (existing) {
      const existingSources = new Set(existing['Source'] as string[]);
      for (const url of (r['Source'] as string[] | undefined) ?? []) {
        if (!existingSources.has(url)) { (existing['Source'] as string[]).push(url); existingSources.add(url); }
      }
      // For env constraints: union Constraint Type arrays across runs for the same project
      if (Array.isArray(existing['Constraint Type']) && Array.isArray(r['Constraint Type'])) {
        const ct = new Set(existing['Constraint Type'] as string[]);
        for (const c of r['Constraint Type'] as string[]) ct.add(c);
        existing['Constraint Type'] = [...ct];
      }
    }
  }

  const deduped = [...seen.values()];
  if (deduped.length === 0) return [catConfig.emptyRecord(company) as Record<string, unknown>];

  for (const r of deduped) await verifyFinancialClaims(r, company);
  return deduped;
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
          .catch(() => [CATEGORIES[catKey].emptyRecord(company) as Record<string, unknown>])
      )
    );

    // Group results back by category — each company contributes an array of flat records
    const reports: Record<Category, object[]> = {
      emissions: [], investments: [], purchases: [], pilots: [], environments: [],
    };
    results.forEach((records, i) => {
      const arr = Array.isArray(records) ? records : [records];
      arr.forEach(r => reports[tasks[i].catKey].push(r));
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
