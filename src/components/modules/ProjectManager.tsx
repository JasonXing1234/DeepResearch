'use client'

import { useState } from 'react';
import { Plus, Trash2, Download, Play, ArrowLeft, FileUp, BarChart3 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
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

const MOCK_SUMMARY = [
  {
    company: 'Apple',
    commitment_to_reduce: true,
    net_zero_target: true,
    pilot: true,
    investment_announced: true,
    equipment_purchased: true,
    project_environment: true,
  },
  {
    company: 'Microsoft',
    commitment_to_reduce: true,
    net_zero_target: true,
    pilot: true,
    investment_announced: true,
    equipment_purchased: true,
    project_environment: true,
  },
  {
    company: 'Google',
    commitment_to_reduce: true,
    net_zero_target: true,
    pilot: false,
    investment_announced: true,
    equipment_purchased: true,
    project_environment: true,
  },
];

const MOCK_DETAILS = [
  {
    customer: 'Apple',
    attribute: 'Commitment to Reduce',
    yes_no: 'Yes',
    text: 'Apple committed to reducing carbon footprint by 75% by 2030',
    source: 'emissions',
    url: 'https://apple.com/environment',
  },
  {
    customer: 'Apple',
    attribute: 'Net-zero Target',
    yes_no: 'Yes',
    text: 'Carbon neutral by 2030 for Scope 1 and 2 emissions',
    source: 'emissions',
    url: 'https://apple.com/environment',
  },
  {
    customer: 'Microsoft',
    attribute: 'Investment Announced',
    yes_no: 'Yes',
    text: '$10 billion innovation fund for carbon removal technologies',
    source: 'investments',
    url: 'https://microsoft.com/climate',
  },
  {
    customer: 'Google',
    attribute: 'Equipment Purchased',
    yes_no: 'Yes',
    text: 'Purchased renewable energy equipment for data centers',
    source: 'purchases',
    url: 'https://google.com/sustainability',
  },
];

const MOCK_DIAGNOSTICS = [
  {
    company: 'Apple',
    emissions: 3,
    investments: 2,
    purchases: 4,
    pilots: 2,
    environments: 3,
  },
  {
    company: 'Microsoft',
    emissions: 4,
    investments: 5,
    purchases: 3,
    pilots: 3,
    environments: 2,
  },
  {
    company: 'Google',
    emissions: 3,
    investments: 3,
    purchases: 4,
    pilots: 0,
    environments: 4,
  },
];

export function ProjectManager() {
  const [projects, setProjects] = useState<MockProject[]>(MOCK_PROJECTS);
  const [selectedProject, setSelectedProject] = useState<MockProject | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

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
    if (selectedProject?.id === id) {
      setSelectedProject(null);
    }
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

  const filteredSummary = MOCK_SUMMARY.filter((item) =>
    item.company.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDetails = MOCK_DETAILS.filter(
    (item) =>
      item.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.attribute.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDiagnostics = MOCK_DIAGNOSTICS.filter((item) =>
    item.company.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Project Detail View
  if (selectedProject) {
    return (
      <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedProject(null)}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Projects
              </Button>
              <div>
                <h2 className="text-3xl font-bold text-gray-900">{selectedProject.name}</h2>
                {selectedProject.description && (
                  <p className="text-gray-600 mt-1">{selectedProject.description}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {selectedProject.status === 'pending' && (
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Play className="h-4 w-4 mr-2" />
                  Run Analysis
                </Button>
              )}
              {selectedProject.files.output && (
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Download Excel
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="files" className="h-full flex flex-col">
            <div className="bg-white border-b border-gray-200 px-8 pt-6">
              <TabsList>
                <TabsTrigger value="files" className="flex items-center gap-2">
                  <FileUp className="h-4 w-4" />
                  Upload Files
                </TabsTrigger>
                <TabsTrigger value="results" className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Results
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-6">
              {/* Upload Files Tab */}
              <TabsContent value="files" className="mt-0">
                <div className="space-y-6">
                  {/* Files Status */}
                  <Card className="border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle>Project Files</CardTitle>
                      <CardDescription>
                        Status of uploaded reports (5 required + 1 output)
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {['emissions', 'investments', 'purchases', 'pilots', 'environments', 'output'].map(
                          (type) => {
                            const file = selectedProject.files[type as keyof typeof selectedProject.files];
                            return (
                              <div
                                key={type}
                                className={`p-4 rounded-lg border text-center ${
                                  file
                                    ? 'bg-green-50 border-green-200'
                                    : 'bg-gray-50 border-gray-200'
                                }`}
                              >
                                <p className="font-medium text-gray-900 capitalize text-sm mb-2">
                                  {type === 'purchases' ? 'Purchases' : type === 'output' ? 'Excel Output' : type}
                                </p>
                                {file ? (
                                  <div>
                                    <p className="text-xs text-green-700 font-semibold mb-1">✓ Uploaded</p>
                                    <p className="text-xs text-gray-600">{file.name}</p>
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-500">Not uploaded</p>
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Upload Area */}
                  <Card className="border-0 shadow-sm">
                    <CardHeader>
                      <CardTitle>Upload Reports</CardTitle>
                      <CardDescription>
                        Drag and drop or click to upload report files
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {['emissions', 'investments', 'purchases', 'pilots', 'environments'].map((type) => (
                          <div
                            key={type}
                            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors cursor-pointer"
                          >
                            <FileUp className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                            <p className="font-medium text-gray-900 capitalize">{type}</p>
                            <p className="text-sm text-gray-600 mt-1">Click to upload or drag and drop</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Results Tab */}
              <TabsContent value="results" className="mt-0">
                <div className="space-y-6">
                  {/* Search */}
                  <div className="mb-4">
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search companies or attributes..."
                      className="max-w-md"
                    />
                  </div>

                  {/* Results Tabs */}
                  <Tabs defaultValue="normalized" className="w-full">
                    <TabsList className="mb-4">
                      <TabsTrigger value="normalized">Normalized View</TabsTrigger>
                      <TabsTrigger value="details">Original View</TabsTrigger>
                      <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
                    </TabsList>

                    {/* Normalized View */}
                    <TabsContent value="normalized">
                      <Card className="border-0 shadow-sm">
                        <CardHeader>
                          <CardTitle>Summary by Company</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-200 bg-gray-50">
                                  <th className="px-4 py-3 text-left font-semibold text-gray-900">
                                    Company
                                  </th>
                                  <th className="px-4 py-3 text-center font-semibold text-gray-900">
                                    Commitment
                                  </th>
                                  <th className="px-4 py-3 text-center font-semibold text-gray-900">
                                    Net-zero
                                  </th>
                                  <th className="px-4 py-3 text-center font-semibold text-gray-900">
                                    Pilot
                                  </th>
                                  <th className="px-4 py-3 text-center font-semibold text-gray-900">
                                    Investment
                                  </th>
                                  <th className="px-4 py-3 text-center font-semibold text-gray-900">
                                    Equipment
                                  </th>
                                  <th className="px-4 py-3 text-center font-semibold text-gray-900">
                                    Environment
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {filteredSummary.map((row) => (
                                  <tr key={row.company} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">
                                      {row.company}
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
                                        {row[attr as keyof typeof row] ? (
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
                    </TabsContent>

                    {/* Original View */}
                    <TabsContent value="details">
                      <div className="space-y-4">
                        {filteredDetails.map((item, idx) => (
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

                              <div className="mb-4">
                                <p className="text-xs text-gray-600 font-semibold uppercase mb-2">Text</p>
                                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                                  {item.text}
                                </p>
                              </div>

                              {item.url && (
                                <div>
                                  <p className="text-xs text-gray-600 font-semibold uppercase mb-2">
                                    Source URL
                                  </p>
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline text-sm"
                                  >
                                    {item.url}
                                  </a>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </TabsContent>

                    {/* Diagnostics View */}
                    <TabsContent value="diagnostics">
                      <Card className="border-0 shadow-sm">
                        <CardHeader>
                          <CardTitle>Diagnostics by Company</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-200 bg-gray-50">
                                  <th className="px-4 py-3 text-left font-semibold text-gray-900">
                                    Company
                                  </th>
                                  <th className="px-4 py-3 text-center font-semibold text-gray-900">
                                    Emissions
                                  </th>
                                  <th className="px-4 py-3 text-center font-semibold text-gray-900">
                                    Investments
                                  </th>
                                  <th className="px-4 py-3 text-center font-semibold text-gray-900">
                                    Purchases
                                  </th>
                                  <th className="px-4 py-3 text-center font-semibold text-gray-900">
                                    Pilots
                                  </th>
                                  <th className="px-4 py-3 text-center font-semibold text-gray-900">
                                    Environments
                                  </th>
                                  <th className="px-4 py-3 text-center font-semibold text-gray-900">
                                    Total
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {filteredDiagnostics.map((row) => (
                                  <tr key={row.company} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">
                                      {row.company}
                                    </td>
                                    <td className="px-4 py-3 text-center text-gray-700">{row.emissions}</td>
                                    <td className="px-4 py-3 text-center text-gray-700">{row.investments}</td>
                                    <td className="px-4 py-3 text-center text-gray-700">{row.purchases}</td>
                                    <td className="px-4 py-3 text-center text-gray-700">{row.pilots}</td>
                                    <td className="px-4 py-3 text-center text-gray-700">{row.environments}</td>
                                    <td className="px-4 py-3 text-center font-semibold text-gray-900">
                                      {row.emissions +
                                        row.investments +
                                        row.purchases +
                                        row.pilots +
                                        row.environments}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    );
  }

  // Projects List View
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
              <Card
                key={project.id}
                onClick={() => setSelectedProject(project)}
                className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            project.status
                          )}`}
                        >
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
                          onClick={(e) => {
                            e.stopPropagation();
                            toast.info('Analysis started');
                          }}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Run Analysis
                        </Button>
                      )}
                      {project.files.output && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            toast.info('Downloading output.xlsx');
                          }}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProject(project.id);
                        }}
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
                            file ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
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
