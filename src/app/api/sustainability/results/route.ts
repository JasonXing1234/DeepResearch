import { NextRequest, NextResponse } from 'next/server';
import { getProjectResults } from '@/lib/sustainability-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  const type = request.nextUrl.searchParams.get('type') ?? 'summary';

  if (!projectId) {
    return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
  }

  const projectResults = getProjectResults(projectId);
  if (!projectResults) {
    return NextResponse.json({ success: true, results: [] });
  }

  if (type === 'details') {
    return NextResponse.json({ success: true, results: projectResults.details });
  }
  if (type === 'diagnostics') {
    return NextResponse.json({ success: true, results: projectResults.diagnostics });
  }
  return NextResponse.json({ success: true, results: projectResults.summary });
}
