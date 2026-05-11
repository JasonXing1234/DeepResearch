import { NextResponse } from 'next/server';

const BACKEND_DISABLED_MESSAGE =
  'Backend logic is disabled on this branch. Frontend-only mode is active.';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function makeMockResearchEntry(id: string) {
  const now = new Date().toISOString();

  return {
    id,
    companies: [],
    status: 'completed',
    project_id: 'frontend-only-project',
    created_at: now,
    completed_at: now,
    total_companies: 0,
    files_generated: 0,
    document_count: 0,
    segment_count: 0,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return NextResponse.json({
    success: true,
    backendDisabled: true,
    message: BACKEND_DISABLED_MESSAGE,
    data: {
      ...makeMockResearchEntry(id),
      documents: [],
    },
  });
}

export async function DELETE() {
  return NextResponse.json({
    success: true,
    backendDisabled: true,
    message: 'Research entry removed from frontend-only branch.',
  });
}
