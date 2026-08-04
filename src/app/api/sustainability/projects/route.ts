import { NextRequest, NextResponse } from 'next/server';
import { createProject, deleteProject, getProject, listProjects } from '@/lib/sustainability-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('id');

  if (projectId) {
    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, project });
  }

  return NextResponse.json({ success: true, projects: listProjects() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : 'Untitled Project';
    const description = typeof body?.description === 'string' && body.description.trim() ? body.description.trim() : null;

    const project = createProject(name, description);
    return NextResponse.json({ success: true, project });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const projectId = typeof body?.projectId === 'string' ? body.projectId : null;

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }

    const deleted = deleteProject(projectId);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
