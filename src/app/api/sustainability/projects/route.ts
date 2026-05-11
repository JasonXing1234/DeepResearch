import { NextRequest } from 'next/server';
import { jsonDisabled, makeMockProject } from '@/lib/backend-disabled';

export const runtime = 'nodejs';

function createFallbackId() {
  return `frontend-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createProjectId() {
  try {
    const randomUUID = globalThis.crypto?.randomUUID;
    if (typeof randomUUID === 'function') {
      return randomUUID.call(globalThis.crypto);
    }
  } catch {
    // Fall through to deterministic fallback id.
  }

  return createFallbackId();
}

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('id');

  if (projectId) {
    return jsonDisabled({
      project: makeMockProject({ id: projectId }),
    });
  }

  return jsonDisabled({ projects: [] });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    return jsonDisabled({
      project: makeMockProject({
        id: createProjectId(),
        name: typeof body?.name === 'string' && body.name.trim() ? body.name : 'Frontend Only Project',
        description: typeof body?.description === 'string' ? body.description : '',
      }),
    });
  } catch (error) {
    return jsonDisabled({
      project: makeMockProject({ id: 'error-project' }),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function DELETE() {
  return jsonDisabled({ message: 'Project deleted from frontend-only branch.' });
}
