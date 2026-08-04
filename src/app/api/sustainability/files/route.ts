import { NextRequest, NextResponse } from 'next/server';
import { listFiles } from '@/lib/sustainability-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
  }

  return NextResponse.json({ success: true, files: listFiles(projectId) });
}
