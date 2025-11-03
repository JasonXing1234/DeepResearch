'use client'

import { useState, useEffect } from 'react';
import { Search, Trash2, Download, Loader2, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { toast } from 'sonner';

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

export function DeepResearchEngine() {
  const [companies, setCompanies] = useState(['', '', '', '']);
  const [isResearching, setIsResearching] = useState(false);
  const [researchHistory, setResearchHistory] = useState<ResearchQueueEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  
  useEffect(() => {
    fetchResearchHistory();
  }, []);

  const fetchResearchHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const response = await fetch('/api/research-queue');
      const data = await response.json();

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

  const companyInputs = companies.filter((c) => c.trim()).length;

  const handleCompanyChange = (index: number, value: string) => {
    const newCompanies = [...companies];
    newCompanies[index] = value;
    setCompanies(newCompanies);
  };

  const handleRunResearch = async () => {
    const activeCompanies = companies.filter((c) => c.trim());

    if (activeCompanies.length === 0) {
      toast.error('Enter at least one company name');
      return;
    }

    setIsResearching(true);
    toast.info('Starting deep research...');

    try {
      
      const projectResponse = await fetch('/api/sustainability/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Research: ${activeCompanies.join(', ')}`,
          description: `Automated research for ${activeCompanies.length} companies`,
        }),
      });

      const projectData = await projectResponse.json();

      if (!projectData.success) {
        toast.error(projectData.error || 'Failed to create project');
        setIsResearching(false);
        return;
      }

      const projectId = projectData.project.id;

      
      const researchResponse = await fetch('/api/research-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companies: activeCompanies.map(name => ({ name })),
          projectId: projectId,
        }),
      });

      const researchData = await researchResponse.json();

      if (researchData.success) {
        setCompanies(['', '', '', '']);
        toast.success(`Research completed! Generated ${researchData.uploadedFiles} report files.`);

        
        await fetchResearchHistory();
      } else {
        toast.error(researchData.error || 'Research failed');
      }
    } catch (error) {
      console.error('Error running research:', error);
      toast.error('Error running research');
    } finally {
      setIsResearching(false);
    }
  };

  const handleExportJSON = async (query: ResearchQuery, datasetType: string) => {
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

      
      const response = await fetch(`/api/sustainability/download-file?projectId=${query.id}&fileType=${fileType}`);

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
      const response = await fetch(`/api/research-queue/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Research entry deleted');
        await fetchResearchHistory();
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Research History</h3>
          {isLoadingHistory ? (
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
                  No research queries yet. Start by entering companies above.
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
