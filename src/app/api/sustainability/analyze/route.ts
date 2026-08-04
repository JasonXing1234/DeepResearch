import { NextRequest, NextResponse } from 'next/server';
import { buildResearchRows, CategoryKey, ResearchResults } from '@/lib/research-report';
import {
  AnalysisDetail,
  AnalysisDiagnostic,
  AnalysisResult,
  getProject,
  getProjectCompanies,
  setProjectResults,
  updateProject,
} from '@/lib/sustainability-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CONCURRENCY = 6;
const CATEGORIES: CategoryKey[] = ['emissions', 'investments', 'purchases', 'pilots', 'environments'];

const ATTRIBUTE_TO_FILE_TYPE: Record<string, string> = {
  'Commitment to Reduce': 'emissions',
  'Net-zero target': 'emissions',
  'Investment announced': 'investments',
  'Equipment purchased': 'machine_purchases',
  Pilot: 'pilot_projects',
  'Project environment/constraints': 'project_environments',
};

function emptyResults(): ResearchResults {
  return { emissions: [], investments: [], purchases: [], pilots: [], environments: [] };
}

/** Concurrency-limited worker queue — mirrors the one used by /simple's SimpleResearchView. */
async function runQueue<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await worker(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

function normalize(name: string) {
  return name.trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const projectId = typeof body?.projectId === 'string' ? body.projectId : null;

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }

    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const companies = getProjectCompanies(projectId);
    if (companies.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No companies found. Upload at least one report with company names first.' },
        { status: 400 },
      );
    }

    updateProject(projectId, { analysis_status: 'processing', analysis_error: null });

    const origin = req.nextUrl.origin;
    const accumulated = emptyResults();

    try {
      await runQueue(
        companies,
        async (company) => {
          const response = await fetch(`${origin}/api/research-companies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companies: [{ name: company }], runs: 1 }),
          });

          const data = await response.json().catch(() => null) as
            | { success: boolean; results?: ResearchResults }
            | null;

          if (data?.success && data.results) {
            for (const cat of CATEGORIES) {
              accumulated[cat].push(...(data.results[cat] ?? []));
            }
          }
        },
        CONCURRENCY,
      );

      const { detailRows, summaryRows } = buildResearchRows(accumulated);
      const now = new Date().toISOString();

      const summary: AnalysisResult[] = summaryRows.map((row) => ({
        id: `${projectId}-summary-${normalize(row.Customer)}`,
        project_id: projectId,
        company_name: row.Customer,
        commitment_to_reduce: row['Commitment to Reduce'] === 'Yes',
        net_zero_target: row['Net-zero target'] === 'Yes',
        pilot: row.Pilot === 'Yes',
        investment_announced: row['Investment announced'] === 'Yes',
        equipment_purchased: row['Equipment purchased'] === 'Yes',
        project_environment: row['Project environment/constraints'] === 'Yes',
        created_at: now,
        updated_at: now,
      }));

      const details: AnalysisDetail[] = detailRows.map((row, i) => ({
        id: `${projectId}-detail-${i}`,
        project_id: projectId,
        customer: row.Customer,
        attribute: row.Attribute,
        yes_no: row['Yes/No'],
        text_value: row.Text,
        source: row.Source,
        url: row.URL,
        source_file_type: ATTRIBUTE_TO_FILE_TYPE[row.Attribute],
        created_at: now,
        updated_at: now,
      }));

      const diagCounts = new Map<string, Record<CategoryKey, number>>();
      for (const cat of CATEGORIES) {
        for (const rec of accumulated[cat]) {
          const company = String(rec.Company ?? '').trim();
          if (!company) continue;
          const key = normalize(company);
          if (!diagCounts.has(key)) {
            diagCounts.set(key, { emissions: 0, investments: 0, purchases: 0, pilots: 0, environments: 0 });
          }
          diagCounts.get(key)![cat] += 1;
        }
      }

      const diagnostics: AnalysisDiagnostic[] = companies.map((company) => {
        const counts = diagCounts.get(normalize(company)) ?? {
          emissions: 0, investments: 0, purchases: 0, pilots: 0, environments: 0,
        };
        const total = counts.emissions + counts.investments + counts.purchases + counts.pilots + counts.environments;
        return {
          id: `${projectId}-diag-${normalize(company)}`,
          project_id: projectId,
          company_name: company,
          emissions_count: counts.emissions,
          investments_count: counts.investments,
          machine_purchases_count: counts.purchases,
          pilot_projects_count: counts.pilots,
          project_environments_count: counts.environments,
          total_count: total,
          created_at: now,
          updated_at: now,
        };
      });

      setProjectResults(projectId, { raw: accumulated, summary, details, diagnostics });

      updateProject(projectId, { analysis_status: 'completed', analysis_error: null });

      return NextResponse.json({ success: true, companiesAnalyzed: companies.length });
    } catch (error) {
      updateProject(projectId, {
        analysis_status: 'failed',
        analysis_error: error instanceof Error ? error.message : 'Analysis failed',
      });
      throw error;
    }
  } catch (error) {
    console.error('[sustainability/analyze] error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
