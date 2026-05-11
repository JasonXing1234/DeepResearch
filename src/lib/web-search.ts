import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
}

interface BedrockMessageResponse {
  content?: Array<{ text?: string }>;
}

const DEBUG = '[WebSearch]';

export class WebSearch {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    this.modelId =
      process.env.BEDROCK_MODEL_ID ||
      process.env.BEDROCK_RESEARCH_MODEL_ID ||
      'anthropic.claude-3-5-sonnet-20241022';
    this.client = new BedrockRuntimeClient({ region });

    console.log(`${DEBUG} Initialized`, {
      region,
      modelId: this.modelId,
      hasAwsRegion: !!process.env.AWS_REGION,
      hasBedrockModelId: !!process.env.BEDROCK_MODEL_ID,
      hasBedrockResearchModelId: !!process.env.BEDROCK_RESEARCH_MODEL_ID,
      hasBedrockAgentId: !!process.env.BEDROCK_AGENT_ID,
      hasBedrockAgentAliasId: !!process.env.BEDROCK_AGENT_ALIAS_ID,
    });
  }

  private extractArrayFromText(text: string): unknown[] {
    const match = text.match(/\[[\s\S]*\]/);
    const jsonText = match ? match[0] : text;
    const parsed = JSON.parse(jsonText);

    if (!Array.isArray(parsed)) {
      throw new Error('Model response did not contain a JSON array');
    }

    return parsed;
  }

  private normalizeResults(items: unknown[]): SearchResult[] {
    return items
      .filter((item) => !!item && typeof item === 'object')
      .map((item) => {
        const objectItem = item as Record<string, unknown>;
        const title = typeof objectItem.title === 'string' ? objectItem.title : 'Search Result';
        const url = typeof objectItem.url === 'string' ? objectItem.url : '';
        const snippet = typeof objectItem.snippet === 'string' ? objectItem.snippet : '';

        return {
          title,
          url,
          snippet,
          content: snippet,
        };
      })
      .filter((result) => result.url.startsWith('http'));
  }

  private buildFallbackResults(query: string): SearchResult[] {
    const normalized = query.trim() || 'company research';
    const slug = encodeURIComponent(normalized.replace(/\s+/g, '-').toLowerCase());

    return [
      {
        title: `${normalized} overview`,
        url: `https://example.com/research/${slug}/overview`,
        snippet: `Fallback result generated because Bedrock response was empty. Query: ${normalized}.`,
        content: `Fallback result generated because Bedrock response was empty. Query: ${normalized}.`,
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
    try {
      const prompt = `You are a web research assistant. Find real publicly available web sources for this query:\n\n"${query}"\n\nReturn ONLY a JSON array with 5-8 items.\nEach item MUST include:\n- title\n- url (absolute https URL)\n- snippet (1-2 sentences)\n\nDo not include markdown or extra text.`;

      console.log(`${DEBUG} Invoking Bedrock model`, {
        modelId: this.modelId,
        queryPreview: query.slice(0, 120),
      });

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-06-01',
          max_tokens: 2048,
          temperature: 0.2,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      const response = await this.client.send(command);
      const responseText = new TextDecoder().decode(response.body);
      const payload = JSON.parse(responseText) as BedrockMessageResponse;
      const content = payload.content?.[0]?.text || '[]';

      console.log(`${DEBUG} Bedrock raw response`, {
        httpStatus: response.$metadata?.httpStatusCode,
        contentPreview: content.slice(0, 220),
      });

      const parsedItems = this.extractArrayFromText(content);
      const normalized = this.normalizeResults(parsedItems);

      console.log(`${DEBUG} Parsed results`, {
        count: normalized.length,
      });

      if (normalized.length > 0) {
        return normalized;
      }

      console.warn(`${DEBUG} Bedrock returned empty/invalid URL results. Using fallback.`);
      return this.buildFallbackResults(query);
    } catch (error) {
      console.error(`${DEBUG} Bedrock search failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.buildFallbackResults(query);
    }
  }
}
