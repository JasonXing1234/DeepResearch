import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { buildResearchRows, ResearchResults } from '@/lib/research-report';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { results: ResearchResults; filename?: string };
    const { results, filename = 'research_results' } = body;

    if (!results) {
      return NextResponse.json({ success: false, error: 'results is required' }, { status: 400 });
    }

    const { detailRows, summaryRows } = buildResearchRows(results);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Normalized');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows),  'Original');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx"`,
      },
    });
  } catch (err) {
    console.error('[export-excel] error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
