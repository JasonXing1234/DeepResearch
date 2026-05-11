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
  private client: unknown | null;
  private modelId: string;
  private region: string;

  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.modelId =
      process.env.BEDROCK_MODEL_ID ||
      process.env.BEDROCK_RESEARCH_MODEL_ID ||
      'anthropic.claude-3-5-sonnet-20241022';
    this.client = null;

    console.log(`${DEBUG} Initialized`, {
      region: this.region,
      modelId: this.modelId,
      hasAwsRegion: !!process.env.AWS_REGION,
      hasBedrockModelId: !!process.env.BEDROCK_MODEL_ID,
      hasBedrockResearchModelId: !!process.env.BEDROCK_RESEARCH_MODEL_ID,
      hasBedrockAgentId: !!process.env.BEDROCK_AGENT_ID,
      hasBedrockAgentAliasId: !!process.env.BEDROCK_AGENT_ALIAS_ID,
    });
  }

  private async getClient() {
    if (this.client) {
      return this.client as { send: (command: unknown) => Promise<unknown> };
    }

    const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
    this.client = new BedrockRuntimeClient({ region: this.region });
    return this.client as { send: (command: unknown) => Promise<unknown> };
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

  async search(query: string): Promise<SearchResult[]> {
    const prompt = `You are a web research assistant. Find real publicly available web sources for this query:\n\n"${query}"\n\nReturn ONLY a JSON array with 5-8 items.\nEach item MUST include:\n- title\n- url (absolute https URL)\n- snippet (1-2 sentences)\n\nDo not include markdown or extra text.`;

    console.log(`${DEBUG} Invoking Bedrock model`, {
      modelId: this.modelId,
      queryPreview: query.slice(0, 120),
    });

    const { InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
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

    try {
      const client = await this.getClient();
      const response = await client.send(command) as {
        body: Uint8Array;
        $metadata?: { httpStatusCode?: number };
      };
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

      return normalized;
    } catch (error) {
      const err = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
      const isCredentialError = err?.name === 'UnrecognizedClientException';
      const credentialHint =
        ' Verify AWS credentials: if using temporary credentials, include AWS_SESSION_TOKEN; otherwise remove static AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY to use the SageMaker execution role.';
      console.error(`${DEBUG} Bedrock search failed`, {
        name: err?.name,
        message: err?.message,
        httpStatus: err?.$metadata?.httpStatusCode,
      });

      throw new Error(
        `Bedrock search failed: ${err?.name || 'Error'}${err?.message ? ` - ${err.message}` : ''}${
          isCredentialError ? credentialHint : ''
        }`
      );
    }
  }
}
