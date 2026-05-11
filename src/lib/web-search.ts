/**
 * Bedrock-powered web search via server-side proxy
 * Server handles AWS SigV4 signing and Bedrock API calls
 * Client calls local /api/bedrock-search endpoint
 */

interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
}

export class WebSearch {
  private proxyEndpoint: string;

  constructor() {
    this.proxyEndpoint = '/api/bedrock-search';
  }

  private resolveEndpoint(): string {
    // Node.js fetch requires absolute URLs for server-side calls.
    if (!this.proxyEndpoint.startsWith('/')) {
      return this.proxyEndpoint;
    }

    if (typeof window !== 'undefined') {
      return this.proxyEndpoint;
    }

    const envBase =
      process.env.INTERNAL_API_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    return new URL(this.proxyEndpoint, envBase).toString();
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const endpoint = this.resolveEndpoint();

      console.log('[WebSearch] search() called', {
        query: query.slice(0, 100),
        endpoint,
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      console.log('[WebSearch] fetch response received', {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
      });

      const raw = await response.text();
      let data: { success?: boolean; results?: SearchResult[]; error?: string };

      try {
        data = JSON.parse(raw);
      } catch (parseError) {
        console.error('[WebSearch] Failed to parse JSON response', {
          status: response.status,
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
          responsePreview: raw.slice(0, 300),
        });
        return [];
      }

      console.log('[WebSearch] parsed response', {
        success: data.success,
        resultCount: data.results?.length || 0,
        error: data.error,
      });

      if (response.ok && data.success && Array.isArray(data.results)) {
        return data.results;
      }

      console.warn('[WebSearch] Response indicated failure or missing results', data);
      return [];
    } catch (error) {
      console.error('[WebSearch] search() failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
