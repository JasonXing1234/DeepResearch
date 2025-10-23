'use client'

import { useState } from 'react';
import { Plus, Trash2, Upload, MessageSquare, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import type { SustainabilityProject } from '../app/page';

type ProjectSidebarProps = {
  projects: SustainabilityProject[];
  selectedProjectId: string | null;
  currentView: 'upload' | 'project' | 'assistant';
  onViewChange: (view: 'upload' | 'project' | 'assistant') => void;
  onProjectSelect: (projectId: string) => void;
  onProjectCreated: (project: SustainabilityProject) => void;
  onProjectDeleted: (projectId: string) => void;
  isLoading: boolean;
  onProjectsRefresh: () => void;
};

export function ProjectSidebar({
  projects,
  selectedProjectId,
  currentView,
  onViewChange,
  onProjectSelect,
  onProjectCreated,
  onProjectDeleted,
  isLoading,
  onProjectsRefresh,
}: ProjectSidebarProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toast.error('Project name is required');
      return;
    }

    try {
      setIsCreating(true);
      const response = await fetch('/api/sustainability/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName.trim(),
          description: projectDescription.trim() || null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        onProjectCreated(data.project);
        setProjectName('');
        setProjectDescription('');
        setIsDialogOpen(false);
        toast.success('Project created successfully');
      } else {
        toast.error(data.error || 'Failed to create project');
      }
    } catch (error) {
      console.error('Error creating project:', error);
      toast.error('Error creating project');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      setDeletingId(projectId);
      const response = await fetch('/api/sustainability/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      const data = await response.json();

      if (data.success) {
        onProjectDeleted(projectId);
        toast.success('Project deleted successfully');
      } else {
        toast.error(data.error || 'Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error('Error deleting project');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="w-64 border-r border-gray-200 bg-white flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900">Sustainability</h1>
        <p className="text-sm text-gray-600 mt-1">Data Processor</p>
      </div>

      {/* Action Buttons */}
      <div className="p-4 space-y-2 border-b border-gray-200">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full bg-blue-600 hover:bg-blue-700 justify-center" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>
                Create a new sustainability analysis project
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
                  placeholder="e.g., Q4 Sustainability Analysis"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateProject();
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <Textarea
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="Describe your project..."
                  rows={3}
                />
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateProject}
                  disabled={isCreating}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create'
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={currentView === 'upload' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewChange('upload')}
            className={currentView === 'upload' ? 'bg-blue-600 hover:bg-blue-700' : ''}
          >
            <Upload className="h-4 w-4" />
          </Button>
          <Button
            variant={currentView === 'assistant' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewChange('assistant')}
            className={currentView === 'assistant' ? 'bg-blue-600 hover:bg-blue-700' : ''}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-3 text-xs font-semibold text-gray-700 uppercase tracking-wider">
          My Projects
        </div>
        <ScrollArea className="flex-1">
          <div className="px-2 space-y-2 pb-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : projects.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">
                No projects yet. Create one to get started.
              </p>
            ) : (
              projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => {
                    onProjectSelect(project.id);
                    onViewChange('project');
                  }}
                  className={cn(
                    'p-3 rounded-lg cursor-pointer transition-colors border',
                    selectedProjectId === project.id
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="text-xs text-gray-500 truncate mt-1">
                          {project.description}
                        </p>
                      )}
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {project.analysis_status === 'completed' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Analyzed
                          </span>
                        )}
                        {project.analysis_status === 'processing' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            Processing
                          </span>
                        )}
                        {project.analysis_status === 'failed' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                            Failed
                          </span>
                        )}
                        {project.analysis_status === 'pending' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(project.id);
                      }}
                      disabled={deletingId === project.id}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
                      title="Delete project"
                    >
                      {deletingId === project.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
