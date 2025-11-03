interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
}

export class WebSearch {
  async search(query: string): Promise<SearchResult[]> {
    try {
      const apiKey = process.env.TAVILY_API_KEY;

      if (!apiKey) {
        console.warn('TAVILY_API_KEY not configured, returning empty results');
        return [];
      }

      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: query,
          search_depth: 'advanced',
          max_results: 10,
          include_domains: [],
          exclude_domains: [],
        }),
      });

      if (!response.ok) {
        console.error('Tavily API error:', response.statusText);
        return [];
      }

      const data = await response.json();

      return (data.results || []).map((result: any) => ({
        title: result.title || '',
        url: result.url || '',
        snippet: result.content || '',
        content: result.content || '',
      }));
    } catch (error) {
      console.error('Error performing web search:', error);
      return [];
    }
  }
}
