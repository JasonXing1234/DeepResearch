/**
 * convert-research-to-excel.mjs
 *
 * Reads the 5 research result JSON files and produces a consolidated Excel workbook.
 *
 * Usage:
 *   node scripts/convert-research-to-excel.mjs [input-dir] [output-file]
 *
 * Defaults:
 *   input-dir  = output/research
 *   output-file = output/research_results.xlsx
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const inputDir = process.argv[2] || path.join(ROOT, 'output', 'research');
const outputFile = process.argv[3] || path.join(ROOT, 'output', 'research_results.xlsx');

// ─── Helpers (adapted from export-excel/route.ts) ────────────────────────────

function normalizeCompany(name) {
  if (!name) return '';
  return name.normalize('NFKD').replace(/[^\x00-\x7F]/g, '').trim().replace(/\s+/g, ' ');
}

function hasAnyValue(rec, fields) {
  for (const field of fields) {
    const v = rec[field];
    if (typeof v === 'boolean') {
      if (v) return true;
    } else if (v !== null && v !== undefined && String(v).trim() !== '') {
      return true;
    }
  }
  return false;
}

function blobHas(pattern, ...vals) {
  const blob = vals.map(v => (v ? String(v) : '')).join(' ').toLowerCase();
  return pattern.test(blob);
}

function extractUrls(rec) {
  const urls = [];
  const seen = new Set();
  const sourceKeys = ['Source', 'Sources', 'Source URLs', 'SourceURLs', 'Comments'];
  for (const key of sourceKeys) {
    const v = rec[key];
    const raw = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
    for (const item of raw) {
      const matches = item.match(/https?:\/\/[^\s)\]>}"',<>]+/g) || [];
      for (const url of matches) {
        if (!seen.has(url)) { seen.add(url); urls.push(url); }
      }
    }
  }
  return urls;
}

function collectSourceText(rec) {
  const parts = [];
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

function kvJoin(rec, keys) {
  return keys
    .map(k => { const v = rec[k]; return v !== null && v !== undefined && String(v).trim() ? `${k}: ${String(v).trim()}` : null; })
    .filter(Boolean)
    .join('; ');
}

// ─── Detect functions ─────────────────────────────────────────────────────────

function detectEmissions(rec) {
  const commitFields = ['Emissions Reduction Target', 'Target Year', 'Baseline Year', 'Pledge Year', 'Comments'];
  const commitment = hasAnyValue(rec, [...commitFields, 'Source', 'Sources']);

  let netZero = false;
  const nzField = rec['Net-Zero Target'];
  if (typeof nzField === 'boolean') {
    netZero = nzField;
  } else {
    netZero = blobHas(/\bnet[-\s]?zero\b/i, rec['Comments'], rec['Emissions Reduction Target']);
  }

  return {
    'Commitment to Reduce': commitment,
    'Net-zero target': netZero,
    Text: kvJoin(rec, ['Emissions Reduction Target', 'Target Year', 'Baseline Year', 'Pledge Year', 'Comments']),
    Source: collectSourceText(rec),
    URL: extractUrls(rec).join('; ')
  };
}

function detectInvestment(rec) {
  const has = hasAnyValue(rec, ['Investment Type', 'Announcement Date', 'Description', 'Comments', 'Source', 'Sources']);
  return {
    'Investment announced': has,
    Text: kvJoin(rec, ['Investment Type', 'Announcement Date', 'Description', 'Comments']),
    Source: collectSourceText(rec),
    URL: extractUrls(rec).join('; ')
  };
}

function detectPurchase(rec) {
  const anyFields = ['Manufacturer', 'MachineType', 'Machine Type', 'Model', 'Quantity', 'PurchaseDate', 'Purchase Date', 'Comments'];
  const has = hasAnyValue(rec, [...anyFields, 'Source', 'Sources']);
  return {
    'Equipment purchased': has,
    Text: kvJoin(rec, ['Manufacturer', 'Machine Type', 'MachineType', 'Model', 'Quantity', 'Purchase Date', 'PurchaseDate', 'Comments']),
    Source: collectSourceText(rec),
    URL: extractUrls(rec).join('; ')
  };
}

function detectPilot(rec) {
  const anyFields = [
    'Project Name', 'Project Type', 'Involvement',
    'Lower Emissions Approach', 'Lower Emission Approach',
    'Equipment', 'Electric Equipment & Manufacturer',
    'Project Description', 'Comments'
  ];
  const has = hasAnyValue(rec, [...anyFields, 'Source', 'Sources']);
  return {
    Pilot: has,
    Text: kvJoin(rec, anyFields),
    Source: collectSourceText(rec),
    URL: extractUrls(rec).join('; ')
  };
}

function detectEnvironment(rec) {
  const anyFields = ['Project', 'constraint type', 'Project date', 'Description', 'Comments'];
  const has = hasAnyValue(rec, [...anyFields, 'Source', 'Sources']);
  return {
    'Project environment/constraints': has,
    Text: kvJoin(rec, anyFields),
    Source: collectSourceText(rec),
    URL: extractUrls(rec).join('; ')
  };
}

// ─── Load JSON files ──────────────────────────────────────────────────────────

function loadJson(file) {
  const p = path.join(inputDir, file);
  if (!fs.existsSync(p)) {
    console.warn(`⚠️  File not found, skipping: ${p}`);
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.warn(`⚠️  Failed to parse ${p}: ${e.message}`);
    return [];
  }
}

const emissions    = loadJson('emissions_reductions.json');
const investments  = loadJson('investments_commitments.json');
const purchases    = loadJson('machine_purchases.json');
const pilots       = loadJson('pilot_projects.json');
const environments = loadJson('environmental_constraints.json');

console.log(`Loaded: ${emissions.length} emissions, ${investments.length} investments, ${purchases.length} purchases, ${pilots.length} pilots, ${environments.length} environments`);

// ─── Build company→country lookup from all sources ───────────────────────────

const countryMap = {};
for (const rec of [...emissions, ...investments, ...purchases, ...pilots, ...environments]) {
  const company = normalizeCompany(rec.Company || '');
  if (company && !countryMap[company] && rec.Country && rec.Country.trim()) {
    countryMap[company] = rec.Country.trim();
  }
}

function getCountry(company, rec) {
  return (rec.Country && rec.Country.trim()) ? rec.Country.trim() : (countryMap[company] || '');
}

// ─── Build rows ───────────────────────────────────────────────────────────────

// Strip boolean fields from a detect result — Yes/No already captures the value.
function textOnly(det) {
  return Object.fromEntries(Object.entries(det).filter(([, v]) => typeof v !== 'boolean'));
}

const originalRows = [];

for (const rec of emissions) {
  const company = normalizeCompany(rec.Company || '');
  if (!company) continue;
  const det = detectEmissions(rec);
  const rest = textOnly(det);
  originalRows.push({ Customer: company, Country: getCountry(company, rec), Attribute: 'Commitment to Reduce', 'Yes/No': det['Commitment to Reduce'] ? 'Yes' : 'No', ...rest });
  originalRows.push({ Customer: company, Country: getCountry(company, rec), Attribute: 'Net-zero target',        'Yes/No': det['Net-zero target'] ? 'Yes' : 'No',        ...rest });
}

for (const rec of investments) {
  const company = normalizeCompany(rec.Company || '');
  if (!company) continue;
  const det = detectInvestment(rec);
  originalRows.push({ Customer: company, Country: getCountry(company, rec), Attribute: 'Investment announced', 'Yes/No': det['Investment announced'] ? 'Yes' : 'No', ...textOnly(det) });
}

for (const rec of purchases) {
  const company = normalizeCompany(rec.Company || '');
  if (!company) continue;
  const det = detectPurchase(rec);
  originalRows.push({ Customer: company, Country: getCountry(company, rec), Attribute: 'Equipment purchased', 'Yes/No': det['Equipment purchased'] ? 'Yes' : 'No', ...textOnly(det) });
}

for (const rec of pilots) {
  const company = normalizeCompany(rec.Company || '');
  if (!company) continue;
  const det = detectPilot(rec);
  originalRows.push({ Customer: company, Country: getCountry(company, rec), Attribute: 'Pilot', 'Yes/No': det.Pilot ? 'Yes' : 'No', ...textOnly(det) });
}

for (const rec of environments) {
  const company = normalizeCompany(rec.Company || '');
  if (!company) continue;
  const det = detectEnvironment(rec);
  originalRows.push({ Customer: company, Country: getCountry(company, rec), Attribute: 'Project environment/constraints', 'Yes/No': det['Project environment/constraints'] ? 'Yes' : 'No', ...textOnly(det) });
}

originalRows.sort((a, b) => a.Customer !== b.Customer ? a.Customer.localeCompare(b.Customer) : a.Attribute.localeCompare(b.Attribute));

// ─── Build normalized summary ─────────────────────────────────────────────────

const companyMeta = {};
for (const row of originalRows) {
  if (!companyMeta[row.Customer]) companyMeta[row.Customer] = { country: row.Country, attrs: {} };
  if (row['Yes/No'] === 'Yes') companyMeta[row.Customer].attrs[row.Attribute] = true;
  else if (!companyMeta[row.Customer].attrs[row.Attribute]) companyMeta[row.Customer].attrs[row.Attribute] = false;
}

const normalizedRows = Object.keys(companyMeta).sort().map(company => ({
  Customer: company,
  Country: companyMeta[company].country || countryMap[company] || '',
  'Commitment to Reduce':             companyMeta[company].attrs['Commitment to Reduce']             ? 'Yes' : 'No',
  'Net-zero target':                  companyMeta[company].attrs['Net-zero target']                  ? 'Yes' : 'No',
  Pilot:                              companyMeta[company].attrs['Pilot']                              ? 'Yes' : 'No',
  'Investment announced':             companyMeta[company].attrs['Investment announced']             ? 'Yes' : 'No',
  'Equipment purchased':              companyMeta[company].attrs['Equipment purchased']              ? 'Yes' : 'No',
  'Project environment/constraints':  companyMeta[company].attrs['Project environment/constraints']  ? 'Yes' : 'No',
}));

// ─── Write workbook ───────────────────────────────────────────────────────────

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(normalizedRows), 'Normalized');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(originalRows),   'Original');

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
XLSX.writeFile(wb, outputFile);

console.log(`✅ Written: ${outputFile}`);
console.log(`   Normalized sheet: ${normalizedRows.length} companies`);
console.log(`   Original sheet:   ${originalRows.length} rows`);
