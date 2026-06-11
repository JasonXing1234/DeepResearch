'use client'

import { useState, useEffect } from 'react';
import { Search, Trash2, Download, Loader2, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { toast } from 'sonner';
import type { ResearchQuery } from '../../contexts/ResearchContext';
import { apiFetch } from '@/lib/api-client';

interface ResearchQueueEntry {
  id: string;
  companies: string[];
  status: string;
  project_id: string;
  created_at: string;
  completed_at: string | null;
  total_companies: number;
  files_generated: number;
  document_count: number;
  segment_count: number;
}

type DebugLogLevel = 'info' | 'warn' | 'error';

type DebugLogEntry = {
  timestamp: string;
  level: DebugLogLevel;
  event: string;
  details?: unknown;
};

const MAX_DEBUG_LOGS = 500;
const ENABLE_RESEARCH_HISTORY = false;

async function parseJsonResponse(response: Response, context: string) {
  const rawText = await response.text();
  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    console.error('[DeepResearchEngine] non-JSON response', {
      context,
      status: response.status,
      contentType,
      url: response.url,
      preview: rawText.slice(0, 200),
    });

    return {
      success: false,
      error: context + ' returned non-JSON response (' + response.status + ')',
      rawText,
    };
  }
}

export function DeepResearchEngine() {
  const [companies, setCompanies] = useState(['', '', '', '']);
  const [isResearching, setIsResearching] = useState(false);
  const [researchHistory, setResearchHistory] = useState<ResearchQueueEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [latestResearchResults, setLatestResearchResults] = useState<any>(null);
  const [latestResearchCompanies, setLatestResearchCompanies] = useState<string[]>([]);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);

  
  useEffect(() => {
    if (!ENABLE_RESEARCH_HISTORY) {
      setIsLoadingHistory(false);
      return;
    }

    fetchResearchHistory();
  }, []);

  const fetchResearchHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const response = await apiFetch('/api/research-queue');
      const data = await parseJsonResponse(response, 'research history');

      if (data.success) {
        setResearchHistory(data.data);
      } else {
        console.error('Failed to fetch research history:', data.error);
      }
    } catch (error) {
      console.error('Error fetching research history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const appendDebugLog = (level: DebugLogLevel, event: string, details?: unknown) => {
    const entry: DebugLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      details,
    };

    setDebugLogs((prev) => [...prev, entry].slice(-MAX_DEBUG_LOGS));

    if (level === 'error') {
      console.error('[DeepResearchEngine][debug]', entry);
    } else if (level === 'warn') {
      console.warn('[DeepResearchEngine][debug]', entry);
    } else {
      console.log('[DeepResearchEngine][debug]', entry);
    }
  };

  const printDebugLogsToConsole = () => {
    console.group('[DeepResearchEngine] Debug Logs');
    debugLogs.forEach((entry) => console.log(entry));
    console.groupEnd();
  };

  const downloadDebugLogs = (format: 'json' | 'txt' = 'json') => {
    if (debugLogs.length === 0) {
      toast.info('No debug logs to download yet');
      return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = 'deep-research-debug-' + stamp + '.' + format;
    const payload =
      format === 'json'
        ? JSON.stringify(debugLogs, null, 2)
        : debugLogs
            .map((entry) => {
              const details =
                typeof entry.details === 'string'
                  ? entry.details
                  : JSON.stringify(entry.details ?? {});
              return entry.timestamp + ' [' + entry.level + '] ' + entry.event + ' ' + details;
            })
            .join('\n');

    const blob = new Blob([payload], {
      type: format === 'json' ? 'application/json' : 'text/plain; charset=utf-8',
    });

    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);

    appendDebugLog('info', 'download_debug_logs', {
      format,
      count: debugLogs.length,
      filename,
    });
    toast.success('Downloaded ' + filename);
  };

  const companyInputs = companies.filter((c) => c.trim()).length;
  const latestHasAnyResults =
    latestResearchResults &&
    Object.values(latestResearchResults as Record<string, unknown>).some((item) => {
      if (Array.isArray(item)) return item.length > 0;
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (typeof obj.resultCount === 'number') return obj.resultCount > 0;
        if (Array.isArray(obj.results)) return obj.results.length > 0;
      }
      return false;
    });

  const handleCompanyChange = (index: number, value: string) => {
    const newCompanies = [...companies];
    newCompanies[index] = value;
    setCompanies(newCompanies);
  };

  const handleRunResearch = async () => {
    const activeCompanies = companies.filter((c) => c.trim());

    console.log('[DeepResearchEngine] handleRunResearch triggered', {
      activeCompaniesCount: activeCompanies.length,
      activeCompanies,
    });
    appendDebugLog('info', 'handle_run_research_triggered', {
      activeCompaniesCount: activeCompanies.length,
      activeCompanies,
    });

    if (activeCompanies.length === 0) {
      console.warn('[DeepResearchEngine] No companies provided');
      toast.error('Enter at least one company name');
      return;
    }

    setIsResearching(true);
    toast.info('Starting deep research...');

    try {
      console.log('[DeepResearchEngine] Creating project...');
      
      const projectAbortController = new AbortController();
      const projectTimeout = setTimeout(() => projectAbortController.abort(), 10000); // 10s timeout
      
      const projectResponse = await apiFetch('/api/sustainability/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Research: ${activeCompanies.join(', ')}`,
          description: `Automated research for ${activeCompanies.length} companies`,
        }),
        signal: projectAbortController.signal,
      }).catch((err) => {
        clearTimeout(projectTimeout);
        console.error('[DeepResearchEngine] Project fetch error:', err);
        throw err;
      });
      
      clearTimeout(projectTimeout);
      console.log('[DeepResearchEngine] Project response received', {
        status: projectResponse.status,
        contentType: projectResponse.headers.get('content-type'),
        url: projectResponse.url,
      });
      appendDebugLog('info', 'project_response_received', {
        status: projectResponse.status,
        contentType: projectResponse.headers.get('content-type'),
        url: projectResponse.url,
      });

      if (projectResponse.status === 404) {
        console.error('[DeepResearchEngine] Project request returned 404. API candidate paths attempted in apiFetch.');
      }
      
      const projectData = await parseJsonResponse(projectResponse, 'project creation');

      console.log('[DeepResearchEngine] Project response:', projectData);

      if (!projectData.success) {
        toast.error(projectData.error || 'Failed to create project');
        setIsResearching(false);
        return;
      }

      const projectId = projectData.project.id;

      console.log('[DeepResearchEngine] Calling /api/research-companies', {
        projectId,
        companies: activeCompanies,
      });
      
      const researchResponse = await apiFetch('/api/research-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companies: activeCompanies.map(name => ({ name })),
          projectId: projectId,
        }),
      });

      console.log('[DeepResearchEngine] research-companies response received', {
        status: researchResponse.status,
        contentType: researchResponse.headers.get('content-type'),
        url: researchResponse.url,
      });
      appendDebugLog('info', 'research_companies_response_received', {
        status: researchResponse.status,
        contentType: researchResponse.headers.get('content-type'),
        url: researchResponse.url,
      });

      const researchData = await parseJsonResponse(researchResponse, 'research companies');

      console.log('[DeepResearchEngine] Research response:', {
        success: researchData.success,
        companiesResearched: researchData.companiesResearched,
        error: researchData.error,
      });
      appendDebugLog('info', 'research_response_received', {
        success: researchData.success,
        companiesResearched: researchData.companiesResearched,
        hasAnyResults: researchData.hasAnyResults,
        error: researchData.error,
      });

      if (researchData.success) {
        setCompanies(['', '', '', '']);
        setLatestResearchCompanies(activeCompanies);
        setLatestResearchResults(researchData.results || null);

        if (researchData.hasAnyResults === false) {
          appendDebugLog('warn', 'research_no_results', {
            companies: activeCompanies,
          });
          toast.warning('Research completed, but no sources were found.');
        } else {
          toast.success(`Research completed! Generated ${researchData.uploadedFiles} report files.`);
        }

        
        if (ENABLE_RESEARCH_HISTORY) {
          await fetchResearchHistory();
        }
      } else {
        toast.error(researchData.error || 'Research failed');
      }
    } catch (error) {
      console.error('Error running research:', error);
      appendDebugLog('error', 'research_exception', {
        message: error instanceof Error ? error.message : String(error),
      });
      toast.error('Error running research');
    } finally {
      setIsResearching(false);
    }
  };

  const handleExportJSON = async (query: ResearchQueueEntry, datasetType: string) => {
    try {
      toast.info('Downloading research file...');

      
      const fileTypeMap: Record<string, string> = {
        'emissions': 'emissions',
        'investments': 'investments',
        'purchases': 'machine_purchases',
        'pilots': 'pilot_projects',
        'environments': 'project_environments',
      };

      const fileType = fileTypeMap[datasetType] || datasetType;

      
      const response = await apiFetch(`/api/sustainability/download-file?projectId=${query.id}&fileType=${fileType}`);

      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${datasetType}_${query.companies.join('_')}.json`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast.success(`Downloaded ${datasetType}.json`);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Failed to download file');
    }
  };

  const handleDeleteQuery = async (id: string) => {
    try {
      const response = await apiFetch(`/api/research-queue/${id}`, {
        method: 'DELETE',
      });

      const data = await parseJsonResponse(response, 'delete research entry');

      if (data.success) {
        toast.success('Research entry deleted');
        if (ENABLE_RESEARCH_HISTORY) {
          await fetchResearchHistory();
        }
      } else {
        toast.error(data.error || 'Failed to delete research entry');
      }
    } catch (error) {
      console.error('Error deleting research entry:', error);
      toast.error('Error deleting research entry');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
      {}
      <div className="border-b border-gray-200 bg-white px-8 py-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Deep Research Engine</h2>
          <p className="text-gray-600 mt-1">
            Automated web research for up to 4 companies. Generates structured Leads datasets.
          </p>
        </div>
      </div>

      {}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {}
        <Card className="mb-8 border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-purple-600" />
              Enter Companies to Research
            </CardTitle>
            <CardDescription>
              Enter up to 4 company names. The system will perform automated web research and
              generate five structured JSON datasets.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {companies.map((company, index) => (
                <Input
                  key={index}
                  value={company}
                  onChange={(e) => handleCompanyChange(index, e.target.value)}
                  placeholder={`Company ${index + 1}${index < 1 ? ' (required)' : ' (optional)'}`}
                  disabled={isResearching}
                />
              ))}
            </div>

            <div className="flex items-center gap-4 pt-2">
              <Button
                onClick={handleRunResearch}
                disabled={isResearching || companyInputs === 0}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isResearching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Researching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Run Deep Research
                  </>
                )}
              </Button>
              <p className="text-sm text-gray-600">
                {companyInputs} company{companyInputs !== 1 ? 'ies' : ''} to research
              </p>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-900">
              <p className="font-semibold mb-2">Generated Datasets:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Emissions Reductions</li>
                <li>Investments & Commitments</li>
                <li>Machine/Equipment Purchases</li>
                <li>Pilot Projects</li>
                <li>Environmental Constraints</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {}
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-gray-900">Research History</h3>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={printDebugLogsToConsole}>
                Print Logs
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadDebugLogs('json')}>
                Download Logs
              </Button>
            </div>
          </div>
          {!ENABLE_RESEARCH_HISTORY && latestResearchResults ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Results for: <span className="font-medium text-gray-900">{latestResearchCompanies.join(', ')}</span>
              </p>
              {!latestHasAnyResults && (
                <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  No sources found for this run. Check model configuration and Bedrock/API logs.
                </p>
              )}
              {(['emissions', 'investments', 'purchases', 'pilots', 'environments'] as const).map((category) => {
                const categoryLabels: Record<string, string> = {
                  emissions:    'Emissions Reductions',
                  investments:  'Investments & Commitments',
                  purchases:    'Machine/Equipment Purchases',
                  pilots:       'Pilot Projects',
                  environments: 'Environmental Constraints',
                };
                const rows: object[] = (latestResearchResults as Record<string, object[]>)[category] || [];
                return (
                  <Card key={category} className="border-0 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base capitalize">{categoryLabels[category]}</CardTitle>
                      <p className="text-xs text-gray-500">{rows.length} entr{rows.length === 1 ? 'y' : 'ies'}</p>
                    </CardHeader>
                    {rows.length > 0 && (
                      <CardContent>
                        <pre className="max-h-64 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
                          {JSON.stringify(rows, null, 2)}
                        </pre>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : isLoadingHistory ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-12 pb-12">
                <div className="flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  <span className="ml-2 text-gray-500">Loading research history...</span>
                </div>
              </CardContent>
            </Card>
          ) : researchHistory.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-12">
                <p className="text-center text-gray-500">
                  {ENABLE_RESEARCH_HISTORY
                    ? 'No research queries yet. Start by entering companies above.'
                    : 'Queue/history is disabled for isolation mode. Run Deep Research to view latest output above.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {researchHistory.map((entry) => (
                <Card key={entry.id} className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(entry.status)}
                          <h4 className="font-semibold text-gray-900">
                            {entry.companies.join(', ')}
                          </h4>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          Created: {new Date(entry.created_at).toLocaleDateString()}
                          {entry.completed_at && ` • Completed: ${new Date(entry.completed_at).toLocaleDateString()}`}
                        </p>
                        <div className="flex gap-2 mt-2 text-xs text-gray-500">
                          <span>{entry.files_generated} files</span>
                          <span>•</span>
                          <span>{entry.document_count} documents</span>
                          {entry.segment_count > 0 && (
                            <>
                              <span>•</span>
                              <span>{entry.segment_count} vector segments</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(entry.status)}`}>
                          {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteQuery(entry.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {entry.status === 'completed' && entry.project_id && (
                    <CardContent>
                      <div className="space-y-3">
                        {}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          {['emissions', 'investments', 'purchases', 'pilots', 'environments'].map((type) => (
                            <Button
                              key={type}
                              variant="outline"
                              size="sm"
                              onClick={() => handleExportJSON({ id: entry.project_id, companies: entry.companies, status: entry.status, created_at: entry.created_at, datasets: {} } as any, type)}
                              className="h-auto flex flex-col items-center gap-2 py-2"
                            >
                              <Download className="h-4 w-4" />
                              <span className="text-xs font-medium capitalize">
                                {type === 'investments' ? 'Investments' : type}
                              </span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
