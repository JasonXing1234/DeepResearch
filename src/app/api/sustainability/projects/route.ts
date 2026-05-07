import { NextRequest } from 'next/server';
import { jsonDisabled, makeMockProject } from '@/lib/backend-disabled';

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
  const body = await request.json().catch(() => ({}));

  return jsonDisabled({
    project: makeMockProject({
      id: crypto.randomUUID(),
      name: typeof body?.name === 'string' && body.name.trim() ? body.name : 'Frontend Only Project',
      description: typeof body?.description === 'string' ? body.description : '',
    }),
  });
}

export async function DELETE() {
  return jsonDisabled({ message: 'Project deleted from frontend-only branch.' });
}
