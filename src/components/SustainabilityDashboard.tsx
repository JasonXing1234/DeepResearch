'use client'

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Leaf } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HybridResearchView } from './HybridResearchView';

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

const NAV_ITEMS = [
  { href: '/sustainability', label: 'Sustainability', icon: Leaf },
];

export function SustainabilityDashboard() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-screen">
      {/* Unified top nav */}
      <div className="h-[96px] bg-black border-b border-gray-800 flex items-center px-6 gap-5 shrink-0">
        <Image src="/cat-logo.png" alt="CAT" width={128} height={88} className="shrink-0" />
        <div className="w-px h-12 bg-gray-700 shrink-0" />
        <h1 className="text-4xl font-bold tracking-tight uppercase text-white">Deep Research Engine</h1>
      </div>

      {/* Below: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left nav */}
        <div className="w-64 bg-black border-r border-gray-800 flex flex-col shrink-0">
          <nav className="flex-1 p-4 space-y-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = href === '/sustainability'
                ? pathname === '/sustainability'
                : false;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded text-base font-medium transition-colors',
                    isActive
                      ? 'bg-[#FFCD11] text-gray-900 font-bold'
                      : 'text-gray-400 hover:bg-gray-900 hover:text-white',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Main content */}
        <HybridResearchView showHeader={false} />
      </div>
    </div>
  );
}
