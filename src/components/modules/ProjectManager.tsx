'use client'

import { useState } from 'react';
import { Plus, Trash2, Download, Play, MoreVertical } from 'lucide-react';
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

interface MockProject {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  files: {
    emissions?: { name: string; size: number };
    investments?: { name: string; size: number };
    purchases?: { name: string; size: number };
    pilots?: { name: string; size: number };
    environments?: { name: string; size: number };
    output?: { name: string; size: number };
  };
}

const MOCK_PROJECTS: MockProject[] = [
  {
    id: '1',
    name: 'Tech Giants Q4 2024',
    description: 'Sustainability analysis for major tech companies',
    status: 'completed',
    created_at: '2024-01-15',
    files: {
      emissions: { name: 'emissions_report.txt', size: 124567 },
      investments: { name: 'investments_report.txt', size: 98234 },
      purchases: { name: 'purchases_report.txt', size: 156789 },
      pilots: { name: 'pilots_report.txt', size: 87654 },
      environments: { name: 'environments_report.txt', size: 112345 },
      output: { name: 'analysis_output.xlsx', size: 256789 },
    },
  },
  {
    id: '2',
    name: 'Energy Sector Analysis',
    description: 'ESG data for renewable energy companies',
    status: 'completed',
    created_at: '2024-01-10',
    files: {
      emissions: { name: 'emissions_data.txt', size: 145678 },
      investments: { name: 'investments_data.txt', size: 103456 },
      pilots: { name: 'pilots_data.txt', size: 94567 },
      output: { name: 'energy_analysis.xlsx', size: 234567 },
    },
  },
];

export function ProjectManager() {
  const [projects, setProjects] = useState<MockProject[]>(MOCK_PROJECTS);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');

  const handleCreateProject = () => {
    if (!projectName.trim()) {
      toast.error('Project name is required');
      return;
    }

    const newProject: MockProject = {
      id: Math.random().toString(36).substr(2, 9),
      name: projectName,
      description: projectDescription,
      status: 'pending',
      created_at: new Date().toISOString().split('T')[0],
      files: {},
    };

    setProjects([newProject, ...projects]);
    setProjectName('');
    setProjectDescription('');
    setIsDialogOpen(false);
    toast.success('Project created successfully');
  };

  const handleDeleteProject = (id: string) => {
    setProjects(projects.filter((p) => p.id !== id));
    toast.success('Project deleted');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Projects</h2>
            <p className="text-gray-600 mt-1">
              Manage your ESG analysis projects and upload report files
            </p>
          </div>
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
                  Start a new ESG analysis project by providing basic information
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
                    Description
                  </label>
                  <Textarea
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    placeholder="Describe your project..."
                    rows={3}
                  />
                </div>
                <div className="flex gap-3 justify-end pt-4">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateProject}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Create Project
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {projects.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-12">
              <p className="text-center text-gray-500 text-lg">
                No projects yet. Create one to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <Card key={project.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                          {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{project.description}</p>
                      <p className="text-xs text-gray-500 mt-2">Created on {project.created_at}</p>
                    </div>
                    <div className="flex gap-2">
                      {project.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="default"
                          className="bg-blue-600 hover:bg-blue-700"
                          onClick={() => toast.info('Analysis started')}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Run Analysis
                        </Button>
                      )}
                      {project.files.output && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toast.info('Downloading output.xlsx')}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteProject(project.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
                    {['emissions', 'investments', 'purchases', 'pilots', 'environments', 'output'].map((type) => {
                      const file = project.files[type as keyof typeof project.files];
                      return (
                        <div
                          key={type}
                          className={`p-3 rounded-lg border ${
                            file
                              ? 'bg-green-50 border-green-200'
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <p className="font-medium text-gray-900 capitalize text-xs">
                            {type === 'purchases' ? 'Purchases' : type === 'output' ? 'Output' : type}
                          </p>
                          {file ? (
                            <p className="text-xs text-gray-600 mt-1">✓ Uploaded</p>
                          ) : (
                            <p className="text-xs text-gray-500 mt-1">Not uploaded</p>
                          )}
                        </div>
                      );
                    })}
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
