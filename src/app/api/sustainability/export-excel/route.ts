import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { buildResearchRows } from '@/lib/research-report';
import { getProject, getProjectResults } from '@/lib/sustainability-store';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const projectId = typeof body?.projectId === 'string' ? body.projectId : null;

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }

    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const projectResults = getProjectResults(projectId);
    if (!projectResults) {
      return NextResponse.json(
        { success: false, error: 'No analysis results yet. Run analysis first.' },
        { status: 400 },
      );
    }

    const { detailRows, summaryRows } = buildResearchRows(projectResults.raw);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Normalized');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'Original');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
    const filename = project.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sustainability_results';

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
      },
    });
  } catch (err) {
    console.error('[sustainability/export-excel] error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
