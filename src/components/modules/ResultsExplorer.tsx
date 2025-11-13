'use client'

import { useState, useEffect } from 'react';
import { Download, ExternalLink, ArrowLeft } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { toast } from 'sonner';

interface SummaryResult {
  id?: string;
  company_name: string;
  commitment_to_reduce: boolean;
  net_zero_target: boolean;
  pilot: boolean;
  investment_announced: boolean;
  equipment_purchased: boolean;
  project_environment: boolean;
}

interface DetailResult {
  id?: string;
  customer: string;
  attribute: string;
  yes_no: string;
  text_value: string;
  source: string;
  url: string;
  source_file_type: string;
}

interface DiagnosticResult {
  id?: string;
  company_name: string;
  emissions_count: number;
  investments_count: number;
  machine_purchases_count: number;
  pilot_projects_count: number;
  project_environments_count: number;
  total_count: number;
}

interface ResultsExplorerProps {
  projectId: string;
  onBack?: () => void;
}

export function ResultsExplorer({ projectId, onBack }: ResultsExplorerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('normalized');
  const [isLoading, setIsLoading] = useState(true);
  const [summaryResults, setSummaryResults] = useState<SummaryResult[]>([]);
  const [detailResults, setDetailResults] = useState<DetailResult[]>([]);

  useEffect(() => {
    fetchResults();
  }, [projectId]);

  const fetchResults = async () => {
    setIsLoading(true);
    try {
      const [summaryRes, detailsRes] = await Promise.all([
        fetch(`/api/sustainability/results?projectId=${projectId}&type=summary`),
        fetch(`/api/sustainability/results?projectId=${projectId}&type=details`),
      ]);

      // Check if responses are OK before parsing
      if (!summaryRes.ok) {
        console.error('Summary API error:', summaryRes.status, summaryRes.statusText);
        const text = await summaryRes.text();
        console.error('Summary response:', text);
        throw new Error(`Failed to fetch summary results: ${summaryRes.statusText}`);
      }

      if (!detailsRes.ok) {
        console.error('Details API error:', detailsRes.status, detailsRes.statusText);
        const text = await detailsRes.text();
        console.error('Details response:', text);
        throw new Error(`Failed to fetch detail results: ${detailsRes.statusText}`);
      }

      // Parse JSON responses
      const [summaryData, detailsData] = await Promise.all([
        summaryRes.json().catch(err => {
          console.error('Error parsing summary JSON:', err);
          return { success: false, results: [] };
        }),
        detailsRes.json().catch(err => {
          console.error('Error parsing details JSON:', err);
          return { success: false, results: [] };
        }),
      ]);

      if (summaryData.success) {
        setSummaryResults(summaryData.results || []);
      } else {
        console.warn('Summary fetch unsuccessful:', summaryData);
      }

      if (detailsData.success) {
        setDetailResults(detailsData.results || []);
      } else {
        console.warn('Details fetch unsuccessful:', detailsData);
      }
    } catch (error) {
      console.error('Error fetching results:', error);
      toast.error(error instanceof Error ? error.message : 'Error loading results');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredSummary = summaryResults.filter((item) =>
    item.company_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDetails = detailResults.filter(
    (item) =>
      item.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.attribute.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDownloadCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map((row) =>
        headers.map((header) => `"${row[header] || ''}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('CSV exported successfully');
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Loading results...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-8 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            {onBack && (
              <Button
                variant="ghost"
                onClick={onBack}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
            <div>
              <h2 className="text-3xl font-bold text-gray-900">Results Explorer</h2>
              <p className="text-gray-600 mt-1">
                View and analyze Leads research results in multiple formats
              </p>
            </div>
          </div>
          <Button
            onClick={() => handleDownloadCSV(filteredSummary, 'results.csv')}
            variant="outline"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-gray-200 bg-white px-8 py-4">
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search companies or attributes..."
          className="max-w-md"
        />
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="bg-white border-b border-gray-200 px-8 pt-6">
            <TabsList>
              <TabsTrigger value="normalized">Normalized View</TabsTrigger>
              <TabsTrigger value="details">Original View</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6">
            <TabsContent value="normalized" className="mt-0">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>Summary by Company</CardTitle>
                  <CardDescription>
                    One row per company with six Leads attributes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {filteredSummary.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">
                      No results found
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="px-4 py-3 text-left font-semibold text-gray-900">Company</th>
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
                          {filteredSummary.map((row, idx) => (
                            <tr key={row.id || `${row.company_name}-${idx}`} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900">
                                {row.company_name}
                              </td>
                              {[
                                'commitment_to_reduce',
                                'net_zero_target',
                                'pilot',
                                'investment_announced',
                                'equipment_purchased',
                                'project_environment',
                              ].map((attr) => (
                                <td key={attr} className="px-4 py-3 text-center">
                                  {row[attr as keyof SummaryResult] ? (
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                      Yes
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
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
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="details" className="mt-0">
              <div className="space-y-4">
                {filteredDetails.length === 0 ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="pt-12">
                      <p className="text-center text-gray-500">
                        {searchTerm ? `No details found for "${searchTerm}"` : 'No details available'}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  filteredDetails.map((item, idx) => (
                    <Card key={idx} className="border-0 shadow-sm">
                      <CardContent className="pt-6">
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-xs text-gray-600 font-semibold uppercase">Customer</p>
                            <p className="text-lg font-semibold text-gray-900">{item.customer}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 font-semibold uppercase">Attribute</p>
                            <p className="text-lg font-semibold text-gray-900">{item.attribute}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-xs text-gray-600 font-semibold uppercase">Yes/No</p>
                            <p className="font-medium text-green-600">{item.yes_no}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 font-semibold uppercase">Source</p>
                            <p className="text-sm text-gray-700 capitalize">{item.source}</p>
                          </div>
                        </div>

                        {item.text_value && (
                          <div className="mb-4">
                            <p className="text-xs text-gray-600 font-semibold uppercase mb-2">Text</p>
                            <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                              {item.text_value}
                            </p>
                          </div>
                        )}

                        {item.url && (
                          <div>
                            <p className="text-xs text-gray-600 font-semibold uppercase mb-2">
                              Source URL{item.url.includes(';') || item.url.split(/\s+/).filter(s => s.startsWith('http')).length > 1 ? 's' : ''}
                            </p>
                            <div className="space-y-2">
                              {(() => {
                                // Split by semicolon first, then by whitespace for each part
                                const urlParts = item.url.split(';').flatMap(part =>
                                  part.trim().split(/\s+/).filter(s => s.match(/^https?:\/\//))
                                );
                                const uniqueUrls = Array.from(new Set(urlParts));

                                return uniqueUrls.map((url, urlIdx) => (
                                  <a
                                    key={urlIdx}
                                    href={url.trim()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-start gap-2 text-blue-600 hover:underline text-sm break-all"
                                  >
                                    <ExternalLink className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                    <span>{url.trim()}</span>
                                  </a>
                                ));
                              })()}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
