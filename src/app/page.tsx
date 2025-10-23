'use client'

import { useState } from 'react';
import { DashboardNav } from '@/components/DashboardNav';
import { ProjectManager } from '@/components/modules/ProjectManager';
import { DeepResearchEngine } from '@/components/modules/DeepResearchEngine';
import { DashboardAssistant } from '@/components/modules/DashboardAssistant';
import { ResearchProvider } from '@/contexts/ResearchContext';
import { Toaster } from '@/components/ui/sonner';

export type DashboardModule = 'home' | 'projects' | 'research' | 'assistant';

export default function DashboardPage() {
  const [activeModule, setActiveModule] = useState<DashboardModule>('home');

  return (
    <ResearchProvider>
      <div className="flex h-screen bg-gray-50">
        {/* Navigation Sidebar */}
        <DashboardNav activeModule={activeModule} onModuleChange={setActiveModule} />

        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {activeModule === 'home' && <DashboardHome onModuleChange={setActiveModule} />}
          {activeModule === 'projects' && <ProjectManager />}
          {activeModule === 'research' && <DeepResearchEngine />}
          {activeModule === 'assistant' && <DashboardAssistant />}
        </main>

        <Toaster />
      </div>
    </ResearchProvider>
  );
}

function DashboardHome({ onModuleChange }: { onModuleChange: (module: DashboardModule) => void }) {
  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">ESG Research Dashboard</h1>
          <p className="text-xl text-gray-600">
            Comprehensive sustainability and ESG data research platform
          </p>
        </div>

        {/* Module Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Projects Module Card */}
          <div
            onClick={() => onModuleChange('projects')}
            className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer overflow-hidden border border-gray-200"
          >
            <div className="h-32 bg-gradient-to-br from-blue-500 to-blue-600" />
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Project Management</h2>
              <p className="text-gray-600 mb-4">
                Create and manage ESG analysis projects. Upload five report files, run analysis, and view results directly within each project.
              </p>
              <div className="flex items-center gap-2 text-blue-600 font-semibold">
                Open <span className="text-lg">→</span>
              </div>
            </div>
          </div>

          {/* Deep Research Module Card */}
          <div
            onClick={() => onModuleChange('research')}
            className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer overflow-hidden border border-gray-200"
          >
            <div className="h-32 bg-gradient-to-br from-purple-500 to-purple-600" />
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Deep Research Engine</h2>
              <p className="text-gray-600 mb-4">
                Automated web research for up to 4 companies. Generate structured ESG datasets automatically.
              </p>
              <div className="flex items-center gap-2 text-purple-600 font-semibold">
                Open <span className="text-lg">→</span>
              </div>
            </div>
          </div>

          {/* AI Assistant Module Card */}
          <div
            onClick={() => onModuleChange('assistant')}
            className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer overflow-hidden border border-gray-200"
          >
            <div className="h-32 bg-gradient-to-br from-cyan-500 to-blue-600" />
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">AI Assistant</h2>
              <p className="text-gray-600 mb-4">
                Intelligent assistant that queries both project analysis and deep research data to provide insights on ESG metrics.
              </p>
              <div className="flex items-center gap-2 text-cyan-600 font-semibold">
                Open <span className="text-lg">→</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
