import { inngest } from '../client';
import { createClient } from '@/lib/supabase/server';

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

export const processSustainabilityAnalysis = inngest.createFunction(
  {
    id: 'process-sustainability-analysis',
    retries: 3,
  },
  { event: 'sustainability/analyze.requested' },
  async ({ event, step }) => {
    const { projectId } = event.data;

    const supabase = await createClient();

    // Step 1: Fetch project and files
    const project = await step.run('fetch-project', async () => {
      const { data, error } = await supabase
        .from('sustainability_projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (error || !data) {
        throw new Error('Project not found');
      }

      return data;
    });

    const fileRecords = await step.run('fetch-file-records', async () => {
      const { data, error } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId);

      if (error || !data || data.length === 0) {
        throw new Error('No files found for this project');
      }

      return data;
    });

    const { emissions, investments, purchases, pilots, environments } = await step.run('parse-files', async () => {
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

      return { emissions, investments, purchases, pilots, environments };
    });

    const { summaryResults, detailsResults, diagnosticsResults } = await step.run('analyze-data', async () => {
      const companyMap: Record<string, Record<string, boolean>> = {};
      const detailsRows: any[] = [];

      for (const rec of emissions) {
        const company = normalizeCompany(rec.Company || '');
        if (!company) continue;

        if (!companyMap[company]) companyMap[company] = {};

        const det = detectEmissions(rec);
        companyMap[company]['Commitment to Reduce'] = companyMap[company]['Commitment to Reduce'] || det['Commitment to Reduce'];
        companyMap[company]['Net-zero target'] = companyMap[company]['Net-zero target'] || det['Net-zero target'];

        detailsRows.push({
          customer: company,
          attribute: 'Commitment to Reduce',
          yes_no: det['Commitment to Reduce'] ? 'Yes' : 'No',
          text_value: det.Text,
          source: det.Source,
          url: det.URL,
          source_file_type: 'emissions'
        });

        detailsRows.push({
          customer: company,
          attribute: 'Net-zero target',
          yes_no: det['Net-zero target'] ? 'Yes' : 'No',
          text_value: det.Text,
          source: det.Source,
          url: det.URL,
          source_file_type: 'emissions'
        });
      }

      for (const rec of investments) {
        const company = normalizeCompany(rec.Company || '');
        if (!company) continue;

        if (!companyMap[company]) companyMap[company] = {};

        const det = detectInvestment(rec);
        companyMap[company]['Investment announced'] = companyMap[company]['Investment announced'] || det['Investment announced'];

        detailsRows.push({
          customer: company,
          attribute: 'Investment announced',
          yes_no: det['Investment announced'] ? 'Yes' : 'No',
          text_value: det.Text,
          source: det.Source,
          url: det.URL,
          source_file_type: 'investments'
        });
      }

      for (const rec of purchases) {
        const company = normalizeCompany(rec.Company || '');
        if (!company) continue;

        if (!companyMap[company]) companyMap[company] = {};

        const det = detectPurchase(rec);
        companyMap[company]['Equipment purchased'] = companyMap[company]['Equipment purchased'] || det['Equipment purchased'];

        detailsRows.push({
          customer: company,
          attribute: 'Equipment purchased',
          yes_no: det['Equipment purchased'] ? 'Yes' : 'No',
          text_value: det.Text,
          source: det.Source,
          url: det.URL,
          source_file_type: 'machine_purchases'
        });
      }

      for (const rec of pilots) {
        const company = normalizeCompany(rec.Company || '');
        if (!company) continue;

        if (!companyMap[company]) companyMap[company] = {};

        const det = detectPilot(rec);
        companyMap[company]['Pilot'] = companyMap[company]['Pilot'] || det.Pilot;

        detailsRows.push({
          customer: company,
          attribute: 'Pilot',
          yes_no: det.Pilot ? 'Yes' : 'No',
          text_value: det.Text,
          source: det.Source,
          url: det.URL,
          source_file_type: 'pilot_projects'
        });
      }

      for (const rec of environments) {
        const company = normalizeCompany(rec.Company || '');
        if (!company) continue;

        if (!companyMap[company]) companyMap[company] = {};

        const det = detectEnvironment(rec);
        companyMap[company]['Project environment'] = companyMap[company]['Project environment'] || det['Project environment/constraints'];

        detailsRows.push({
          customer: company,
          attribute: 'Project environment',
          yes_no: det['Project environment/constraints'] ? 'Yes' : 'No',
          text_value: det.Text,
          source: det.Source,
          url: det.URL,
          source_file_type: 'project_environments'
        });
      }

      const companies = Object.keys(companyMap).sort();
      const summaryResults = companies.map(company => ({
        company_name: company,
        commitment_to_reduce: companyMap[company]['Commitment to Reduce'] || false,
        net_zero_target: companyMap[company]['Net-zero target'] || false,
        pilot: companyMap[company]['Pilot'] || false,
        investment_announced: companyMap[company]['Investment announced'] || false,
        equipment_purchased: companyMap[company]['Equipment purchased'] || false,
        project_environment: companyMap[company]['Project environment'] || false,
      }));

      const countByCompany = (arr: any[]) => {
        const cnt: Record<string, number> = {};
        for (const rec of arr) {
          const k = normalizeCompany(rec.Company || '');
          if (k) cnt[k] = (cnt[k] || 0) + 1;
        }
        return cnt;
      };

      const emCnt = countByCompany(emissions);
      const invCnt = countByCompany(investments);
      const purCnt = countByCompany(purchases);
      const pilCnt = countByCompany(pilots);
      const envCnt = countByCompany(environments);

      const diagnosticsResults = companies.map(c => ({
        company_name: c,
        emissions_count: emCnt[c] || 0,
        investments_count: invCnt[c] || 0,
        machine_purchases_count: purCnt[c] || 0,
        pilot_projects_count: pilCnt[c] || 0,
        project_environments_count: envCnt[c] || 0,
        total_count: (emCnt[c] || 0) + (invCnt[c] || 0) + (purCnt[c] || 0) + (pilCnt[c] || 0) + (envCnt[c] || 0)
      }));

      return { summaryResults, detailsResults: detailsRows, diagnosticsResults };
    });

    await step.run('save-results', async () => {
      await supabase.from('analysis_results').delete().eq('project_id', projectId);
      await supabase.from('analysis_details').delete().eq('project_id', projectId);
      await supabase.from('analysis_diagnostics').delete().eq('project_id', projectId);

      const { error: summaryError } = await supabase
        .from('analysis_results')
        .insert(summaryResults.map(r => ({ project_id: projectId, ...r })));

      if (summaryError) throw new Error(`Summary insert failed: ${summaryError.message}`);

      const { error: detailsError } = await supabase
        .from('analysis_details')
        .insert(detailsResults.map(r => ({ project_id: projectId, ...r })));

      if (detailsError) throw new Error(`Details insert failed: ${detailsError.message}`);

      const { error: diagnosticsError } = await supabase
        .from('analysis_diagnostics')
        .insert(diagnosticsResults.map(r => ({ project_id: projectId, ...r })));

      if (diagnosticsError) throw new Error(`Diagnostics insert failed: ${diagnosticsError.message}`);

      await supabase
        .from('sustainability_projects')
        .update({ analysis_status: 'completed' })
        .eq('id', projectId);

      return { success: true };
    });

    return { success: true, companies: summaryResults.length };
  }
);
