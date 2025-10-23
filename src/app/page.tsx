'use client'

import { useState } from 'react';
import { DashboardNav } from '@/components/DashboardNav';
import { ProjectManager } from '@/components/modules/ProjectManager';
import { DeepResearchEngine } from '@/components/modules/DeepResearchEngine';
import { Toaster } from '@/components/ui/sonner';

export type DashboardModule = 'home' | 'projects' | 'research';

export default function DashboardPage() {
  const [activeModule, setActiveModule] = useState<DashboardModule>('home');

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Navigation Sidebar */}
      <DashboardNav activeModule={activeModule} onModuleChange={setActiveModule} />

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeModule === 'home' && <DashboardHome onModuleChange={setActiveModule} />}
        {activeModule === 'projects' && <ProjectManager />}
        {activeModule === 'research' && <DeepResearchEngine />}
        {activeModule === 'results' && <ResultsExplorer />}
      </main>

      <Toaster />
    </div>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Projects Module Card */}
          <div
            onClick={() => onModuleChange('projects')}
            className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer overflow-hidden border border-gray-200"
          >
            <div className="h-32 bg-gradient-to-br from-blue-500 to-blue-600" />
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Project Management</h2>
              <p className="text-gray-600 mb-4">
                Create and manage ESG analysis projects. Upload five report files and generate normalized Excel output.
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

          {/* Results Module Card */}
          <div
            onClick={() => onModuleChange('results')}
            className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer overflow-hidden border border-gray-200"
          >
            <div className="h-32 bg-gradient-to-br from-emerald-500 to-emerald-600" />
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Results Explorer</h2>
              <p className="text-gray-600 mb-4">
                View and analyze results in multiple formats: normalized, detailed, and diagnostic views.
              </p>
              <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                Open <span className="text-lg">→</span>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Features</h3>
            <ul className="space-y-3 text-gray-600">
              <li className="flex gap-3">
                <span className="text-blue-600 font-bold">✓</span>
                <span>Create and organize ESG analysis projects</span>
              </li>
              <li className="flex gap-3">
                <span className="text-blue-600 font-bold">✓</span>
                <span>Upload structured report files for analysis</span>
              </li>
              <li className="flex gap-3">
                <span className="text-blue-600 font-bold">✓</span>
                <span>Automated web research with Tavily integration</span>
              </li>
              <li className="flex gap-3">
                <span className="text-blue-600 font-bold">✓</span>
                <span>Multi-view results with normalized and detailed data</span>
              </li>
            </ul>
          </div>

          <div className="bg-white p-8 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Six Data Attributes</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-600 rounded-full" />
                Commitment to Reduce
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-600 rounded-full" />
                Net-zero Target
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-600 rounded-full" />
                Pilot Projects
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-600 rounded-full" />
                Investment Announced
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-600 rounded-full" />
                Equipment Purchased
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-600 rounded-full" />
                Project Environment
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
