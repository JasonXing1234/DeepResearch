import { NextRequest, NextResponse } from 'next/server';
import { SustainabilityFileType, getFileByType } from '@/lib/sustainability-store';

export const runtime = 'nodejs';

const VALID_FILE_TYPES: SustainabilityFileType[] = [
  'emissions',
  'investments',
  'machine_purchases',
  'pilot_projects',
  'project_environments',
];

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  const fileType = req.nextUrl.searchParams.get('fileType');

  if (!projectId || !fileType || !VALID_FILE_TYPES.includes(fileType as SustainabilityFileType)) {
    return NextResponse.json({ success: false, error: 'projectId and a valid fileType are required' }, { status: 400 });
  }

  const file = getFileByType(projectId, fileType as SustainabilityFileType);
  if (!file) {
    return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
  }

  const content = file.companies.join('\n');

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${file.original_filename}"`,
    },
  });
}
