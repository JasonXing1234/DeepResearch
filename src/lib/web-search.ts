import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
}

type SearchProviderName = 'tavily' | 'bedrock';

interface SearchProvider {
  search(query: string, maxResults: number): Promise<SearchResult[]>;
}

interface TavilyResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
  }>;
}

interface DuckDuckGoTopic {
  Text?: string;
  FirstURL?: string;
  Name?: string;
  Topics?: DuckDuckGoTopic[];
}

interface DuckDuckGoResponse {
  Heading?: string;
  AbstractText?: string;
  AbstractURL?: string;
  RelatedTopics?: DuckDuckGoTopic[];
}

interface WikipediaSearchResponse {
  query?: {
    search?: Array<{
      title?: string;
      snippet?: string;
      pageid?: number;
    }>;
  };
}

class TavilySearchProvider implements SearchProvider {
  async search(query: string, maxResults: number): Promise<SearchResult[]> {
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
          query,
          search_depth: 'advanced',
          max_results: maxResults,
          include_domains: [],
          exclude_domains: [],
        }),
      });

      if (!response.ok) {
        console.error('Tavily API error:', response.statusText);
        return [];
      }

      const data = (await response.json()) as TavilyResponse;

      return (data.results || []).map((result) => ({
        title: result.title || '',
        url: result.url || '',
        snippet: result.content || '',
        content: result.content || '',
      }));
    } catch (error) {
      console.error('Error performing Tavily search:', error);
      return [];
    }
  }
}

class BedrockSearchProvider implements SearchProvider {
  private readonly client: BedrockRuntimeClient | null;
  private readonly modelId: string;

  constructor() {
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
    this.modelId = process.env.BEDROCK_RESEARCH_MODEL_ID || 'amazon.nova-lite-v1:0';
    this.client = region ? new BedrockRuntimeClient({ region }) : null;
  }

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    try {
      const candidates = await collectOpenWebCandidates(query, Math.max(maxResults * 2, 8));

      if (candidates.length === 0) {
        return [];
      }

      if (!this.client) {
        console.warn('AWS_REGION is not configured, returning unranked web candidates');
        return candidates.slice(0, maxResults);
      }

      const ranked = await this.rankWithBedrock(query, candidates, maxResults);
      return ranked.length > 0 ? ranked : candidates.slice(0, maxResults);
    } catch (error) {
      console.error('Error performing Bedrock search:', error);
      return [];
    }
  }

  private async rankWithBedrock(
    query: string,
    candidates: SearchResult[],
    maxResults: number
  ): Promise<SearchResult[]> {
    if (!this.client) {
      return [];
    }

    const prompt = [
      'You are a research assistant. Rank the candidate web findings for relevance and credibility.',
      `Query: ${query}`,
      `Return at most ${maxResults} results as strict JSON with this shape:`,
      '[{"title":"...","url":"...","snippet":"...","content":"..."}]',
      'Only include URLs that appear in the candidates list and preserve factual wording.',
      '',
      'Candidates:',
      JSON.stringify(candidates),
    ].join('\n');

    const response = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
        inferenceConfig: {
          maxTokens: 1200,
          temperature: 0.1,
          topP: 0.9,
        },
      })
    );

    const text =
      response.output?.message?.content
        ?.map((block) => ('text' in block && block.text ? block.text : ''))
        .join('\n') || '';

    const parsed = parseJsonArray(text);
    if (!parsed) {
      return [];
    }

    return parsed
      .map((item) => normalizeSearchResult(item))
      .filter((item): item is SearchResult => item !== null)
      .slice(0, maxResults);
  }
}

function parseJsonArray(raw: string): unknown[] | null {
  const trimmed = raw.trim();

  try {
    const direct = JSON.parse(trimmed);
    if (Array.isArray(direct)) {
      return direct;
    }
  } catch {
    // Ignore and attempt extraction from fenced output.
  }

  const match = trimmed.match(/\[[\s\S]*\]/);
  if (!match) {
    return null;
  }

  try {
    const extracted = JSON.parse(match[0]);
    return Array.isArray(extracted) ? extracted : null;
  } catch {
    return null;
  }
}

