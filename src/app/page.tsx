'use client'

import { useState, useEffect } from 'react';
import { ProjectSidebar } from '../components/ProjectSidebar';
import { ProjectView } from '../components/ProjectView';
import { ProjectAssistant } from '../components/ProjectAssistant';
import { Toaster } from '../components/ui/sonner';
import { toast } from 'sonner';

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

export default function App() {
  const [currentView, setCurrentView] = useState<'upload' | 'project' | 'assistant'>('project');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<SustainabilityProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/sustainability/projects');
      const data = await response.json();

      if (data.success) {
        setProjects(data.projects);
        if (data.projects.length > 0 && !selectedProjectId) {
          setSelectedProjectId(data.projects[0].id);
        }
      } else {
        toast.error('Failed to load projects');
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      toast.error('Error loading projects');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProjectCreated = (newProject: SustainabilityProject) => {
    setProjects([newProject, ...projects]);
    setSelectedProjectId(newProject.id);
    setCurrentView('project');
  };

  const handleProjectDeleted = (projectId: string) => {
    setProjects(projects.filter((p) => p.id !== projectId));
    if (selectedProjectId === projectId) {
      setSelectedProjectId(projects.length > 0 ? projects[0].id : null);
    }
  };

  const handleProjectUpdated = (updatedProject: SustainabilityProject) => {
    setProjects(
      projects.map((p) => (p.id === updatedProject.id ? updatedProject : p))
    );
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="flex h-screen bg-gray-50">
      <ProjectSidebar
        projects={projects}
        selectedProjectId={selectedProjectId}
        currentView={currentView}
        onViewChange={setCurrentView}
        onProjectSelect={setSelectedProjectId}
        onProjectCreated={handleProjectCreated}
        onProjectDeleted={handleProjectDeleted}
        isLoading={isLoading}
        onProjectsRefresh={fetchProjects}
      />

      <main className="flex-1 overflow-hidden flex flex-col">
        {currentView === 'project' && selectedProject ? (
          <ProjectView project={selectedProject} onProjectUpdated={handleProjectUpdated} />
        ) : currentView === 'assistant' ? (
          <ProjectAssistant projects={projects} selectedProjectId={selectedProjectId} />
        ) : currentView === 'upload' && selectedProject ? (
          <ProjectView 
            project={selectedProject} 
            onProjectUpdated={handleProjectUpdated}
            initialTab="upload"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-500 text-lg">
                {projects.length === 0
                  ? 'Create a new project to get started'
                  : 'Select a project to view'}
              </p>
            </div>
          </div>
        )}
      </main>

      <Toaster />
    </div>
  );
}
