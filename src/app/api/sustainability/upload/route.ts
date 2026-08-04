import { NextRequest, NextResponse } from 'next/server';
import { parseCompanyFile } from '@/lib/parse-companies';
import {
  FILE_TYPE_TO_FIELD,
  SustainabilityFileType,
  addFile,
  getProject,
  updateProject,
} from '@/lib/sustainability-store';

export const runtime = 'nodejs';

const VALID_FILE_TYPES: SustainabilityFileType[] = [
  'emissions',
  'investments',
  'machine_purchases',
  'pilot_projects',
  'project_environments',
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const projectId = formData.get('projectId');
    const fileType = formData.get('fileType');

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'file is required' }, { status: 400 });
    }
    if (typeof projectId !== 'string' || !projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }
    if (typeof fileType !== 'string' || !VALID_FILE_TYPES.includes(fileType as SustainabilityFileType)) {
      return NextResponse.json({ success: false, error: 'Invalid fileType' }, { status: 400 });
    }

    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const text = await file.text();
    const isCsv = /\.(csv|tsv)$/i.test(file.name);
    const companies = [...new Set(parseCompanyFile(text, isCsv))];

    if (companies.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No company names found in the file' },
        { status: 400 },
      );
    }

    const savedFile = addFile(projectId, fileType as SustainabilityFileType, file.name, file.size, companies);

    const fileIdField = FILE_TYPE_TO_FIELD[fileType as SustainabilityFileType];
    const updatedProject = updateProject(projectId, {
      [fileIdField]: savedFile.id,
      // Uploading a new list invalidates any previous analysis for this project.
      analysis_status: 'pending',
      analysis_error: null,
    } as Partial<import('@/lib/sustainability-store').SustainabilityProject>);

    return NextResponse.json({ success: true, file: savedFile, project: updatedProject });
  } catch (error) {
    console.error('[sustainability/upload] error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
