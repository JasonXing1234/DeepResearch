'use client'

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ProjectManager } from './sustainability/ProjectManager';
import { FileUploadArea } from './sustainability/FileUploadArea';
import { AnalysisResultsView } from './sustainability/AnalysisResultsView';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Loader2 } from 'lucide-react';

export type SustainabilityProject = {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  emissions_file_id?: string;
  investments_file_id?: string;
  machine_purchases_file_id?: string;
  pilot_projects_file_id?: string;
  project_environments_file_id?: string;
  analysis_status: 'pending' | 'processing' | 'completed' | 'failed';
  analysis_error?: string;
  output_excel_file_id?: string;
  created_at: string;
  updated_at: string;
};

export type AnalysisResult = {
  id: string;
  project_id: string;
  company_name: string;
  commitment_to_reduce: boolean;
  net_zero_target: boolean;
  pilot: boolean;
  investment_announced: boolean;
  equipment_purchased: boolean;
  project_environment: boolean;
  created_at: string;
  updated_at: string;
};

export type AnalysisDetail = {
  id: string;
  project_id: string;
  customer: string;
  attribute: string;
  yes_no?: string;
  text_value?: string;
  source?: string;
  url?: string;
  source_file_type?: string;
  created_at: string;
  updated_at: string;
};

export type AnalysisDiagnostic = {
  id: string;
  project_id: string;
  company_name: string;
  emissions_count: number;
  investments_count: number;
  machine_purchases_count: number;
  pilot_projects_count: number;
  project_environments_count: number;
  total_count: number;
  created_at: string;
  updated_at: string;
};

export function SustainabilityDashboard() {
  const [projects, setProjects] = useState<SustainabilityProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<SustainabilityProject | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [summaryResults, setSummaryResults] = useState<AnalysisResult[]>([]);
  const [detailsResults, setDetailsResults] = useState<AnalysisDetail[]>([]);
  const [diagnosticsResults, setDiagnosticsResults] = useState<AnalysisDiagnostic[]>([]);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/sustainability/projects');
      const data = await response.json();

      if (data.success) {
        setProjects(data.projects);
        if (data.projects.length > 0 && !selectedProject) {
          setSelectedProject(data.projects[0]);
        }
      } else {
        toast.error('Failed to load projects');
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      toast.error('Error loading projects');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProjectCreated = (newProject: SustainabilityProject) => {
    setProjects([newProject, ...projects]);
    setSelectedProject(newProject);
    toast.success('Project created successfully');
  };

  const handleProjectDeleted = (projectId: string) => {
    setProjects(projects.filter((p) => p.id !== projectId));
    if (selectedProject?.id === projectId) {
      setSelectedProject(projects.length > 0 ? projects[0] : null);
    }
    toast.success('Project deleted successfully');
  };

  const handleProjectSelected = (project: SustainabilityProject) => {
    setSelectedProject(project);
    setSummaryResults([]);
    setDetailsResults([]);
    setDiagnosticsResults([]);
  };

  const handleFileUploaded = () => {
    if (selectedProject) {
      // Refresh project details
      loadProjects();
    }
  };

  const handleRunAnalysis = async () => {
    if (!selectedProject) {
      toast.error('Please select a project');
      return;
    }

    try {
      setIsAnalyzing(true);
      const response = await fetch('/api/sustainability/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProject.id }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Analysis completed successfully');
        // Load results
        await loadAnalysisResults();
        // Refresh project status
        await loadProjects();
      } else {
        toast.error(data.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('Error running analysis:', error);
      toast.error('Error running analysis');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const loadAnalysisResults = async () => {
    if (!selectedProject) return;

    try {
      // Load summary results
      const summaryResponse = await fetch(
        `/api/sustainability/results?projectId=${selectedProject.id}&type=summary`
      );
      const summaryData = await summaryResponse.json();
      if (summaryData.success) {
        setSummaryResults(summaryData.results);
      }

      // Load details results
      const detailsResponse = await fetch(
        `/api/sustainability/results?projectId=${selectedProject.id}&type=details`
      );
      const detailsData = await detailsResponse.json();
      if (detailsData.success) {
        setDetailsResults(detailsData.results);
      }

      // Load diagnostics results
      const diagnosticsResponse = await fetch(
        `/api/sustainability/results?projectId=${selectedProject.id}&type=diagnostics`
      );
      const diagnosticsData = await diagnosticsResponse.json();
      if (diagnosticsData.success) {
        setDiagnosticsResults(diagnosticsData.results);
      }
    } catch (error) {
      console.error('Error loading analysis results:', error);
      toast.error('Error loading analysis results');
    }
  };

  useEffect(() => {
    if (selectedProject?.analysis_status === 'completed') {
      loadAnalysisResults();
    }
  }, [selectedProject?.id]);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-200 bg-white overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">Sustainability</h1>
          <p className="text-sm text-gray-600 mt-1">Data Processor</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <ProjectManager
            projects={projects}
            selectedProject={selectedProject}
            onProjectCreated={handleProjectCreated}
            onProjectDeleted={handleProjectDeleted}
            onProjectSelected={handleProjectSelected}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedProject ? (
          <>
            {/* Header */}
            <div className="border-b border-gray-200 bg-white px-8 py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {selectedProject.name}
                  </h2>
                  {selectedProject.description && (
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedProject.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={handleRunAnalysis}
                    disabled={isAnalyzing}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      'Run Analysis'
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-8 py-6">
                <Tabs defaultValue="upload" className="w-full">
                  <TabsList className="grid w-full max-w-md grid-cols-3">
                    <TabsTrigger value="upload">Upload</TabsTrigger>
                    <TabsTrigger value="results" disabled={summaryResults.length === 0}>
                      Results
                    </TabsTrigger>
                    <TabsTrigger value="details" disabled={detailsResults.length === 0}>
                      Details
                    </TabsTrigger>
                  </TabsList>

                  {/* Upload Tab */}
                  <TabsContent value="upload" className="mt-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Upload Reports</CardTitle>
                        <CardDescription>
                          Upload up to 5 report files for analysis
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <FileUploadArea
                          projectId={selectedProject.id}
                          project={selectedProject}
                          onFileUploaded={handleFileUploaded}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Results Tab */}
                  <TabsContent value="results" className="mt-6">
                    {summaryResults.length > 0 ? (
                      <AnalysisResultsView
                        resultsType="summary"
                        summaryResults={summaryResults}
                        projectId={selectedProject.id}
                      />
                    ) : (
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-center text-gray-500">
                            No results available. Run analysis to see summary results.
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>

                  {/* Details Tab */}
                  <TabsContent value="details" className="mt-6">
                    {detailsResults.length > 0 ? (
                      <AnalysisResultsView
                        resultsType="details"
                        detailsResults={detailsResults}
                        projectId={selectedProject.id}
                      />
                    ) : (
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-center text-gray-500">
                            No details available. Run analysis to see detailed results.
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>

                  {/* Diagnostics Tab */}
                  {diagnosticsResults.length > 0 && (
                    <TabsContent value="diagnostics" className="mt-6">
                      <AnalysisResultsView
                        resultsType="diagnostics"
                        diagnosticsResults={diagnosticsResults}
                        projectId={selectedProject.id}
                      />
                    </TabsContent>
                  )}
                </Tabs>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Card className="w-96 border-0 shadow-lg">
              <CardContent className="pt-12">
                <p className="text-center text-gray-500 text-lg">
                  Create a new project to get started
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
