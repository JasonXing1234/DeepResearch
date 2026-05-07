import { NextRequest, NextResponse } from 'next/server';
import { WebSearch } from '@/lib/web-search';

const DEBUG = '[api/test-search]';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = body?.query || 'test search';

    console.log(`${DEBUG} Starting test search`, { query });

    const webSearch = new WebSearch();
    console.log(`${DEBUG} WebSearch instance created`);

    const results = await webSearch.search(query);
    console.log(`${DEBUG} Search completed`, { resultCount: results.length });

    return NextResponse.json({
      success: true,
      query,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error(`${DEBUG} Error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') || 'artificial intelligence';
  
  console.log(`${DEBUG} GET request`, { query });

  const webSearch = new WebSearch();
  const results = await webSearch.search(query);

  return NextResponse.json({
    success: true,
    query,
    results,
    count: results.length,
  });
}
