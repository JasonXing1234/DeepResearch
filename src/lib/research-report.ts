// Shared helpers to turn raw research results (emissions/investments/purchases/
// pilots/environments) into the two flattened row shapes used across exports:
//   - "details" rows: one row per company per attribute (mirrors the "Original"
//     Excel sheet, and AI_LEADS_PROFILES_DETAILS in Snowflake)
//   - "summary" rows: one row per company (mirrors the "Normalized" Excel
//     sheet, and AI_LEADS_PROFILES_SUMMARY in Snowflake)

export type CategoryKey = 'emissions' | 'investments' | 'purchases' | 'pilots' | 'environments';
export type ResearchResults = Record<CategoryKey, Record<string, unknown>[]>;

export const SUMMARY_ATTRIBUTES = [
  'Commitment to Reduce',
  'Net-zero target',
  'Pilot',
  'Investment announced',
  'Equipment purchased',
  'Project environment/constraints',
] as const;

export interface DetailRow {
  Customer: string;
  Country: string;
  Attribute: string;
  'Yes/No': string;
  Text: string;
  Source: string;
  URL: string;
}

export interface SummaryRow {
  Customer: string;
  Country: string;
  'Commitment to Reduce': string;
  'Net-zero target': string;
  Pilot: string;
  'Investment announced': string;
  'Equipment purchased': string;
  'Project environment/constraints': string;
}

function normalizeCompany(name: string): string {
  if (!name) return '';
  return name.normalize('NFKD').replace(/[^\x00-\x7F]/g, '').trim().replace(/\s+/g, ' ');
}

function hasAnyValue(rec: Record<string, unknown>, fields: string[]): boolean {
  for (const field of fields) {
    const v = rec[field];
    if (typeof v === 'boolean') { if (v) return true; }
    else if (v !== null && v !== undefined && String(v).trim() !== '') return true;
  }
  return false;
}

function blobHas(pattern: RegExp, ...vals: unknown[]): boolean {
  return pattern.test(vals.map(v => (v ? String(v) : '')).join(' ').toLowerCase());
}

function extractUrls(rec: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const key of ['Source', 'Sources', 'Source URLs', 'SourceURLs', 'Comments']) {
    const v = rec[key];
    const raw = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
    for (const item of raw) {
      const matches = item.match(/https?:\/\/[^\s)\]>}"',<>]+/g) ?? [];
      for (const url of matches) {
        if (!seen.has(url)) { seen.add(url); urls.push(url); }
      }
    }
  }
  return urls;
}

function collectSourceText(rec: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ['Source', 'Sources', 'Source URLs', 'SourceURLs']) {
    const v = rec[key];
    if (v === null || v === undefined) continue;
    const s = Array.isArray(v)
      ? v.map(x => String(x).trim()).filter(Boolean).join('; ')
      : String(v).trim();
    if (s) parts.push(`${key}: ${s}`);
  }
  return parts.join('; ');
}

function kvJoin(rec: Record<string, unknown>, keys: string[]): string {
  return keys
    .map(k => { const v = rec[k]; return v !== null && v !== undefined && String(v).trim() ? `${k}: ${String(v).trim()}` : null; })
    .filter(Boolean)
    .join('; ');
}

function detectEmissions(rec: Record<string, unknown>) {
  const commitFields = ['Emissions Reduction Target', 'Target Year', 'Baseline Year', 'Pledge Year', 'Comments'];
  const commitment = hasAnyValue(rec, [...commitFields, 'Source', 'Sources']);
  const nzField = rec['Net-Zero Target'];
  const netZero = typeof nzField === 'boolean'
    ? nzField
    : blobHas(/\bnet[-\s]?zero\b/i, rec['Comments'], rec['Emissions Reduction Target']);
  return {
    'Commitment to Reduce': commitment,
    'Net-zero target': netZero,
    Text: kvJoin(rec, ['Emissions Reduction Target', 'Target Year', 'Baseline Year', 'Pledge Year', 'Comments']),
    Source: collectSourceText(rec),
    URL: extractUrls(rec).join('; '),
  };
}

function detectInvestment(rec: Record<string, unknown>) {
  const has = hasAnyValue(rec, ['Investment Type', 'Announcement Date', 'Description', 'Comments', 'Source', 'Sources']);
  return {
    'Investment announced': has,
    Text: kvJoin(rec, ['Investment Type', 'Announcement Date', 'Description', 'Comments']),
    Source: collectSourceText(rec),
    URL: extractUrls(rec).join('; '),
  };
}

function detectPurchase(rec: Record<string, unknown>) {
  const anyFields = ['Manufacturer', 'MachineType', 'Machine Type', 'Model', 'Quantity', 'PurchaseDate', 'Purchase Date', 'Comments'];
  const has = hasAnyValue(rec, [...anyFields, 'Source', 'Sources']);
  return {
    'Equipment purchased': has,
    Text: kvJoin(rec, ['Manufacturer', 'Machine Type', 'MachineType', 'Model', 'Quantity', 'Purchase Date', 'PurchaseDate', 'Comments']),
    Source: collectSourceText(rec),
    URL: extractUrls(rec).join('; '),
  };
}

