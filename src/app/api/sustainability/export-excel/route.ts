import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import * as XLSX from 'xlsx';

export const maxDuration = 60;

function normalizeCompany(name: string): string {
  if (!name) return '';
  return name.normalize('NFKD').replace(/[^\x00-\x7F]/g, '').trim().replace(/\s+/g, ' ');
}

function hasAnyValue(rec: Record<string, any>, fields: string[]): boolean {
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

function blobHas(pattern: RegExp, ...vals: any[]): boolean {
  const blob = vals.map(v => (v ? String(v) : '')).join(' ').toLowerCase();
  return pattern.test(blob);
}

function extractUrls(rec: Record<string, any>): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const sourceKeys = ['Source', 'Sources', 'Source URLs', 'SourceURLs', 'Comments'];

  for (const key of sourceKeys) {
    const v = rec[key];
    if (Array.isArray(v)) {
      for (const item of v) {
        const matches = String(item).match(/https?:\/\/[^\s)\]>}"',<>]+/g);
        if (matches) {
          for (const url of matches) {
            if (!seen.has(url)) {
              seen.add(url);
              urls.push(url);
            }
          }
        }
      }
    } else if (v) {
      const matches = String(v).match(/https?:\/\/[^\s)\]>}"',<>]+/g);
      if (matches) {
        for (const url of matches) {
          if (!seen.has(url)) {
            seen.add(url);
            urls.push(url);
          }
        }
      }
    }
  }
  return urls;
}

function collectSourceText(rec: Record<string, any>): string {
  const parts: string[] = [];
  const sourceKeys = ['Source', 'Sources', 'Source URLs', 'SourceURLs'];

  for (const key of sourceKeys) {
    const v = rec[key];
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length > 0) {
        parts.push(`${key}: ${v.map(x => String(x).trim()).filter(x => x).join('; ')}`);
      }
    } else {
      const s = String(v).trim();
      if (s) parts.push(`${key}: ${s}`);
    }
  }
  return parts.join('; ');
}

function kvJoin(rec: Record<string, any>, keys: string[]): string {
  const out: string[] = [];
  for (const k of keys) {
    const val = rec[k];
    if (val !== null && val !== undefined) {
      const s = String(val).trim();
      if (s) out.push(`${k}: ${s}`);
    }
  }
  return out.join('; ');
}

function detectEmissions(rec: Record<string, any>) {
  const commitFields = ['Emissions Reduction Target', 'Target Year', 'Baseline Year', 'Pledge Year', 'Comments'];
  const commitment = hasAnyValue(rec, [...commitFields, 'Source', 'Sources']);

  let netZero = false;
  const nzField = rec['Net-Zero Target'];
  if (typeof nzField === 'boolean') {
    netZero = nzField;
  } else {
    netZero = blobHas(/\bnet[-\s]?zero\b/i, rec['Comments'], rec['Emissions Reduction Target']);
  }

  const text = kvJoin(rec, ['Emissions Reduction Target', 'Target Year', 'Baseline Year', 'Pledge Year', 'Comments']);
  const source = collectSourceText(rec);
  const urls = extractUrls(rec).join('; ');

  return {
    'Commitment to Reduce': commitment,
    'Net-zero target': netZero,
    Text: text,
    Source: source,
    URL: urls
  };
}

function detectInvestment(rec: Record<string, any>) {
  const anyFields = ['Investment Type', 'Announcement Date', 'Description', 'Comments'];
  const has = hasAnyValue(rec, [...anyFields, 'Source', 'Sources']);
  const text = kvJoin(rec, ['Investment Type', 'Announcement Date', 'Description', 'Comments']);
  const source = collectSourceText(rec);
  const urls = extractUrls(rec).join('; ');

  return {
    'Investment announced': has,
    Text: text,
    Source: source,
    URL: urls
  };
}

function detectPurchase(rec: Record<string, any>) {
  const anyFields = ['Manufacturer', 'MachineType', 'Model', 'Quantity', 'PurchaseDate', 'Comments'];
  const has = hasAnyValue(rec, [...anyFields, 'Source', 'Sources']);
  const text = kvJoin(rec, ['Manufacturer', 'MachineType', 'Model', 'Quantity', 'PurchaseDate', 'Comments']);
  const source = collectSourceText(rec);
  const urls = extractUrls(rec).join('; ');

  return {
    'Equipment purchased': has,
    Text: text,
    Source: source,
    URL: urls
  };
}

function detectPilot(rec: Record<string, any>) {
  const anyFields = [
    'Project Name', 'Project Type', 'Involvement',
    'Lower Emissions Approach', 'Lower Emission Approach',
    'Equipment', 'Electric Equipment & Manufacturer',
    'Project Description', 'Comments'
  ];
  const has = hasAnyValue(rec, [...anyFields, 'Source', 'Sources']);
  const text = kvJoin(rec, [
    'Project Name', 'Project Type', 'Involvement',
    'Lower Emissions Approach', 'Lower Emission Approach',
    'Equipment', 'Electric Equipment & Manufacturer',
    'Project Description', 'Comments'
  ]);
  const source = collectSourceText(rec);
  const urls = extractUrls(rec).join('; ');

  return {
    Pilot: has,
    Text: text,
    Source: source,
    URL: urls
  };
}

