import { NextRequest, NextResponse } from 'next/server';
import { WebSearch } from '@/lib/web-search';

const DEBUG = '[api/research-companies]';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    
    // Handle both formats: string array or object array with 'name' property
    let companies: string[] = [];
    if (Array.isArray(body?.companies)) {
      companies = body.companies
        .map((c: string | { name?: string }) => {
          if (typeof c === 'string') return c;
          if (typeof c === 'object' && c?.name) return c.name;
          return null;
        })
        .filter(Boolean);
    }

    console.log(`${DEBUG} POST request`, {
      companiesCount: companies.length,
      companies: companies.slice(0, 4),
    });

    if (companies.length === 0) {
      console.warn(`${DEBUG} No companies provided`);
      return NextResponse.json(
        { success: false, error: 'No companies provided' },
        { status: 400 }
      );
    }

    const webSearch = new WebSearch();
    const researchResults: Record<string, unknown> = {};

    console.log(`${DEBUG} Starting research for ${companies.length} companies`);

    // Search for each company
    for (const company of companies) {
      if (!company || typeof company !== 'string') continue;

      try {
        console.log(`${DEBUG} Searching for: ${company}`);
        const searchQuery = `${company} company profile business information`;
        const results = await webSearch.search(searchQuery);

        researchResults[company] = {
          success: true,
          query: searchQuery,
          resultCount: results.length,
          results: results.slice(0, 5), // Top 5 results per company
        };

        console.log(`${DEBUG} Search results for ${company}:`, {
          resultCount: results.length,
        });
      } catch (error) {
        console.error(`${DEBUG} Search failed for ${company}:`, error);
        researchResults[company] = {
          success: false,
          error: `Search failed for ${company}`,
        };
      }
    }

    console.log(`${DEBUG} Research complete for all companies`);

    return NextResponse.json({
      success: true,
      uploadedFiles: 0,
      researchId: crypto.randomUUID(),
      companiesResearched: companies.length,
      results: researchResults,
      message: `Research completed for ${companies.length} companies`,
    });
  } catch (error) {
    console.error(`${DEBUG} POST request failed:`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'Research request failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