function detectPilot(rec: Record<string, unknown>) {
  const anyFields = [
    'Project Name', 'Project Type', 'Involvement',
    'Lower Emissions Approach', 'Lower Emission Approach',
    'Equipment', 'Electric Equipment & Manufacturer',
    'Project Description', 'Comments',
  ];
  const has = hasAnyValue(rec, [...anyFields, 'Source', 'Sources']);
  return {
    Pilot: has,
    Text: kvJoin(rec, anyFields),
    Source: collectSourceText(rec),
    URL: extractUrls(rec).join('; '),
  };
}

function detectEnvironment(rec: Record<string, unknown>) {
  const anyFields = ['Project', 'constraint type', 'Project date', 'Description', 'Comments'];
  const has = hasAnyValue(rec, [...anyFields, 'Source', 'Sources']);
  return {
    'Project environment/constraints': has,
    Text: kvJoin(rec, anyFields),
    Source: collectSourceText(rec),
    URL: extractUrls(rec).join('; '),
  };
}

/**
 * Flattens raw research results into the "details" (one row per
 * company/attribute) and "summary" (one row per company) shapes shared by
 * the Excel and Snowflake exports.
 */
export function buildResearchRows(results: ResearchResults): { detailRows: DetailRow[]; summaryRows: SummaryRow[] } {
  const emissions    = results.emissions    ?? [];
  const investments  = results.investments  ?? [];
  const purchases    = results.purchases    ?? [];
  const pilots       = results.pilots       ?? [];
  const environments = results.environments ?? [];

  const detailRows: DetailRow[] = [];

  for (const rec of emissions) {
    const company = normalizeCompany(String(rec.Company ?? ''));
    if (!company) continue;
    const det = detectEmissions(rec);
    const country = String(rec.Country ?? '');
    detailRows.push({ Customer: company, Country: country, Attribute: 'Commitment to Reduce', 'Yes/No': det['Commitment to Reduce'] ? 'Yes' : 'No', Text: det.Text, Source: det.Source, URL: det.URL });
    detailRows.push({ Customer: company, Country: country, Attribute: 'Net-zero target',      'Yes/No': det['Net-zero target']      ? 'Yes' : 'No', Text: det.Text, Source: det.Source, URL: det.URL });
  }
  for (const rec of investments) {
    const company = normalizeCompany(String(rec.Company ?? ''));
    if (!company) continue;
    const det = detectInvestment(rec);
    detailRows.push({ Customer: company, Country: String(rec.Country ?? ''), Attribute: 'Investment announced', 'Yes/No': det['Investment announced'] ? 'Yes' : 'No', Text: det.Text, Source: det.Source, URL: det.URL });
  }
  for (const rec of purchases) {
    const company = normalizeCompany(String(rec.Company ?? ''));
    if (!company) continue;
    const det = detectPurchase(rec);
    detailRows.push({ Customer: company, Country: String(rec.Country ?? ''), Attribute: 'Equipment purchased', 'Yes/No': det['Equipment purchased'] ? 'Yes' : 'No', Text: det.Text, Source: det.Source, URL: det.URL });
  }
  for (const rec of pilots) {
    const company = normalizeCompany(String(rec.Company ?? ''));
    if (!company) continue;
    const det = detectPilot(rec);
    detailRows.push({ Customer: company, Country: String(rec.Country ?? ''), Attribute: 'Pilot', 'Yes/No': det.Pilot ? 'Yes' : 'No', Text: det.Text, Source: det.Source, URL: det.URL });
  }
  for (const rec of environments) {
    const company = normalizeCompany(String(rec.Company ?? ''));
    if (!company) continue;
    const det = detectEnvironment(rec);
    detailRows.push({ Customer: company, Country: String(rec.Country ?? ''), Attribute: 'Project environment/constraints', 'Yes/No': det['Project environment/constraints'] ? 'Yes' : 'No', Text: det.Text, Source: det.Source, URL: det.URL });
  }

  detailRows.sort((a, b) => {
    if (a.Customer !== b.Customer) return a.Customer.localeCompare(b.Customer);
    return a.Attribute.localeCompare(b.Attribute);
  });

  const companyMeta: Record<string, { country: string; attrs: Record<string, boolean> }> = {};
  for (const row of detailRows) {
    if (!companyMeta[row.Customer]) companyMeta[row.Customer] = { country: row.Country, attrs: {} };
    if (row['Yes/No'] === 'Yes') companyMeta[row.Customer].attrs[row.Attribute] = true;
    else if (!companyMeta[row.Customer].attrs[row.Attribute]) companyMeta[row.Customer].attrs[row.Attribute] = false;
  }

  const summaryRows: SummaryRow[] = Object.keys(companyMeta).sort().map(company => {
    const row = { Customer: company, Country: companyMeta[company].country } as SummaryRow;
    for (const attr of SUMMARY_ATTRIBUTES) row[attr] = companyMeta[company].attrs[attr] ? 'Yes' : 'No';
    return row;
  });

  return { detailRows, summaryRows };
}
