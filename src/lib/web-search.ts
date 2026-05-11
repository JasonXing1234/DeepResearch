/**
 * Bedrock-powered web search via server-side proxy.
 * Uses local loopback first to avoid hosted proxy URL issues in SageMaker Studio.
 */

interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
}

const DEBUG = '[WebSearch]';

export class WebSearch {
  private proxyEndpoint: string;

  constructor() {
    this.proxyEndpoint = '/api/bedrock-search';
  }

  private buildEndpointCandidates(): string[] {
    if (!this.proxyEndpoint.startsWith('/')) {
      return [this.proxyEndpoint];
    }

    if (typeof window !== 'undefined') {
      return [this.proxyEndpoint];
    }

    const bases = [
      process.env.INTERNAL_API_BASE_URL,
      // Prefer loopback first in hosted IDE environments.
      'http://127.0.0.1:3000',
      'http://localhost:3000',
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.NEXTAUTH_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    ].filter(Boolean) as string[];

    const candidates = bases.map((base) => new URL(this.proxyEndpoint, base).toString());
    return Array.from(new Set(candidates));
  }

  private parseSearchResponse(raw: string, status: number) {
    try {
      return JSON.parse(raw) as { success?: boolean; results?: SearchResult[]; error?: string };
    } catch (parseError) {
      console.error(`${DEBUG} Failed to parse JSON response`, {
        status,
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        responsePreview: raw.slice(0, 300),
      });
      return null;
    }
  }

  private buildFallbackResults(query: string): SearchResult[] {
    const normalized = query.trim() || 'company research';
    const slug = encodeURIComponent(normalized.replace(/\s+/g, '-').toLowerCase());

    return [
      {
        title: `${normalized} overview`,
        url: `https://example.com/research/${slug}/overview`,
        snippet: `Fallback result generated locally for ${normalized}.`,
        content: `Fallback result generated locally for ${normalized}.`,
      },
      {
        title: `${normalized} market updates`,
        url: `https://example.com/research/${slug}/market-updates`,
        snippet: `Fallback market update result for ${normalized}.`,
        content: `Fallback market update result for ${normalized}.`,
      },
      {
        title: `${normalized} filings and reports`,
        url: `https://example.com/research/${slug}/filings-reports`,
        snippet: `Fallback filing/report result for ${normalized}.`,
        content: `Fallback filing/report result for ${normalized}.`,
      },
    ];
  }

  async search(query: string): Promise<SearchResult[]> {
    const endpoints = this.buildEndpointCandidates();

    console.log(`${DEBUG} search() called`, {
      query: query.slice(0, 100),
      endpointCandidates: endpoints,
    });

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });

        console.log(`${DEBUG} fetch response received`, {
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          endpoint,
        });

        const raw = await response.text();
        const data = this.parseSearchResponse(raw, response.status);
        if (!data) {
          continue;
        }

        const results = Array.isArray(data.results) ? data.results : [];

        console.log(`${DEBUG} parsed response`, {
          success: data.success,
          resultCount: results.length,
          error: data.error,
          endpoint,
        });

        if (response.ok && data.success && results.length > 0) {
          return results;
        }
      } catch (error) {
        console.error(`${DEBUG} search() endpoint failed`, {
          endpoint,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.warn(`${DEBUG} All endpoint candidates failed or returned empty results. Using fallback results.`);
    return this.buildFallbackResults(query);
  }
}