function normalizeSearchResult(value: unknown): SearchResult | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const title = typeof candidate.title === 'string' ? candidate.title : '';
  const url = typeof candidate.url === 'string' ? candidate.url : '';
  const snippet = typeof candidate.snippet === 'string' ? candidate.snippet : '';
  const content = typeof candidate.content === 'string' ? candidate.content : snippet;

  if (!url) {
    return null;
  }

  return { title, url, snippet, content };
}

function flattenDuckDuckGoTopics(topics: DuckDuckGoTopic[] = []): DuckDuckGoTopic[] {
  const flattened: DuckDuckGoTopic[] = [];

  for (const topic of topics) {
    if (topic.Topics && topic.Topics.length > 0) {
      flattened.push(...flattenDuckDuckGoTopics(topic.Topics));
    } else {
      flattened.push(topic);
    }
  }

  return flattened;
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function collectOpenWebCandidates(query: string, limit: number): Promise<SearchResult[]> {
  const [duckResults, wikiResults] = await Promise.all([
    fetchDuckDuckGoCandidates(query, limit),
    fetchWikipediaCandidates(query, limit),
  ]);

  const merged = [...duckResults, ...wikiResults];
  const deduped = new Map<string, SearchResult>();

  for (const result of merged) {
    if (!result.url || deduped.has(result.url)) {
      continue;
    }

    deduped.set(result.url, result);
  }

  return Array.from(deduped.values()).slice(0, limit);
}

async function fetchDuckDuckGoCandidates(query: string, limit: number): Promise<SearchResult[]> {
  try {
    const url = new URL('https://api.duckduckgo.com/');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_redirect', '1');
    url.searchParams.set('no_html', '1');
    url.searchParams.set('skip_disambig', '1');

    const response = await fetch(url.toString());
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as DuckDuckGoResponse;
    const results: SearchResult[] = [];

    if (data.AbstractURL) {
      results.push({
        title: data.Heading || 'DuckDuckGo Result',
        url: data.AbstractURL,
        snippet: data.AbstractText || '',
        content: data.AbstractText || '',
      });
    }

    const topics = flattenDuckDuckGoTopics(data.RelatedTopics || []);
    for (const topic of topics) {
      if (!topic.FirstURL || !topic.Text) {
        continue;
      }

      results.push({
        title: topic.Name || topic.Text.split(' - ')[0] || 'DuckDuckGo Topic',
        url: topic.FirstURL,
        snippet: topic.Text,
        content: topic.Text,
      });

      if (results.length >= limit) {
        break;
      }
    }

    return results.slice(0, limit);
  } catch {
    return [];
  }
}

async function fetchWikipediaCandidates(query: string, limit: number): Promise<SearchResult[]> {
  try {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('list', 'search');
    url.searchParams.set('srsearch', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('srlimit', String(limit));
    url.searchParams.set('utf8', '1');
    url.searchParams.set('origin', '*');

    const response = await fetch(url.toString());
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as WikipediaSearchResponse;
    const results = data.query?.search || [];

    const mapped: Array<SearchResult | null> = results.map((item) => {
        const title = item.title || '';
        const snippet = stripHtml(item.snippet || '');
        if (!title) {
          return null;
        }

        return {
          title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
          snippet,
          content: snippet,
        };
      });

    return mapped.filter((item): item is SearchResult => item !== null).slice(0, limit);
  } catch {
    return [];
  }
}

function resolveProviderName(): SearchProviderName {
  const configured = (process.env.WEB_SEARCH_PROVIDER || '').toLowerCase();

  if (configured === 'bedrock' || configured === 'tavily') {
    return configured;
  }

  if (process.env.BEDROCK_RESEARCH_MODEL_ID && (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION)) {
    return 'bedrock';
  }

  return 'tavily';
}

export class WebSearch {
  private readonly provider: SearchProvider;
  private readonly providerName: SearchProviderName;

  constructor() {
    this.providerName = resolveProviderName();
    this.provider = this.providerName === 'bedrock'
      ? new BedrockSearchProvider()
      : new TavilySearchProvider();
  }

  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const results = await this.provider.search(query, maxResults);

    if (results.length === 0 && this.providerName === 'bedrock' && process.env.TAVILY_API_KEY) {
      console.warn('Bedrock search returned no results, falling back to Tavily');
      return new TavilySearchProvider().search(query, maxResults);
    }

    return results;
  }
}
