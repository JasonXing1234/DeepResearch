'use client'

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { FileUploadArea } from './sustainability/FileUploadArea';
import { AnalysisResultsView } from './sustainability/AnalysisResultsView';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Loader2 } from 'lucide-react';
import type {
  SustainabilityProject,
  AnalysisResult,
  AnalysisDetail,
  AnalysisDiagnostic,
} from '../app/page';

interface ProjectViewProps {
  project: SustainabilityProject;
  onProjectUpdated: (project: SustainabilityProject) => void;
  initialTab?: 'upload' | 'results' | 'details';
}

export function ProjectView({
  project,
  onProjectUpdated,
  initialTab = 'upload',
}: ProjectViewProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [summaryResults, setSummaryResults] = useState<AnalysisResult[]>([]);
  const [detailsResults, setDetailsResults] = useState<AnalysisDetail[]>([]);
  const [diagnosticsResults, setDiagnosticsResults] = useState<AnalysisDiagnostic[]>([]);
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleFileUploaded = () => {
    
    
  };

  const handleRunAnalysis = async () => {
    try {
      setIsAnalyzing(true);
      const response = await fetch('/api/sustainability/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Analysis completed successfully');
        await loadAnalysisResults();
        
        
        const updatedProject = { ...project, analysis_status: 'completed' as const };
        onProjectUpdated(updatedProject);
        setActiveTab('results');
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
    try {
      
      const summaryResponse = await fetch(
        `/api/sustainability/results?projectId=${project.id}&type=summary`
      );
      const summaryData = await summaryResponse.json();
      if (summaryData.success) {
        setSummaryResults(summaryData.results);
      }

      
      const detailsResponse = await fetch(
        `/api/sustainability/results?projectId=${project.id}&type=details`
      );
      const detailsData = await detailsResponse.json();
      if (detailsData.success) {
        setDetailsResults(detailsData.results);
      }

      
      const diagnosticsResponse = await fetch(
        `/api/sustainability/results?projectId=${project.id}&type=diagnostics`
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
    if (project.analysis_status === 'completed') {
      loadAnalysisResults();
    }
  }, [project.id]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-white">
      {}
      <div className="border-b border-gray-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{project.name}</h2>
            {project.description && (
              <p className="text-sm text-gray-600 mt-1">{project.description}</p>
            )}
          </div>
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

      {}
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="results" disabled={summaryResults.length === 0}>
                Summary
              </TabsTrigger>
              <TabsTrigger value="details" disabled={detailsResults.length === 0}>
                Details
              </TabsTrigger>
            </TabsList>

            {}
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
                    projectId={project.id}
                    project={project}
                    onFileUploaded={handleFileUploaded}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {}
            <TabsContent value="results" className="mt-6">
              {summaryResults.length > 0 ? (
                <AnalysisResultsView
                  resultsType="summary"
                  summaryResults={summaryResults}
                  projectId={project.id}
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

            {}
            <TabsContent value="details" className="mt-6">
              {detailsResults.length > 0 ? (
                <AnalysisResultsView
                  resultsType="details"
                  detailsResults={detailsResults}
                  projectId={project.id}
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

            {}
            {diagnosticsResults.length > 0 && (
              <TabsContent value="diagnostics" className="mt-6">
                <AnalysisResultsView
                  resultsType="diagnostics"
                  diagnosticsResults={diagnosticsResults}
                  projectId={project.id}
                />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
