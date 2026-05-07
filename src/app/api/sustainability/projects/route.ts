import { NextRequest } from 'next/server';
import { jsonDisabled, makeMockProject } from '@/lib/backend-disabled';

export async function GET(request: NextRequest) {
  console.log('[api/sustainability/projects][GET] Incoming request', {
    url: request.url,
    method: request.method,
    search: request.nextUrl.search,
  });

  const projectId = request.nextUrl.searchParams.get('id');
  console.log('[api/sustainability/projects][GET] Parsed query params', {
    projectId,
  });

  if (projectId) {
    const payload = {
      project: makeMockProject({ id: projectId }),
    };
    console.log('[api/sustainability/projects][GET] Returning single project payload', payload);
    return jsonDisabled({
      project: makeMockProject({ id: projectId }),
    });
  }

  console.log('[api/sustainability/projects][GET] Returning empty projects payload');
  return jsonDisabled({ projects: [] });
}

export async function POST(request: NextRequest) {
  console.log('[api/sustainability/projects][POST] Incoming request', {
    url: request.url,
    method: request.method,
  });

  const body = await request.json().catch(() => ({}));
  console.log('[api/sustainability/projects][POST] Parsed body', body);

  const payload = {
    project: makeMockProject({
      id: crypto.randomUUID(),
      name: typeof body?.name === 'string' && body.name.trim() ? body.name : 'Frontend Only Project',
      description: typeof body?.description === 'string' ? body.description : '',
    }),
  };

  console.log('[api/sustainability/projects][POST] Returning payload', payload);

  return jsonDisabled({
    project: payload.project,
  });
}

export async function DELETE(request: NextRequest) {
  console.log('[api/sustainability/projects][DELETE] Incoming request', {
    url: request.url,
    method: request.method,
  });

  const body = await request.json().catch(() => ({}));
  console.log('[api/sustainability/projects][DELETE] Parsed body', body);
  console.log('[api/sustainability/projects][DELETE] Returning frontend-only delete response');

  return jsonDisabled({ message: 'Project deleted from frontend-only branch.' });
}
