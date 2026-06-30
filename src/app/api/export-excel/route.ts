import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

type CategoryKey = 'emissions' | 'investments' | 'purchases' | 'pilots' | 'environments';
type ResearchResults = Record<CategoryKey, Record<string, unknown>[]>;

// ─── Helpers (mirrors scripts/convert-research-to-excel.mjs) ─────────────────

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

// ─── Detect functions ─────────────────────────────────────────────────────────

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

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { results: ResearchResults; filename?: string };
    const { results, filename = 'research_results' } = body;

    if (!results) {
      return NextResponse.json({ success: false, error: 'results is required' }, { status: 400 });
    }

    const emissions    = results.emissions    ?? [];
    const investments  = results.investments  ?? [];
    const purchases    = results.purchases    ?? [];
    const pilots       = results.pilots       ?? [];
    const environments = results.environments ?? [];

    const originalRows: Record<string, unknown>[] = [];

    for (const rec of emissions) {
      const company = normalizeCompany(String(rec.Company ?? ''));
      if (!company) continue;
      const det = detectEmissions(rec);
      originalRows.push({ Customer: company, Country: rec.Country ?? '', Attribute: 'Commitment to Reduce', 'Yes/No': det['Commitment to Reduce'] ? 'Yes' : 'No', ...det });
      originalRows.push({ Customer: company, Country: rec.Country ?? '', Attribute: 'Net-zero target',      'Yes/No': det['Net-zero target']      ? 'Yes' : 'No', ...det });
    }
    for (const rec of investments) {
      const company = normalizeCompany(String(rec.Company ?? ''));
      if (!company) continue;
      const det = detectInvestment(rec);
      originalRows.push({ Customer: company, Country: rec.Country ?? '', Attribute: 'Investment announced', 'Yes/No': det['Investment announced'] ? 'Yes' : 'No', ...det });
    }
    for (const rec of purchases) {
      const company = normalizeCompany(String(rec.Company ?? ''));
      if (!company) continue;
      const det = detectPurchase(rec);
      originalRows.push({ Customer: company, Country: rec.Country ?? '', Attribute: 'Equipment purchased', 'Yes/No': det['Equipment purchased'] ? 'Yes' : 'No', ...det });
    }
    for (const rec of pilots) {
      const company = normalizeCompany(String(rec.Company ?? ''));
      if (!company) continue;
      const det = detectPilot(rec);
      originalRows.push({ Customer: company, Country: rec.Country ?? '', Attribute: 'Pilot', 'Yes/No': det.Pilot ? 'Yes' : 'No', ...det });
    }
    for (const rec of environments) {
      const company = normalizeCompany(String(rec.Company ?? ''));
      if (!company) continue;
      const det = detectEnvironment(rec);
      originalRows.push({ Customer: company, Country: rec.Country ?? '', Attribute: 'Project environment/constraints', 'Yes/No': det['Project environment/constraints'] ? 'Yes' : 'No', ...det });
    }

    originalRows.sort((a, b) => {
      const ca = String(a.Customer), cb = String(b.Customer);
      if (ca !== cb) return ca.localeCompare(cb);
      return String(a.Attribute).localeCompare(String(b.Attribute));
    });

    // Build normalised summary — one row per company
    const companyMeta: Record<string, { country: unknown; attrs: Record<string, boolean> }> = {};
    for (const row of originalRows) {
      const c = String(row.Customer);
      if (!companyMeta[c]) companyMeta[c] = { country: row.Country, attrs: {} };
      const attr = String(row.Attribute);
      if (row['Yes/No'] === 'Yes') companyMeta[c].attrs[attr] = true;
      else if (!companyMeta[c].attrs[attr]) companyMeta[c].attrs[attr] = false;
    }

    const ATTRS = ['Commitment to Reduce', 'Net-zero target', 'Pilot', 'Investment announced', 'Equipment purchased', 'Project environment/constraints'];
    const normalizedRows = Object.keys(companyMeta).sort().map(company => {
      const row: Record<string, unknown> = { Customer: company, Country: companyMeta[company].country };
      for (const attr of ATTRS) row[attr] = companyMeta[company].attrs[attr] ? 'Yes' : 'No';
      return row;
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(normalizedRows), 'Normalized');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(originalRows),   'Original');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx"`,
      },
    });
  } catch (err) {
    console.error('[export-excel] error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
