'use client'

import { useState, useRef, useMemo } from 'react';
import { Upload, Search, Download, FileSpreadsheet, Loader2, FileText, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-client';
import { buildResearchRows, SUMMARY_ATTRIBUTES } from '@/lib/research-report';

const MAX_COMPANIES = 500;
const CONCURRENCY = 6;

const CATEGORY_LABELS: Record<string, string> = {
  emissions:    'Emissions Reductions',
  investments:  'Investments & Commitments',
  purchases:    'Machine/Equipment Purchases',
  pilots:       'Pilot Projects',
  environments: 'Environmental Constraints',
};

type CategoryKey = 'emissions' | 'investments' | 'purchases' | 'pilots' | 'environments';

type ResearchResults = Record<CategoryKey, Record<string, unknown>[]>;

type CompanyStatus = 'pending' | 'processing' | 'done' | 'error';

interface CompanyProgress {
  name: string;
  status: CompanyStatus;
  durationMs?: number;
  hasResults?: boolean;
}

/**
 * Concurrency-limited worker queue — keeps up to `concurrency` workers busy
 * at all times (no idle gaps between items, unlike fixed-batch Promise.all).
 */
async function runQueue<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await worker(items[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runWorker),
  );
  return results;
}

/**
 * Parse a TXT file: one company per non-blank, non-comment line.
 * Parse a CSV/TSV file: take the first column of each row, skip header rows that
 * look like column titles (e.g. "Company", "Name").
 */
