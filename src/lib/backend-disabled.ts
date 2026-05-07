import { NextResponse } from 'next/server';

export const BACKEND_DISABLED_MESSAGE =
  'Backend logic is disabled on this branch. Frontend-only mode is active.';

export type MockProject = {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  emissions_file_id?: string | null;
  investments_file_id?: string | null;
  machine_purchases_file_id?: string | null;
  pilot_projects_file_id?: string | null;
  project_environments_file_id?: string | null;
  analysis_status: 'pending' | 'processing' | 'completed' | 'failed';
  analysis_error?: string | null;
  output_excel_file_id?: string | null;
  created_at: string;
  updated_at: string;
};

export function jsonOk<T extends Record<string, unknown>>(payload: T) {
  return NextResponse.json({
    success: true,
    backendDisabled: true,
    ...payload,
  });
}

export function jsonDisabled<T extends Record<string, unknown>>(
  payload: T,
  status = 200
) {
  return NextResponse.json(
    {
      success: true,
      backendDisabled: true,
      message: BACKEND_DISABLED_MESSAGE,
      ...payload,
    },
    { status }
  );
}

export function makeMockProject(overrides?: Partial<MockProject>): MockProject {
  const now = new Date().toISOString();

  return {
    id: 'frontend-only-project',
    user_id: 'frontend-only-user',
    name: 'Frontend Only Project',
    description: 'Temporary placeholder while backend is disabled.',
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
    ...overrides,
  };
}

export function makeMockResearchEntry(overrides?: Record<string, unknown>) {
  const now = new Date().toISOString();

  return {
    id: 'frontend-only-research',
    companies: [],
    status: 'completed',
    project_id: 'frontend-only-project',
    created_at: now,
    completed_at: now,
    total_companies: 0,
    files_generated: 0,
    document_count: 0,
    segment_count: 0,
    ...overrides,
  };
}

export function makeMockFile(overrides?: Record<string, unknown>) {
  return {
    id: 'frontend-only-file',
    file_type: 'emissions',
    original_filename: 'placeholder.json',
    file_size_bytes: 0,
    upload_status: 'completed',
    ...overrides,
  };
}

export function emptyDownloadResponse(filename = 'placeholder.txt', content = '') {
  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Backend-Disabled': 'true',
    },
  });
}

export function emptyExcelResponse(filename = 'placeholder.xlsx') {
  return new NextResponse(new Uint8Array(), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Backend-Disabled': 'true',
    },
  });
}
