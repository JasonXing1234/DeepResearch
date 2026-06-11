'use client'

import { useState, useRef } from 'react';
import { Upload, Search, Download, Loader2, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-client';

const MAX_COMPANIES = 20;

const CATEGORY_LABELS: Record<string, string> = {
  emissions:    'Emissions Reductions',
  investments:  'Investments & Commitments',
  purchases:    'Machine/Equipment Purchases',
  pilots:       'Pilot Projects',
  environments: 'Environmental Constraints',
};

type ResearchResults = {
  emissions:    object[];
  investments:  object[];
  purchases:    object[];
  pilots:       object[];
  environments: object[];
};

/**
 * Parse a TXT file: one company per non-blank, non-comment line.
 * Parse a CSV/TSV file: take the first column of each row, skip header rows that
 * look like column titles (e.g. "Company", "Name").
 */
function parseCompanyFile(text: string, isCsv: boolean): string[] {
  const lines = text.split(/\r?\n/);
  const HEADER_RE = /^(company|name|companies|organization|org)$/i;

  return lines
    .map((line) => {
      const cell = isCsv ? line.split(/[,\t]/)[0] : line;
      return cell.trim().replace(/^["']|["']$/g, ''); // strip surrounding quotes
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

export function SimpleResearchView() {
  const [companies, setCompanies] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const [results, setResults] = useState<ResearchResults | null>(null);
  const [researchedCompanies, setResearchedCompanies] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isCsv = /\.(csv|tsv)$/i.test(file.name);
    setFileName(file.name);
    setResults(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = [...new Set(parseCompanyFile(text, isCsv))]; // deduplicate
      setCompanies(parsed);

      if (parsed.length === 0) {
        toast.error('No company names found in the file');
      } else if (parsed.length > MAX_COMPANIES) {
        toast.warning(`Found ${parsed.length} companies — only the first ${MAX_COMPANIES} will be researched`);
        setCompanies(parsed.slice(0, MAX_COMPANIES));
      } else {
        toast.success(`Found ${parsed.length} company name${parsed.length !== 1 ? 's' : ''}`);
      }
    };
    reader.readAsText(file);

    // Reset the input so the same file can be re-uploaded if needed
    e.target.value = '';
  };

  const handleResearch = async () => {
    if (companies.length === 0) {
      toast.error('Please upload a file with company names first');
      return;
    }

    setIsResearching(true);
    setResults(null);
    toast.info('Starting research…');

    try {
      const response = await apiFetch('/api/research-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companies: companies.map((name) => ({ name })),
        }),
      });

      let data: { success: boolean; error?: string; results?: ResearchResults; companiesResearched?: number; hasAnyResults?: boolean };
      try {
        data = await response.json();
      } catch {
        throw new Error(`Server returned non-JSON response (${response.status})`);
      }

      if (data.success && data.results) {
        setResults(data.results);
        setResearchedCompanies(companies);
        if (data.hasAnyResults === false) {
          toast.warning('Research complete — no sources were found for these companies');
        } else {
          toast.success(`Research complete for ${data.companiesResearched} companies`);
        }
      } else {
        toast.error(data.error || 'Research failed');
      }
    } catch (error) {
      console.error('Research error:', error);
      toast.error('Research request failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsResearching(false);
    }
  };

  const handleDownloadAll = () => {
    if (!results) return;
    const stamp = new Date().toISOString().slice(0, 10);
    (Object.keys(CATEGORY_LABELS) as (keyof ResearchResults)[]).forEach((cat, i) => {
      // Stagger downloads slightly so browsers don't block them
      setTimeout(() => {
        const data = (results as Record<string, object[]>)[cat] ?? [];
        downloadBlob(JSON.stringify(data, null, 2), `${cat}-${stamp}.json`, 'application/json');
      }, i * 200);
    });
    toast.success('Downloading 5 category files…');
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
              Maximum {MAX_COMPANIES} companies.
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

            {/* Company name preview chips */}
            {companies.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {companies.slice(0, 10).map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-medium"
                  >
                    {c}
                  </span>
                ))}
                {companies.length > 10 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-xs">
                    +{companies.length - 10} more
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2 — Research */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <StepBadge n={2} done={results !== null} />
              Run Research
            </CardTitle>
            <CardDescription>
              Searches the web for sustainability data across 5 categories per company.
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
                  Researching {companies.length} compan{companies.length !== 1 ? 'ies' : 'y'}…
                </>
              ) : (
                <>
                  <Search className="mr-2 h-5 w-5" />
                  Research Companies
                </>
              )}
            </Button>
            {isResearching && (
              <p className="text-xs text-gray-400 text-center">
                This may take a few minutes — please keep this tab open.
              </p>
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
                {totalRows} total rows across 5 categories for{' '}
                <span className="font-medium text-gray-700">{researchedCompanies.join(', ')}</span>.{' '}
                <span className="text-amber-600">Results are not saved — download before leaving.</span>
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleDownloadAll}
              disabled={!results}
              className="bg-green-600 hover:bg-green-700 w-full"
              size="lg"
            >
              <Download className="mr-2 h-5 w-5" />
              Download All (5 separate JSON files)
            </Button>

            {/* Per-category download buttons */}
            {results && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {(Object.keys(CATEGORY_LABELS) as (keyof ResearchResults)[]).map((cat) => {
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