function parseCompanyFile(text: string, isCsv: boolean): string[] {
  const lines = text.split(/\r?\n/);
  const HEADER_RE = /^(company|name|companies|organization|org|customer_name)$/i;

  return lines
    .map((line) => {
      const cell = isCsv ? line.split(/[,\t]/)[0] : line;
      return cell.trim().replace(/^["']|["']$/g, '');
    })
    .filter((name) => name.length > 0 && !name.startsWith('#') && !HEADER_RE.test(name));
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const emptyResults = (): ResearchResults => ({
  emissions: [], investments: [], purchases: [], pilots: [], environments: [],
});

export function SimpleResearchView() {
  const [companies, setCompanies] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [chipSearch, setChipSearch] = useState('');
  const [isResearching, setIsResearching] = useState(false);
  const [results, setResults] = useState<ResearchResults | null>(null);
  const [progress, setProgress] = useState<CompanyProgress[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accumulatedRef = useRef<ResearchResults>(emptyResults());

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isCsv = /\.(csv|tsv)$/i.test(file.name);
    setFileName(file.name);
    setResults(null);
    setProgress([]);
    setChipSearch('');

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = [...new Set(parseCompanyFile(text, isCsv))];

      if (parsed.length === 0) {
        toast.error('No company names found in the file');
        setCompanies([]);
      } else if (parsed.length > MAX_COMPANIES) {
        toast.warning(`Found ${parsed.length} companies — only the first ${MAX_COMPANIES} will be researched`);
        setCompanies(parsed.slice(0, MAX_COMPANIES));
      } else {
        toast.success(`Found ${parsed.length} company name${parsed.length !== 1 ? 's' : ''}`);
        setCompanies(parsed);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleResearch = async () => {
    if (companies.length === 0) {
      toast.error('Please upload a file with company names first');
      return;
    }

    setIsResearching(true);
    setResults(null);
    accumulatedRef.current = emptyResults();

    // Initialise progress list with all companies as pending
    setProgress(companies.map((name) => ({ name, status: 'pending' })));

    const updateProgress = (name: string, patch: Partial<CompanyProgress>) =>
      setProgress((prev) =>
        prev.map((p) => (p.name === name ? { ...p, ...patch } : p)),
      );

    toast.info(`Starting research on ${companies.length} companies (${CONCURRENCY} at a time)…`);

    try {
      await runQueue(
        companies,
        async (company) => {
          updateProgress(company, { status: 'processing' });
          const t0 = Date.now();

          try {
            const response = await apiFetch('/api/research-companies', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ companies: [{ name: company }], runs: 1 }),
            });

            let data: { success: boolean; error?: string; results?: ResearchResults; hasAnyResults?: boolean };
            try {
              data = await response.json();
            } catch {
              throw new Error(`Non-JSON response (${response.status})`);
            }

            const durationMs = Date.now() - t0;

            if (data.success && data.results) {
              // Merge this company's results into the accumulated set
              for (const cat of Object.keys(CATEGORY_LABELS) as CategoryKey[]) {
                accumulatedRef.current[cat].push(...(data.results[cat] ?? []));
              }
              // Expose accumulated results live so download is available mid-run
              setResults({ ...accumulatedRef.current });
              updateProgress(company, {
                status: 'done',
                durationMs,
                hasResults: data.hasAnyResults !== false,
              });
            } else {
              updateProgress(company, { status: 'error', durationMs });
            }
          } catch (err) {
            updateProgress(company, { status: 'error', durationMs: Date.now() - t0 });
            console.error(`[SimpleResearch] failed for "${company}":`, err);
          }
        },
        CONCURRENCY,
      );

      const finalProgress = accumulatedRef.current;
      const totalRows = Object.values(finalProgress).reduce((s, a) => s + a.length, 0);
      const errors = companies.filter((_, i) =>
        progress.find((p) => p.name === companies[i])?.status === 'error',
      ).length;

      if (totalRows === 0) {
        toast.warning('Research complete — no data found for any company');
      } else if (errors > 0) {
        toast.warning(`Research complete — ${errors} compan${errors !== 1 ? 'ies' : 'y'} failed`);
      } else {
        toast.success(`Research complete for all ${companies.length} companies`);
      }

      // Automatically sync accumulated results to Snowflake once research finishes.
      if (totalRows > 0) {
        void handleExportSnowflake(finalProgress);
      }
    } finally {
      setIsResearching(false);
    }
  };

  const handleDownloadAll = () => {
    if (!results) return;
    const stamp = new Date().toISOString().slice(0, 10);
    (Object.keys(CATEGORY_LABELS) as CategoryKey[]).forEach((cat, i) => {
      setTimeout(() => {
        const data = results[cat] ?? [];
        downloadBlob(JSON.stringify(data, null, 2), `${cat}-${stamp}.json`, 'application/json');
      }, i * 200);
    });
    toast.success('Downloading 5 category files…');
  };

  const [isExporting, setIsExporting] = useState(false);
  const [isExportingSnowflake, setIsExportingSnowflake] = useState(false);
  const [sheetTab, setSheetTab] = useState('normalized');
  const [sheetSearch, setSheetSearch] = useState('');

  const handleDownloadExcel = async () => {
    if (!results) return;
    setIsExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const response = await apiFetch('/api/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results, filename: `research_results_${stamp}` }),
      });
      if (!response.ok) throw new Error(`Server error ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `research_results_${stamp}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel workbook downloaded');
    } catch (err) {
      console.error('[export-excel]', err);
      toast.error('Failed to generate Excel file');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSnowflake = async (finalResults: ResearchResults) => {
    setIsExportingSnowflake(true);
    try {
      const response = await apiFetch('/api/export-snowflake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: finalResults }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || `Server error ${response.status}`);
      toast.success(`Synced ${data.detailsInserted} detail rows and ${data.summaryInserted} summary rows to Snowflake`);
    } catch (err) {
      console.error('[export-snowflake]', err);
      toast.error(err instanceof Error ? err.message : 'Failed to sync data to Snowflake');
    } finally {
      setIsExportingSnowflake(false);
    }
  };

  const handleDownloadCategory = (category: string) => {
    if (!results) return;
    const data = (results as Record<string, object[]>)[category] ?? [];
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(JSON.stringify(data, null, 2), `${category}-${stamp}.json`, 'application/json');
  };

  const totalRows = results
    ? Object.values(results).reduce((sum, arr) => sum + arr.length, 0)
    : 0;

  const doneCount   = progress.filter((p) => p.status === 'done' || p.status === 'error').length;
  const errorCount  = progress.filter((p) => p.status === 'error').length;
  const pct         = progress.length > 0 ? Math.round((doneCount / progress.length) * 100) : 0;

  // Flatten the raw category results into the same "Normalized" (one row per
  // company, boolean attributes) and "Original" (one row per company per
  // attribute) shapes used by the Excel/Snowflake exports, so the on-screen
  // preview always matches what gets downloaded/synced.
  const { detailRows, summaryRows } = useMemo(
    () => (results ? buildResearchRows(results) : { detailRows: [], summaryRows: [] }),
    [results],
  );

  const filteredSummaryRows = useMemo(
    () => summaryRows.filter((row) => row.Customer.toLowerCase().includes(sheetSearch.toLowerCase())),
    [summaryRows, sheetSearch],
  );

  const filteredDetailRows = useMemo(
    () => detailRows.filter(
      (row) =>
        row.Customer.toLowerCase().includes(sheetSearch.toLowerCase()) ||
        row.Attribute.toLowerCase().includes(sheetSearch.toLowerCase()),
    ),
    [detailRows, sheetSearch],
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Company Research</h1>
          <p className="text-gray-500 mt-1">
            Upload a company list, run research, then download the results.
          </p>
        </div>

        {/* Step 1 — Upload */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <StepBadge n={1} done={companies.length > 0} />
              Upload Company List
            </CardTitle>
            <CardDescription>
              TXT (one company per line) or CSV/TSV (company names in the first column).
              Up to {MAX_COMPANIES} companies.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                companies.length > 0
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
              }`}
              onClick={() => !isResearching && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv,.tsv"
                className="hidden"
                onChange={handleFileChange}
                disabled={isResearching}
              />
              {companies.length > 0 ? (
                <>
                  <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <p className="font-semibold text-gray-900">{fileName}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {companies.length} compan{companies.length !== 1 ? 'ies' : 'y'} loaded
                  </p>
                  <p className="text-xs text-gray-400 mt-2">Click to change file</p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="font-semibold text-gray-600">Click to upload company list</p>
                  <p className="text-sm text-gray-400 mt-1">.txt, .csv, or .tsv</p>
                </>
              )}
            </div>

            {companies.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={chipSearch}
                    onChange={(e) => setChipSearch(e.target.value)}
                    placeholder={`Search ${companies.length} companies…`}
                    disabled={isResearching}
                    className="flex-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
                  />
                  {chipSearch && (
                    <button
                      onClick={() => setChipSearch('')}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Clear
                    </button>
                  )}
                  <span className="shrink-0 text-xs text-gray-400">
                    {chipSearch
                      ? `${companies.filter((c) => c.toLowerCase().includes(chipSearch.toLowerCase())).length} match${companies.filter((c) => c.toLowerCase().includes(chipSearch.toLowerCase())).length !== 1 ? 'es' : ''}`
                      : `${companies.length} total`}
                  </span>
                </div>
                <div className="max-h-36 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2">
                  <div className="flex flex-wrap gap-1.5">
                    {companies
                      .filter((c) => c.toLowerCase().includes(chipSearch.toLowerCase()))
                      .map((c, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-medium"
                        >
                          {c}
                        </span>
                      ))}
                    {companies.filter((c) => c.toLowerCase().includes(chipSearch.toLowerCase())).length === 0 && (
                      <p className="text-xs text-gray-400 py-1">No companies match your search.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2 — Research */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <StepBadge n={2} done={!isResearching && results !== null} />
              Run Research
            </CardTitle>
            <CardDescription>
              Searches the web across 5 categories per company, processing {CONCURRENCY} companies at a time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleResearch}
              disabled={isResearching || companies.length === 0}
              className="bg-blue-600 hover:bg-blue-700 w-full"
              size="lg"
            >
              {isResearching ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Researching… {doneCount}/{progress.length}
                </>
              ) : (
                <>
                  <Search className="mr-2 h-5 w-5" />
                  Research {companies.length > 0 ? `${companies.length} Companies` : 'Companies'}
                </>
              )}
            </Button>

            {/* Progress bar */}
            {isResearching && progress.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{doneCount} / {progress.length} done{errorCount > 0 ? ` · ${errorCount} error${errorCount !== 1 ? 's' : ''}` : ''}</span>
                  <span>{pct}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Live company status log */}
            {progress.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded border border-gray-200 bg-gray-50 divide-y divide-gray-100 text-xs">
                {[...progress].reverse().map((p) => (
                  <div key={p.name} className="flex items-center gap-2 px-3 py-1.5">
                    {p.status === 'done' && p.hasResults && <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                    {p.status === 'done' && !p.hasResults && <CheckCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                    {p.status === 'error'      && <XCircle    className="h-3.5 w-3.5 text-red-500   shrink-0" />}
                    {p.status === 'processing' && <Loader2    className="h-3.5 w-3.5 text-blue-500  shrink-0 animate-spin" />}
                    {p.status === 'pending'    && <span className="h-3.5 w-3.5 rounded-full border border-gray-300 shrink-0 inline-block" />}
                    <span className={`flex-1 truncate ${p.status === 'pending' ? 'text-gray-400' : 'text-gray-700'}`}>
                      {p.name}
                    </span>
                    {p.durationMs !== undefined && (
                      <span className="text-gray-400 shrink-0">{(p.durationMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 3 — Download */}
        <Card className={results ? '' : 'opacity-50 pointer-events-none'}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <StepBadge n={3} done={false} />
              Download Results
            </CardTitle>
            {results && (
              <CardDescription>
                {totalRows} total rows across 5 categories
                {isResearching && <span className="text-blue-600"> · updating live as companies complete</span>}.{' '}
                {isExportingSnowflake ? (
                  <span className="text-blue-600 inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />Syncing to Snowflake…
                  </span>
                ) : (
                  <span className="text-amber-600">Download for a local copy — data also syncs to Snowflake automatically once research completes.</span>
                )}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleDownloadExcel}
              disabled={!results || isExporting}
              className="bg-emerald-600 hover:bg-emerald-700 w-full"
              size="lg"
            >
              {isExporting ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Generating Excel…</>
              ) : (
                <><FileSpreadsheet className="mr-2 h-5 w-5" />Download Consolidated Excel (.xlsx)</>
              )}
            </Button>

            <Button
              onClick={handleDownloadAll}
              disabled={!results}
              variant="outline"
              className="w-full"
              size="sm"
            >
              <Download className="mr-2 h-4 w-4" />
              Download Raw JSON (5 separate files)
            </Button>

            {results && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {(Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((cat) => {
                  const rows = (results[cat] ?? []).length;
                  return (
                    <Button
                      key={cat}
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadCategory(cat)}
                      disabled={rows === 0}
                      className="justify-start text-xs"
                    >
                      <FileText className="mr-2 h-3.5 w-3.5 shrink-0" />
                      {CATEGORY_LABELS[cat]}
                      <span className={`ml-auto font-normal ${rows === 0 ? 'text-gray-400' : 'text-gray-500'}`}>
                        {rows === 0 ? 'no data' : `${rows} row${rows !== 1 ? 's' : ''}`}
                      </span>
                    </Button>
                  );
                })}
              </div>
            )}

            {!results && (
              <div className="flex items-center gap-2 text-sm text-gray-400 justify-center py-2">
                <AlertCircle className="h-4 w-4" />
                Complete research first to enable download
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 4 — Preview (mirrors the two Excel sheets) */}
        {results && !isResearching && totalRows > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Preview Results
              </CardTitle>
              <CardDescription>
                Same data as the downloaded workbook — one sheet consolidated per company, one with the raw per-attribute rows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                value={sheetSearch}
                onChange={(e) => setSheetSearch(e.target.value)}
                placeholder="Search companies or attributes…"
                className="max-w-md"
              />

              <Tabs value={sheetTab} onValueChange={setSheetTab}>
                <TabsList>
                  <TabsTrigger value="normalized">Normalized (Boolean)</TabsTrigger>
                  <TabsTrigger value="original">Original (Raw)</TabsTrigger>
                </TabsList>

                <TabsContent value="normalized" className="mt-3">
                  {filteredSummaryRows.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 py-8">No results found</p>
                  ) : (
                    <div className="max-h-96 overflow-auto rounded border border-gray-200">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="border-b border-gray-200">
                            <th className="px-3 py-2 text-left font-semibold text-gray-900 whitespace-nowrap">Customer</th>
                            {SUMMARY_ATTRIBUTES.map((attr) => (
                              <th key={attr} className="px-3 py-2 text-center font-semibold text-gray-900 whitespace-nowrap">
                                {attr}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredSummaryRows.map((row, idx) => (
                            <tr key={`${row.Customer}-${idx}`} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{row.Customer}</td>
                              {SUMMARY_ATTRIBUTES.map((attr) => (
                                <td key={attr} className="px-3 py-2 text-center">
                                  {row[attr] === 'Yes' ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                      Yes
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                      No
                                    </span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="original" className="mt-3">
                  {filteredDetailRows.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 py-8">No results found</p>
                  ) : (
                    <div className="max-h-96 overflow-auto rounded border border-gray-200">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="border-b border-gray-200">
                            <th className="px-3 py-2 text-left font-semibold text-gray-900 whitespace-nowrap">Customer</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-900 whitespace-nowrap">Attribute</th>
                            <th className="px-3 py-2 text-center font-semibold text-gray-900 whitespace-nowrap">Yes/No</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-900">Text</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-900">Source</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredDetailRows.map((row, idx) => (
                            <tr key={`${row.Customer}-${row.Attribute}-${idx}`} className="hover:bg-gray-50 align-top">
                              <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{row.Customer}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-gray-700">{row.Attribute}</td>
                              <td className="px-3 py-2 text-center">
                                {row['Yes/No'] === 'Yes' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Yes
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                    No
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={row.Text}>{row.Text}</td>
                              <td className="px-3 py-2 text-gray-500 max-w-xs truncate" title={row.Source}>{row.Source}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}

function StepBadge({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      className={`flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold shrink-0 ${
        done ? 'bg-green-500' : 'bg-blue-600'
      }`}
    >
      {done ? '✓' : n}
    </span>
  );
}