function detectEnvironment(rec: Record<string, any>) {
  const anyFields = ['Project', 'constraint type', 'Project date', 'Description', 'Comments'];
  const has = hasAnyValue(rec, [...anyFields, 'Source', 'Sources']);
  const text = kvJoin(rec, ['Project', 'constraint type', 'Project date', 'Description', 'Comments']);
  const source = collectSourceText(rec);
  const urls = extractUrls(rec).join('; ');

  return {
    'Project environment/constraints': has,
    Text: text,
    Source: source,
    URL: urls
  };
}

export async function POST(req: NextRequest) {
  try {
    const { projectId } = await req.json();

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const userId = 'b2bbb440-1d79-42fa-81e3-069efd22fae8';

    const { data: project, error: projectError } = await supabase
      .from('sustainability_projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const { data: fileRecords } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId);

    if (!fileRecords || fileRecords.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files found for this project' },
        { status: 404 }
      );
    }

    const emissions: any[] = [];
    const investments: any[] = [];
    const purchases: any[] = [];
    const pilots: any[] = [];
    const environments: any[] = [];

    for (const fileRec of fileRecords) {
      const { data: fileData } = await supabase.storage
        .from(fileRec.storage_bucket)
        .download(fileRec.file_path);

      if (fileData) {
        const text = await fileData.text();
        let parsed: any[] = [];

        try {
          const json = JSON.parse(text);
          parsed = Array.isArray(json) ? json : [json];
        } catch (e) {
          const match = text.match(/\[[\s\S]*\]/);
          if (match) {
            try {
              const json = JSON.parse(match[0]);
              parsed = Array.isArray(json) ? json : [json];
            } catch {}
          }
        }

        switch (fileRec.file_type) {
          case 'emissions':
            emissions.push(...parsed);
            break;
          case 'investments':
            investments.push(...parsed);
            break;
          case 'machine_purchases':
            purchases.push(...parsed);
            break;
          case 'pilot_projects':
            pilots.push(...parsed);
            break;
          case 'project_environments':
            environments.push(...parsed);
            break;
        }
      }
    }

    const originalRows: any[] = [];

    for (const rec of emissions) {
      const company = normalizeCompany(rec.Company || '');
      if (!company) continue;
      const det = detectEmissions(rec);
      originalRows.push({ Customer: company, Attribute: 'Commitment to Reduce', 'Yes/No': det['Commitment to Reduce'] ? 'Yes' : 'No', ...det });
      originalRows.push({ Customer: company, Attribute: 'Net-zero target', 'Yes/No': det['Net-zero target'] ? 'Yes' : 'No', ...det });
    }

    for (const rec of investments) {
      const company = normalizeCompany(rec.Company || '');
      if (!company) continue;
      const det = detectInvestment(rec);
      originalRows.push({ Customer: company, Attribute: 'Investment announced', 'Yes/No': det['Investment announced'] ? 'Yes' : 'No', ...det });
    }

    for (const rec of purchases) {
      const company = normalizeCompany(rec.Company || '');
      if (!company) continue;
      const det = detectPurchase(rec);
      originalRows.push({ Customer: company, Attribute: 'Equipment purchased', 'Yes/No': det['Equipment purchased'] ? 'Yes' : 'No', ...det });
    }

    for (const rec of pilots) {
      const company = normalizeCompany(rec.Company || '');
      if (!company) continue;
      const det = detectPilot(rec);
      originalRows.push({ Customer: company, Attribute: 'Pilot', 'Yes/No': det.Pilot ? 'Yes' : 'No', ...det });
    }

    for (const rec of environments) {
      const company = normalizeCompany(rec.Company || '');
      if (!company) continue;
      const det = detectEnvironment(rec);
      originalRows.push({ Customer: company, Attribute: 'Project environment/constraints', 'Yes/No': det['Project environment/constraints'] ? 'Yes' : 'No', ...det });
    }

    originalRows.sort((a, b) => {
      if (a.Customer !== b.Customer) return a.Customer.localeCompare(b.Customer);
      return a.Attribute.localeCompare(b.Attribute);
    });

    const companyMap: Record<string, Record<string, boolean>> = {};
    for (const row of originalRows) {
      if (!companyMap[row.Customer]) {
        companyMap[row.Customer] = {};
      }
      const attr = row.Attribute;
      if (row['Yes/No'] === 'Yes') {
        companyMap[row.Customer][attr] = true;
      } else if (!companyMap[row.Customer][attr]) {
        companyMap[row.Customer][attr] = false;
      }
    }

    const normalizedRows: any[] = [];
    const companies = Object.keys(companyMap).sort();
    for (const company of companies) {
      normalizedRows.push({
        Customer: company,
        'Commitment to Reduce': companyMap[company]['Commitment to Reduce'] ? 'Yes' : 'No',
        'Net-zero target': companyMap[company]['Net-zero target'] ? 'Yes' : 'No',
        Pilot: companyMap[company]['Pilot'] ? 'Yes' : 'No',
        'Investment announced': companyMap[company]['Investment announced'] ? 'Yes' : 'No',
        'Equipment purchased': companyMap[company]['Equipment purchased'] ? 'Yes' : 'No',
        'Project environment/constraints': companyMap[company]['Project environment/constraints'] ? 'Yes' : 'No'
      });
    }

    const wb = XLSX.utils.book_new();

    const wsNormalized = XLSX.utils.json_to_sheet(normalizedRows);
    XLSX.utils.book_append_sheet(wb, wsNormalized, 'Normalized');

    const wsOriginal = XLSX.utils.json_to_sheet(originalRows);
    XLSX.utils.book_append_sheet(wb, wsOriginal, 'Original');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_attributes.xlsx"`
      }
    });

  } catch (error) {
    console.error('Error generating Excel:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
