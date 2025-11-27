'use client'

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Download, FileUp, FileText, ArrowLeft, Globe, Folder } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { ResultsExplorer } from './ResultsExplorer';
import { GlobalResultsExplorer } from './GlobalResultsExplorer';

interface Project {
  id: string;
  name: string;
  description: string;
  analysis_status: string;
  created_at: string;
  emissions_file_id?: string | null;
  investments_file_id?: string | null;
  machine_purchases_file_id?: string | null;
  pilot_projects_file_id?: string | null;
  project_environments_file_id?: string | null;
}

interface ProjectFile {
  id: string;
  file_type: string;
  original_filename: string;
  file_size_bytes: number;
  upload_status: string;
}

const FILE_TYPES = [
  { id: 'emissions', label: 'Emissions Reductions', required: true },
  { id: 'investments', label: 'Investments & Commitments', required: true },
  { id: 'machine_purchases', label: 'Machine Purchases', required: true },
  { id: 'pilot_projects', label: 'Pilot Projects', required: true },
  { id: 'project_environments', label: 'Project Environments', required: true },
];

export function ProjectManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadingFileType, setUploadingFileType] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [viewResults, setViewResults] = useState(false);
  const [isGlobalView, setIsGlobalView] = useState(false);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchProjectFiles(selectedProject.id);
    }
  }, [selectedProject]);

  
  useEffect(() => {
    if (!selectedProject || selectedProject.analysis_status !== 'processing') {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/sustainability/projects');
        const data = await response.json();

        if (data.success) {
          const updatedProject = data.projects.find((p: Project) => p.id === selectedProject.id);
          if (updatedProject && updatedProject.analysis_status !== 'processing') {
            setSelectedProject(updatedProject);
            setProjects(data.projects);

            if (updatedProject.analysis_status === 'completed') {
              toast.success('Analysis completed successfully!');
            } else if (updatedProject.analysis_status === 'failed') {
              toast.error('Analysis failed. Please try again.');
            }
          }
        }
      } catch (error) {
        console.error('Error polling project status:', error);
      }
    }, 3000); 

    return () => clearInterval(pollInterval);
  }, [selectedProject]);

  const fetchProjects = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/sustainability/projects');
      const data = await response.json();

      if (data.success) {
        setProjects(data.projects || []);
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

  const fetchProjectFiles = async (projectId: string) => {
    try {
      const response = await fetch(`/api/sustainability/files?projectId=${projectId}`);
      const data = await response.json();

      if (data.success) {
        setProjectFiles(data.files || []);
      }
    } catch (error) {
      console.error('Error fetching project files:', error);
    }
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toast.error('Project name is required');
      return;
    }

    try {
      const response = await fetch('/api/sustainability/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName,
          description: projectDescription,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Project created successfully');
        setProjectName('');
        setProjectDescription('');
        setIsDialogOpen(false);
        await fetchProjects();
      } else {
        toast.error(data.error || 'Failed to create project');
      }
    } catch (error) {
      console.error('Error creating project:', error);
      toast.error('Error creating project');
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      const response = await fetch('/api/sustainability/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Project deleted successfully');
        await fetchProjects();
        if (selectedProject?.id === projectId) {
          setSelectedProject(null);
        }
      } else {
        toast.error(data.error || 'Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error('Error deleting project');
    }
  };

  const handleFileUpload = async (projectId: string, fileType: string, file: File) => {
    if (!file) return;

    setUploadingFileType(fileType);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      formData.append('fileType', fileType);

      const response = await fetch('/api/sustainability/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`${fileType} file uploaded successfully`);
        await fetchProjects();
        if (selectedProject) {
          await fetchProjectFiles(selectedProject.id);
          
          const updated = await fetch(`/api/sustainability/projects?id=${selectedProject.id}`);
          const updatedData = await updated.json();
          if (updatedData.success) {
            setSelectedProject(updatedData.project);
          }
        }
      } else {
        toast.error(data.error || 'Failed to upload file');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Error uploading file');
    } finally {
      setUploadingFileType(null);
    }
  };

  const handleExportExcel = async (projectId: string) => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/sustainability/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedProject?.name.replace(/[^a-zA-Z0-9]/g, '_')}_attributes.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast.success('Excel file exported successfully');
    } catch (error) {
      console.error('Error exporting Excel:', error);
      toast.error('Error exporting Excel file');
    } finally {
      setIsExporting(false);
    }
  };

  const handleAnalyze = async (projectId: string) => {
    try {
      const response = await fetch('/api/sustainability/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Analysis started. This may take a few minutes.');
        
        await fetchProjects();
        if (selectedProject) {
          const updatedProject = projects.find(p => p.id === selectedProject.id);
          if (updatedProject) {
            setSelectedProject(updatedProject);
          }
        }
      } else {
        toast.error(data.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('Error starting analysis:', error);
      toast.error('Error starting analysis');
    }
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getFileForType = (fileType: string): ProjectFile | undefined => {
    return projectFiles.find(f => f.file_type === fileType);
  };

  const hasRequiredFiles = (project: Project): boolean => {
    return !!(
      project.emissions_file_id &&
      project.investments_file_id &&
      project.machine_purchases_file_id &&
      project.pilot_projects_file_id &&
      project.project_environments_file_id
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (isGlobalView) {
    return (
      <GlobalResultsExplorer
        projects={projects.filter(p => p.analysis_status === 'completed')}
        onBack={() => setIsGlobalView(false)}
      />
    );
  }

  if (selectedProject && viewResults) {
    return (
      <ResultsExplorer
        projectId={selectedProject.id}
        onBack={() => setViewResults(false)}
      />
    );
  }

  if (selectedProject) {
    return (
      <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
        {}
        <div className="border-b border-gray-200 bg-white px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => setSelectedProject(null)}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h2 className="text-3xl font-bold text-gray-900">{selectedProject.name}</h2>
                {selectedProject.description && (
                  <p className="text-gray-600 mt-1">{selectedProject.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {hasRequiredFiles(selectedProject) && (
                <>
                  <Button
                    onClick={() => handleAnalyze(selectedProject.id)}
                    disabled={selectedProject.analysis_status === 'processing'}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {selectedProject.analysis_status === 'processing' ? 'Analyzing...' : 'Analyze'}
                  </Button>
                  <Button
                    onClick={() => handleExportExcel(selectedProject.id)}
                    disabled={isExporting}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {isExporting ? 'Exporting...' : 'Export Excel'}
                  </Button>
                </>
              )}
              {selectedProject.analysis_status === 'completed' && (
                <Button
                  onClick={() => setViewResults(true)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  View Results
                </Button>
              )}
            </div>
          </div>
        </div>

        {}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Upload Report Files</CardTitle>
              <CardDescription>
                Upload all 5 required report files (JSON or TXT format) to enable Excel export
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {FILE_TYPES.map((fileType) => {
                const existingFile = getFileForType(fileType.id);
                const isUploading = uploadingFileType === fileType.id;

                return (
                  <div key={fileType.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-gray-500" />
                        <h4 className="font-medium text-gray-900">{fileType.label}</h4>
                        {fileType.required && (
                          <span className="text-xs text-red-600 font-medium">*Required</span>
                        )}
                      </div>
                      {existingFile && (
                        <p className="text-sm text-gray-600 mt-1">
                          {existingFile.original_filename} ({formatFileSize(existingFile.file_size_bytes)})
                        </p>
                      )}
                    </div>
                    <div>
                      <input
                        type="file"
                        ref={el => { fileInputRefs.current[fileType.id] = el; }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleFileUpload(selectedProject.id, fileType.id, file);
                          }
                        }}
                        accept=".json,.txt"
                        className="hidden"
                      />
                      <Button
                        onClick={() => fileInputRefs.current[fileType.id]?.click()}
                        disabled={isUploading}
                        variant={existingFile ? 'outline' : 'default'}
                        className={existingFile ? '' : 'bg-blue-600 hover:bg-blue-700'}
                      >
                        <FileUp className="h-4 w-4 mr-2" />
                        {isUploading ? 'Uploading...' : (existingFile ? 'Replace' : 'Upload')}
                      </Button>
                    </div>
                  </div>
                );
              })}

              {!hasRequiredFiles(selectedProject) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
                  <p className="font-medium">Upload all 5 required files to enable Excel export</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
      {}
      <div className="border-b border-gray-200 bg-white px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Projects</h2>
            <p className="text-gray-600 mt-1">
              Manage your Leads analysis projects and upload report files
            </p>
          </div>
          <div className="flex items-center gap-3">
            {projects.filter(p => p.analysis_status === 'completed').length > 0 && (
              <Button
                variant="outline"
                onClick={() => setIsGlobalView(true)}
                className="border-purple-600 text-purple-600 hover:bg-purple-50"
              >
                <Globe className="h-4 w-4 mr-2" />
                Global View
              </Button>
            )}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  New Project
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Project</DialogTitle>
                  <DialogDescription>
                    Start a new Leads analysis project by providing basic information
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Project Name
                    </label>
                    <Input
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="e.g., Tech Giants Q4 2024"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description (Optional)
                    </label>
                    <Textarea
                      value={projectDescription}
                      onChange={(e) => setProjectDescription(e.target.value)}
                      placeholder="Describe the purpose of this project..."
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateProject} className="bg-blue-600 hover:bg-blue-700">
                      Create Project
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {}
      <div className="border-b border-gray-200 bg-white px-8 py-4">
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search projects..."
          className="max-w-md"
        />
      </div>

      {}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading projects...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">
              {searchTerm ? 'No projects match your search' : 'No projects yet. Create your first project to get started.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <Card
                key={project.id}
                className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedProject(project)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                      {project.description && (
                        <CardDescription className="mt-1">{project.description}</CardDescription>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(project.id);
                      }}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 -mt-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Created:</span>
                      <span className="font-medium">
                        {new Date(project.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Status:</span>
                      <span className={`font-medium ${
                        project.analysis_status === 'completed' ? 'text-green-600' :
                        project.analysis_status === 'processing' ? 'text-blue-600' :
                        project.analysis_status === 'failed' ? 'text-red-600' :
                        'text-gray-600'
                      }`}>
                        {project.analysis_status.charAt(0).toUpperCase() + project.analysis_status.slice(1)}
                      </span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="text-xs text-gray-500">
                        {hasRequiredFiles(project) ? (
                          <span className="text-green-600 font-medium">✓ All files uploaded</span>
                        ) : (
                          <span className="text-yellow-600">Upload files to enable export</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
