// In-memory backing store for the Sustainability Data Processor feature
// (used both by the standalone /sustainability page and the main dashboard's
// "Projects" module — they hit the same API routes).
//
// This intentionally has no external database dependency: projects, uploaded
// company lists, and analysis results all live in module-level state for the
// lifetime of the server process. That's sufficient for this feature (no
// durability requirements were specified), and avoids adding new
// infrastructure just to unblock the UI.

import type { ResearchResults } from './research-report';

export type SustainabilityFileType =
  | 'emissions'
  | 'investments'
  | 'machine_purchases'
  | 'pilot_projects'
  | 'project_environments';

export const FILE_TYPE_TO_FIELD: Record<SustainabilityFileType, string> = {
  emissions: 'emissions_file_id',
  investments: 'investments_file_id',
  machine_purchases: 'machine_purchases_file_id',
  pilot_projects: 'pilot_projects_file_id',
  project_environments: 'project_environments_file_id',
};

// Maps the upload "file type" slots onto the 5 research categories that
// power the real research engine (shared with /simple).
export const FILE_TYPE_TO_CATEGORY: Record<SustainabilityFileType, keyof ResearchResults> = {
  emissions: 'emissions',
  investments: 'investments',
  machine_purchases: 'purchases',
  pilot_projects: 'pilots',
  project_environments: 'environments',
};

export type SustainabilityProject = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  emissions_file_id: string | null;
  investments_file_id: string | null;
  machine_purchases_file_id: string | null;
  pilot_projects_file_id: string | null;
  project_environments_file_id: string | null;
  analysis_status: 'pending' | 'processing' | 'completed' | 'failed';
  analysis_error: string | null;
  output_excel_file_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SustainabilityFile = {
  id: string;
  project_id: string;
  file_type: SustainabilityFileType;
  original_filename: string;
  file_size_bytes: number;
  upload_status: 'completed';
  companies: string[];
  created_at: string;
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

type ProjectResults = {
  raw: ResearchResults;
  summary: AnalysisResult[];
  details: AnalysisDetail[];
  diagnostics: AnalysisDiagnostic[];
};

// Module-level singletons — survive across requests within the same server
// process (Next.js keeps route modules warm between invocations in dev and
// within a single serverless instance in production).
const projects = new Map<string, SustainabilityProject>();
const files = new Map<string, SustainabilityFile[]>(); // projectId -> files
const results = new Map<string, ProjectResults>(); // projectId -> results

function makeId(prefix: string) {
  try {
    const randomUUID = globalThis.crypto?.randomUUID;
    if (typeof randomUUID === 'function') return randomUUID.call(globalThis.crypto);
  } catch {
    // fall through
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function listProjects(): SustainabilityProject[] {
  return Array.from(projects.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getProject(id: string): SustainabilityProject | undefined {
  return projects.get(id);
}

export function createProject(name: string, description: string | null): SustainabilityProject {
  const now = new Date().toISOString();
  const project: SustainabilityProject = {
    id: makeId('project'),
    user_id: 'local-user',
    name,
    description,
    emissions_file_id: null,
    investments_file_id: null,
    machine_purchases_file_id: null,
    pilot_projects_file_id: null,
    project_environments_file_id: null,
    analysis_status: 'pending',
    analysis_error: null,
    output_excel_file_id: null,
    created_at: now,
    updated_at: now,
  };
  projects.set(project.id, project);
  return project;
}

export function deleteProject(id: string): boolean {
  files.delete(id);
  results.delete(id);
  return projects.delete(id);
}

export function updateProject(id: string, patch: Partial<SustainabilityProject>): SustainabilityProject | undefined {
  const project = projects.get(id);
  if (!project) return undefined;
  const updated = { ...project, ...patch, updated_at: new Date().toISOString() };
  projects.set(id, updated);
  return updated;
}

export function listFiles(projectId: string): SustainabilityFile[] {
  return files.get(projectId) ?? [];
}

export function addFile(
  projectId: string,
  fileType: SustainabilityFileType,
  originalFilename: string,
  fileSizeBytes: number,
  companies: string[],
): SustainabilityFile {
  const file: SustainabilityFile = {
    id: makeId('file'),
    project_id: projectId,
    file_type: fileType,
    original_filename: originalFilename,
    file_size_bytes: fileSizeBytes,
    upload_status: 'completed',
    companies,
    created_at: new Date().toISOString(),
  };

  const existing = (files.get(projectId) ?? []).filter((f) => f.file_type !== fileType);
  existing.push(file);
  files.set(projectId, existing);

  return file;
}

export function getFileByType(projectId: string, fileType: SustainabilityFileType): SustainabilityFile | undefined {
  return listFiles(projectId).find((f) => f.file_type === fileType);
}

/** Union of all company names uploaded across the 5 file-type slots for a project (deduped, case-insensitive). */
export function getProjectCompanies(projectId: string): string[] {
  const seen = new Map<string, string>(); // lowercased -> original casing
  for (const file of listFiles(projectId)) {
    for (const name of file.companies) {
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    }
  }
  return Array.from(seen.values());
}

export function setProjectResults(projectId: string, data: ProjectResults): void {
  results.set(projectId, data);
}

export function getProjectResults(projectId: string): ProjectResults | undefined {
  return results.get(projectId);
}
