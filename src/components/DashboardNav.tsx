'use client'

import { Home, FolderOpen, Search, BarChart3, Settings, LogOut } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import type { DashboardModule } from '@/app/page';

interface DashboardNavProps {
  activeModule: DashboardModule;
  onModuleChange: (module: DashboardModule) => void;
}

const NAV_ITEMS = [
  { id: 'home' as DashboardModule, label: 'Home', icon: Home },
  { id: 'projects' as DashboardModule, label: 'Projects', icon: FolderOpen },
  { id: 'research' as DashboardModule, label: 'Deep Research', icon: Search },
];

export function DashboardNav({ activeModule, onModuleChange }: DashboardNavProps) {
  return (
    <div className="w-64 border-r border-gray-200 bg-white flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900">ESG Research</h1>
        <p className="text-xs text-gray-600 mt-1 font-medium">DASHBOARD</p>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-4 space-y-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;

          return (
            <Button
              key={item.id}
              onClick={() => onModuleChange(item.id)}
              variant={isActive ? 'default' : 'ghost'}
              className={cn(
                'w-full justify-start gap-3 px-4 py-2.5 rounded-lg transition-colors',
                isActive
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="font-medium">{item.label}</span>
            </Button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-gray-700 hover:bg-gray-100"
        >
          <Settings className="h-5 w-5" />
          <span className="font-medium">Settings</span>
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-gray-700 hover:bg-gray-100"
        >
          <LogOut className="h-5 w-5" />
          <span className="font-medium">Sign Out</span>
        </Button>
      </div>
    </div>
  );
}
