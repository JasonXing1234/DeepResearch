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

/** Strip <thinking>...</thinking> reasoning blocks that some models (e.g. Nova Premier) emit. */
function stripThinkingTags(text: string): string {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}

function maskAccessKeyId(value?: string) {
  if (!value) return '<missing>';
  if (value.length <= 8) return `${value.slice(0, 2)}...${value.slice(-2)}`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function isNovaModel(modelId: string): boolean {
  return /(?:^|\.)(amazon\.nova-|nova-)/.test(modelId);
}

function toNovaInferenceProfileId(modelId: string): string {
  // Ensure cross-region inference prefix (us./eu./ap.) for on-demand Nova invocations
  return /^(us|eu|ap)\./.test(modelId) ? modelId : `us.${modelId}`;
}

export class WebSearch {
  private client: unknown | null;
  private modelId: string;
  private region: string;

  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.modelId =
      process.env.BEDROCK_RESEARCH_MODEL_ID ||
      process.env.BEDROCK_MODEL_ID ||
      'amazon.nova-premier-v1:0'; // nova_grounding requires nova-premier; lite/pro return ValidationException
    this.client = null;

    console.log(`${DEBUG} Initialized`, {
      region: this.region,
      modelId: this.modelId,
      hasAwsRegion: !!process.env.AWS_REGION,
      hasBedrockModelId: !!process.env.BEDROCK_MODEL_ID,
      hasBedrockResearchModelId: !!process.env.BEDROCK_RESEARCH_MODEL_ID,
      hasBedrockAgentId: !!process.env.BEDROCK_AGENT_ID,
      hasBedrockAgentAliasId: !!process.env.BEDROCK_AGENT_ALIAS_ID,
      // Credential source diagnostics (safe: no secret values logged)
      awsAccessKeyIdMasked: maskAccessKeyId(process.env.AWS_ACCESS_KEY_ID),
      hasAwsSecretAccessKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      hasAwsSessionToken: !!process.env.AWS_SESSION_TOKEN,
      awsProfile: process.env.AWS_PROFILE || null,
      awsDefaultProfile: process.env.AWS_DEFAULT_PROFILE || null,
      hasContainerCredentialsRelativeUri: !!process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI,
      hasContainerCredentialsFullUri: !!process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI,
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

  private extractNovaGroundingResults(response: unknown, query: string): SearchResult[] {
    const resp = response as { output?: { message?: { content?: unknown[] } } };
    const contentItems = resp?.output?.message?.content || [];
    let answerText = '';
    const raw: Array<{ title: string; url: string; snippet: string }> = [];

    for (const item of contentItems as Array<Record<string, unknown>>) {
      if (typeof item?.text === 'string') {
        answerText += item.text + ' ';
      }

      const citations = (item?.citationsContent as { citations?: unknown[] })?.citations || [];
      for (const citation of citations as Array<Record<string, unknown>>) {
        const loc = citation?.location as Record<string, unknown> | undefined;
        const web = loc?.web as Record<string, unknown> | undefined;
        const url = web?.url as string | undefined;
        if (!url || !url.startsWith('http')) continue;

        const title = (web?.title || web?.domain || url) as string;
        const srcContent = citation?.sourceContent as Record<string, unknown> | undefined;
        const genPart = citation?.generatedResponsePart as Record<string, unknown> | undefined;
        const textPart = genPart?.textResponsePart as Record<string, unknown> | undefined;
        const snippet = stripThinkingTags((srcContent?.text || textPart?.text || '') as string);
        raw.push({ title, url, snippet });
      }
    }

    answerText = stripThinkingTags(answerText);

    const seen = new Set<string>();
    const results: SearchResult[] = [];
    for (const item of raw) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      results.push({
        title: item.title || item.url,
        url: item.url,
        snippet: item.snippet || answerText.slice(0, 200) || '',
        content: item.snippet || answerText.slice(0, 200) || '',
      });
    }

    // If no citations, use the answer text as a single synthetic result
    if (results.length === 0 && answerText.trim()) {
      results.push({
        title: `Web search results for: ${query}`,
        url: `https://search.example.com?q=${encodeURIComponent(query)}`,
        snippet: answerText.trim().slice(0, 300),
        content: answerText.trim().slice(0, 300),
      });
    }

    return results;
  }

  private async searchWithNovaGrounding(query: string): Promise<SearchResult[]> {
    const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const client = new BedrockRuntimeClient({ region: this.region });
    const profileId = toNovaInferenceProfileId(this.modelId);

    console.log(`${DEBUG} Using Nova web grounding`, { modelId: profileId, query: query.slice(0, 120) });

    const command = new ConverseCommand({
      modelId: profileId,
      messages: [
        {
          role: 'user',
          content: [
            {
              text: `Search the public web for sources about this query. Return cited sources only. Query: ${query}`,
            },
          ],
        },
      ],
      toolConfig: {
        tools: [
          {
            systemTool: {
              name: 'nova_grounding',
            },
          },
        ],
      },
    });

    const response = await client.send(command);
    const results = this.extractNovaGroundingResults(response, query);

    console.log(`${DEBUG} Nova grounding returned ${results.length} results`);
    return results;
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
    // Use Nova web grounding for real results when a Nova model is configured
    if (isNovaModel(this.modelId)) {
      try {
        return await this.searchWithNovaGrounding(query);
      } catch (error) {
        const err = error as { name?: string; message?: string };
        console.warn(`${DEBUG} Nova grounding failed, falling back to prompt-based search`, {
          name: err?.name,
          message: err?.message,
        });
      }
    }

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
      const content = stripThinkingTags(payload.content?.[0]?.text || '[]');

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
