'use client'

import { useState, useEffect } from 'react';
import { Download, ExternalLink, ArrowLeft, Globe, Folder } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { toast } from 'sonner';

interface SummaryResult {
  id?: string;
  project_id: string;
  project_name: string;
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
  project_id: string;
  project_name: string;
  customer: string;
  attribute: string;
  yes_no: string;
  text_value: string;
  source: string;
  url: string;
  source_file_type: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  analysis_status: string;
  created_at: string;
}

interface GlobalResultsExplorerProps {
  projects: Project[];
  onBack?: () => void;
}

export function GlobalResultsExplorer({ projects, onBack }: GlobalResultsExplorerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('normalized');
  const [isLoading, setIsLoading] = useState(true);
  const [summaryResults, setSummaryResults] = useState<SummaryResult[]>([]);
  const [detailResults, setDetailResults] = useState<DetailResult[]>([]);
  const [viewMode, setViewMode] = useState<'global' | 'by-project'>('global');

  useEffect(() => {
    fetchAllResults();
  }, [projects]);

  const fetchAllResults = async () => {
    setIsLoading(true);
    try {
      const allSummaryResults: SummaryResult[] = [];
      const allDetailResults: DetailResult[] = [];

      await Promise.all(
        projects.map(async (project) => {
          try {
            const [summaryRes, detailsRes] = await Promise.all([
              fetch(`/api/sustainability/results?projectId=${project.id}&type=summary`),
              fetch(`/api/sustainability/results?projectId=${project.id}&type=details`),
            ]);

            const [summaryData, detailsData] = await Promise.all([
              summaryRes.json(),
              detailsRes.json(),
            ]);

            if (summaryData.success && summaryData.results) {
              allSummaryResults.push(
                ...summaryData.results.map((r: any) => ({
                  ...r,
                  project_id: project.id,
                  project_name: project.name,
                }))
              );
            }

            if (detailsData.success && detailsData.results) {
              allDetailResults.push(
                ...detailsData.results.map((r: any) => ({
                  ...r,
                  project_id: project.id,
                  project_name: project.name,
                }))
              );
            }
          } catch (error) {
            console.error(`Error fetching results for project ${project.name}:`, error);
          }
        })
      );

      setSummaryResults(allSummaryResults);
      setDetailResults(allDetailResults);
    } catch (error) {
      console.error('Error fetching results:', error);
      toast.error('Error loading global results');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredSummary = summaryResults.filter(
    (item) =>
      item.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.project_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDetails = detailResults.filter(
    (item) =>
      item.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.attribute.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.project_name.toLowerCase().includes(searchTerm.toLowerCase())
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

  const groupByProject = <T extends { project_id: string; project_name: string }>(
    items: T[]
  ): Record<string, { projectName: string; items: T[] }> => {
    return items.reduce((acc, item) => {
      if (!acc[item.project_id]) {
        acc[item.project_id] = {
          projectName: item.project_name,
          items: [],
        };
      }
      acc[item.project_id].items.push(item);
      return acc;
    }, {} as Record<string, { projectName: string; items: T[] }>);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Loading global results...</p>
      </div>
    );
  }

  const summaryByProject = groupByProject(filteredSummary);
  const detailsByProject = groupByProject(filteredDetails);

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
              <div className="flex items-center gap-2">
                <Globe className="h-8 w-8 text-purple-600" />
                <h2 className="text-3xl font-bold text-gray-900">Global Results Explorer</h2>
              </div>
              <p className="text-gray-600 mt-1">
                View and analyze results across all {projects.length} completed projects
              </p>
            </div>
          </div>
          <Button
            onClick={() =>
              handleDownloadCSV(
                filteredSummary,
                `global-results-${new Date().toISOString().split('T')[0]}.csv`
              )
            }
            variant="outline"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Search and View Mode Toggle */}
      <div className="border-b border-gray-200 bg-white px-8 py-4 space-y-4">
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search companies, attributes, or projects..."
          className="max-w-md"
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 font-medium">Display:</span>
          <div className="inline-flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setViewMode('global')}
              className={`px-4 py-2 text-sm font-medium rounded-l-lg border ${
                viewMode === 'global'
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Globe className="h-4 w-4 inline mr-1" />
              Combined
            </button>
            <button
              type="button"
              onClick={() => setViewMode('by-project')}
              className={`px-4 py-2 text-sm font-medium rounded-r-lg border-t border-r border-b ${
                viewMode === 'by-project'
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Folder className="h-4 w-4 inline mr-1" />
              By Project
            </button>
          </div>
        </div>
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
              {viewMode === 'global' ? (
                <Card className="border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle>Global Summary by Company</CardTitle>
                    <CardDescription>
                      Combined view of all companies across {projects.length} projects
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {filteredSummary.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No results found</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 bg-gray-50">
                              <th className="px-4 py-3 text-left font-semibold text-gray-900">
                                Company
                              </th>
                              <th className="px-4 py-3 text-left font-semibold text-gray-900">
                                Project
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
                            {filteredSummary.map((row, idx) => (
                              <tr key={row.id || `${row.company_name}-${idx}`} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium text-gray-900">
                                  {row.company_name}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  {row.project_name}
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
              ) : (
                <div className="space-y-6">
                  {Object.entries(summaryByProject).map(([projectId, { projectName, items }]) => (
                    <Card key={projectId} className="border-0 shadow-sm">
                      <CardHeader className="bg-purple-50">
                        <CardTitle className="flex items-center gap-2">
                          <Folder className="h-5 w-5 text-purple-600" />
                          {projectName}
                        </CardTitle>
                        <CardDescription>{items.length} companies</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-6">
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
                              {items.map((row, idx) => (
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
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="details" className="mt-0">
              {viewMode === 'global' ? (
                <div className="space-y-4">
                  {filteredDetails.length === 0 ? (
                    <Card className="border-0 shadow-sm">
                      <CardContent className="pt-12">
                        <p className="text-center text-gray-500">
                          {searchTerm
                            ? `No details found for "${searchTerm}"`
                            : 'No details available'}
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    filteredDetails.map((item, idx) => (
                      <Card key={idx} className="border-0 shadow-sm">
                        <CardContent className="pt-6">
                          <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                              <p className="text-xs text-gray-600 font-semibold uppercase">
                                Customer
                              </p>
                              <p className="text-lg font-semibold text-gray-900">{item.customer}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 font-semibold uppercase">
                                Attribute
                              </p>
                              <p className="text-lg font-semibold text-gray-900">{item.attribute}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 font-semibold uppercase">
                                Project
                              </p>
                              <p className="text-sm font-medium text-purple-600">
                                {item.project_name}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <p className="text-xs text-gray-600 font-semibold uppercase">
                                Yes/No
                              </p>
                              <p className="font-medium text-green-600">{item.yes_no}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 font-semibold uppercase">Source</p>
                              <p className="text-sm text-gray-700 capitalize">{item.source}</p>
                            </div>
                          </div>

                          {item.text_value && (
                            <div className="mb-4">
                              <p className="text-xs text-gray-600 font-semibold uppercase mb-2">
                                Text
                              </p>
                              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                                {item.text_value}
                              </p>
                            </div>
                          )}

                          {item.url && (
                            <div>
                              <p className="text-xs text-gray-600 font-semibold uppercase mb-2">
                                Source URL
                                {item.url.includes(';') ||
                                item.url.split(/\s+/).filter((s) => s.startsWith('http')).length > 1
                                  ? 's'
                                  : ''}
                              </p>
                              <div className="space-y-2">
                                {(() => {
                                  const urlParts = item.url
                                    .split(';')
                                    .flatMap((part) =>
                                      part.trim().split(/\s+/).filter((s) => s.match(/^https?:\/\//))
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
              ) : (
                <div className="space-y-6">
                  {Object.entries(detailsByProject).map(([projectId, { projectName, items }]) => (
                    <div key={projectId} className="space-y-4">
                      <div className="sticky top-0 bg-purple-50 border border-purple-200 rounded-lg p-4 z-10">
                        <div className="flex items-center gap-2">
                          <Folder className="h-5 w-5 text-purple-600" />
                          <h3 className="text-lg font-semibold text-gray-900">{projectName}</h3>
                          <span className="text-sm text-gray-600">({items.length} details)</span>
                        </div>
                      </div>
                      {items.map((item, idx) => (
                        <Card key={idx} className="border-0 shadow-sm">
                          <CardContent className="pt-6">
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              <div>
                                <p className="text-xs text-gray-600 font-semibold uppercase">
                                  Customer
                                </p>
                                <p className="text-lg font-semibold text-gray-900">
                                  {item.customer}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 font-semibold uppercase">
                                  Attribute
                                </p>
                                <p className="text-lg font-semibold text-gray-900">
                                  {item.attribute}
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                              <div>
                                <p className="text-xs text-gray-600 font-semibold uppercase">
                                  Yes/No
                                </p>
                                <p className="font-medium text-green-600">{item.yes_no}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 font-semibold uppercase">
                                  Source
                                </p>
                                <p className="text-sm text-gray-700 capitalize">{item.source}</p>
                              </div>
                            </div>

                            {item.text_value && (
                              <div className="mb-4">
                                <p className="text-xs text-gray-600 font-semibold uppercase mb-2">
                                  Text
                                </p>
                                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                                  {item.text_value}
                                </p>
                              </div>
                            )}

                            {item.url && (
                              <div>
                                <p className="text-xs text-gray-600 font-semibold uppercase mb-2">
                                  Source URL
                                  {item.url.includes(';') ||
                                  item.url.split(/\s+/).filter((s) => s.startsWith('http')).length >
                                    1
                                    ? 's'
                                    : ''}
                                </p>
                                <div className="space-y-2">
                                  {(() => {
                                    const urlParts = item.url
                                      .split(';')
                                      .flatMap((part) =>
                                        part
                                          .trim()
                                          .split(/\s+/)
                                          .filter((s) => s.match(/^https?:\/\//))
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
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
