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

  async search(query: string): Promise<SearchResult[]> {
    try {
      console.log('[WebSearch] search() called', {
        query: query.slice(0, 100),
        endpoint: this.proxyEndpoint,
      });

      const response = await fetch(this.proxyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      console.log('[WebSearch] fetch response received', {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
      });

      const data = await response.json();

      console.log('[WebSearch] parsed response', {
        success: data.success,
        resultCount: data.results?.length || 0,
        error: data.error,
      });

      if (data.success && Array.isArray(data.results)) {
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
