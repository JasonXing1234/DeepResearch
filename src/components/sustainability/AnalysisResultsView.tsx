'use client'

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Download, ChevronDown, ChevronUp } from 'lucide-react';
import type {
  AnalysisResult,
  AnalysisDetail,
  AnalysisDiagnostic,
} from '../SustainabilityDashboard';

interface AnalysisResultsViewProps {
  resultsType: 'summary' | 'details' | 'diagnostics';
  summaryResults?: AnalysisResult[];
  detailsResults?: AnalysisDetail[];
  diagnosticsResults?: AnalysisDiagnostic[];
  projectId: string;
}

export function AnalysisResultsView({
  resultsType,
  summaryResults,
  detailsResults,
  diagnosticsResults,
  projectId,
}: AnalysisResultsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  const handleDownloadExcel = () => {
    
    if (resultsType === 'summary' && summaryResults) {
      const headers = [
        'Company',
        'Commitment to Reduce',
        'Net-zero Target',
        'Pilot',
        'Investment Announced',
        'Equipment Purchased',
        'Project Environment',
      ];

      const rows = summaryResults.map((r) => [
        r.company_name,
        r.commitment_to_reduce ? 'Yes' : 'No',
        r.net_zero_target ? 'Yes' : 'No',
        r.pilot ? 'Yes' : 'No',
        r.investment_announced ? 'Yes' : 'No',
        r.equipment_purchased ? 'Yes' : 'No',
        r.project_environment ? 'Yes' : 'No',
      ]);

      downloadCSV(headers, rows, `Summary_Results_${projectId}.csv`);
    } else if (resultsType === 'details' && detailsResults) {
      const headers = [
        'Customer',
        'Attribute',
        'Yes/No',
        'Text',
        'Source',
        'URL',
      ];

      const rows = detailsResults.map((r) => [
        r.customer,
        r.attribute,
        r.yes_no || '',
        r.text_value || '',
        r.source || '',
        r.url || '',
      ]);

      downloadCSV(headers, rows, `Detailed_Results_${projectId}.csv`);
    } else if (resultsType === 'diagnostics' && diagnosticsResults) {
      const headers = [
        'Company',
        'Emissions',
        'Investments',
        'Machine Purchases',
        'Pilot Projects',
        'Project Environments',
        'Total',
      ];

      const rows = diagnosticsResults.map((r) => [
        r.company_name,
        r.emissions_count.toString(),
        r.investments_count.toString(),
        r.machine_purchases_count.toString(),
        r.pilot_projects_count.toString(),
        r.project_environments_count.toString(),
        r.total_count.toString(),
      ]);

      downloadCSV(headers, rows, `Diagnostics_Results_${projectId}.csv`);
    }
  };

  const downloadCSV = (
    headers: string[],
    rows: (string | number)[][],
    filename: string
  ) => {
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${cell}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (resultsType === 'summary' && summaryResults) {
    return (
      <SummaryResults
        results={summaryResults}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onDownload={handleDownloadExcel}
      />
    );
  }

  if (resultsType === 'details' && detailsResults) {
    return (
      <DetailsResults
        results={detailsResults}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onDownload={handleDownloadExcel}
      />
    );
  }

  if (resultsType === 'diagnostics' && diagnosticsResults) {
    return (
      <DiagnosticsResults
        results={diagnosticsResults}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onDownload={handleDownloadExcel}
      />
    );
  }

  return null;
}

function SummaryResults({
  results,
  searchTerm,
  onSearchChange,
  onDownload,
}: {
  results: AnalysisResult[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onDownload: () => void;
}) {
  const filteredResults = results.filter((r) =>
    r.company_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Summary Results</CardTitle>
            <CardDescription>
              One row per company with analysis results
            </CardDescription>
          </div>
          <Button
            onClick={onDownload}
            variant="outline"
            size="sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <Input
            placeholder="Search companies..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="max-w-md"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-semibold text-gray-900">
                  Company
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">
                  Commitment to Reduce
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">
                  Net-zero Target
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">
                  Pilot
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">
                  Investment Announced
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">
                  Equipment Purchased
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">
                  Project Environment
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredResults.map((result) => (
                <tr key={result.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {result.company_name}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <YesNoBadge value={result.commitment_to_reduce} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <YesNoBadge value={result.net_zero_target} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <YesNoBadge value={result.pilot} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <YesNoBadge value={result.investment_announced} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <YesNoBadge value={result.equipment_purchased} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <YesNoBadge value={result.project_environment} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredResults.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            No results found for "{searchTerm}"
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DetailsResults({
  results,
  searchTerm,
  onSearchChange,
  onDownload,
}: {
  results: AnalysisDetail[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onDownload: () => void;
}) {
  const filteredResults = results.filter(
    (r) =>
      r.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.attribute.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Detailed Results</CardTitle>
            <CardDescription>
              Original results with detailed information per attribute
            </CardDescription>
          </div>
          <Button
            onClick={onDownload}
            variant="outline"
            size="sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <Input
            placeholder="Search customer or attribute..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="max-w-md"
          />
        </div>

        <div className="space-y-3">
          {filteredResults.map((result) => (
            <div
              key={result.id}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
            >
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Customer</p>
                  <p className="font-semibold text-gray-900">
                    {result.customer}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Attribute</p>
                  <p className="font-semibold text-gray-900">
                    {result.attribute}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Yes/No</p>
                  <p className="font-medium">
                    {result.yes_no ? (
                      <span className="text-green-600">{result.yes_no}</span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Source</p>
                  <p className="text-sm text-gray-700">
                    {result.source_file_type || result.source || '-'}
                  </p>
                </div>
              </div>

              {result.text_value && (
                <div className="mb-3">
                  <p className="text-xs text-gray-600 mb-1">Text</p>
                  <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">
                    {result.text_value}
                  </p>
                </div>
              )}

              {result.url && (
                <div>
                  <p className="text-xs text-gray-600 mb-1">URL</p>
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline break-all"
                  >
                    {result.url}
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>

        {filteredResults.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            No results found for "{searchTerm}"
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DiagnosticsResults({
  results,
  searchTerm,
  onSearchChange,
  onDownload,
}: {
  results: AnalysisDiagnostic[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onDownload: () => void;
}) {
  const filteredResults = results.filter((r) =>
    r.company_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Diagnostics</CardTitle>
            <CardDescription>
              Counts per company per report type
            </CardDescription>
          </div>
          <Button
            onClick={onDownload}
            variant="outline"
            size="sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <Input
            placeholder="Search companies..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="max-w-md"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-semibold text-gray-900">
                  Company
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">
                  Emissions
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">
                  Investments
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">
                  Machine Purchases
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">
                  Pilot Projects
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">
                  Project Environments
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-900">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredResults.map((result) => (
                <tr key={result.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {result.company_name}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">
                    {result.emissions_count}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">
                    {result.investments_count}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">
                    {result.machine_purchases_count}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">
                    {result.pilot_projects_count}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">
                    {result.project_environments_count}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-gray-900">
                    {result.total_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredResults.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            No results found for "{searchTerm}"
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function YesNoBadge({ value }: { value: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
        value
          ? 'bg-green-100 text-green-800'
          : 'bg-gray-100 text-gray-800'
      }`}
    >
      {value ? 'Yes' : 'No'}
    </span>
  );
}
