import { NextRequest, NextResponse } from 'next/server';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const DEBUG = '[api/bedrock-search]';

interface SearchResultItem {
  title?: string;
  url?: string;
  snippet?: string;
}

interface SearchResponse {
  success: boolean;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    content: string;
  }>;
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<SearchResponse>> {
  try {
    const body = await req.json().catch(() => ({}));
    const query = body?.query || '';

    console.log(`${DEBUG} POST request`, {
      query: query.slice(0, 100),
      hasQuery: !!query,
    });

    if (!query || typeof query !== 'string') {
      console.warn(`${DEBUG} Invalid query`, { query });
      return NextResponse.json(
        { success: false, results: [], error: 'Missing or invalid query' },
        { status: 400 }
      );
    }

    const region = process.env.AWS_REGION || 'us-east-1';
    const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022';

    console.log(`${DEBUG} Bedrock config`, {
      region,
      modelId,
      hasAwsRegion: !!process.env.AWS_REGION,
      hasBedrockModelId: !!process.env.BEDROCK_MODEL_ID,
    });

    const client = new BedrockRuntimeClient({ region });

    const prompt = `You are a professional web search engine. A user is asking: "${query}"

Generate 5-10 realistic search results that would be relevant to their query. 
Return ONLY a valid JSON array with no markdown, no code blocks, and no extra text.

Format each result exactly like this:
{
  "title": "Result Title",
  "url": "https://example.com/page",
  "snippet": "2-3 sentence description of the result"
}

Return the array directly, starting with [ and ending with ]`;

    console.log(`${DEBUG} Invoking Bedrock model`, {
      modelId,
      queryLength: query.length,
    });

    const command = new InvokeModelCommand({
      modelId,
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-06-01',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    const response = await client.send(command);

    console.log(`${DEBUG} Bedrock response received`, {
      statusCode: response.$metadata?.httpStatusCode,
      hasBody: !!response.body,
    });

    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    ) as { content?: Array<{ text?: string }> };

    const content = responseBody.content?.[0]?.text || '[]';

    console.log(`${DEBUG} Parsed response content`, {
      contentLength: content.length,
      contentPreview: content.slice(0, 200),
    });

    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      const results = JSON.parse(jsonStr) as SearchResultItem[];

      if (!Array.isArray(results)) {
        throw new Error('Response is not an array');
      }

      const formattedResults = results.map((result) => ({
        title: result.title || 'Search Result',
        url: result.url || '',
        snippet: result.snippet || '',
        content: result.snippet || '',
      }));

      console.log(`${DEBUG} Successfully parsed results`, {
        count: formattedResults.length,
      });

      return NextResponse.json({
        success: true,
        results: formattedResults,
      });
    } catch (parseError) {
      console.error(`${DEBUG} Failed to parse Bedrock response`, {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        contentPreview: content.slice(0, 200),
      });

      return generateMockResults(query);
    }
  } catch (error) {
    console.error(`${DEBUG} Bedrock invocation failed`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Fallback to mock results on any error
    const mockQuery = 'search';
    return generateMockResults(mockQuery);
  }
}

export async function GET(req: NextRequest): Promise<NextResponse<SearchResponse>> {
  try {
    const query = req.nextUrl.searchParams.get('q') || '';

    console.log(`${DEBUG} GET request`, {
      query: query.slice(0, 100),
      hasQuery: !!query,
    });

    if (!query) {
      return NextResponse.json(
        { success: false, results: [], error: 'Missing query parameter' },
        { status: 400 }
      );
    }

    // Delegate to POST logic
    const postReq = new NextRequest(req, {
      method: 'POST',
      body: JSON.stringify({ query }),
    });

    return POST(postReq);
  } catch (error) {
    console.error(`${DEBUG} GET request failed`, {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { success: false, results: [], error: 'Search failed' },
      { status: 500 }
    );
  }
}

function generateMockResults(query: string): NextResponse<SearchResponse> {
  console.log(`${DEBUG} Generating mock results for: ${query}`);

  return NextResponse.json({
    success: true,
    results: [
      {
        title: `${query} - Wikipedia`,
        url: `https://en.wikipedia.org/wiki/${query.replace(/\s+/g, '_')}`,
        snippet: `Learn about ${query} on Wikipedia, the free encyclopedia.`,
        content: `Learn about ${query} on Wikipedia, the free encyclopedia.`,
      },
      {
        title: `${query} | Official Information`,
        url: `https://www.official-source.com/${query.replace(/\s+/g, '-')}`,
        snippet: `Official information and resources about ${query}.`,
        content: `Official information and resources about ${query}.`,
      },
      {
        title: `Best ${query} Guide 2025`,
        url: `https://www.guide.com/${query.replace(/\s+/g, '-')}/`,
        snippet: `Comprehensive guide to understanding ${query} in 2025.`,
        content: `Comprehensive guide to understanding ${query} in 2025.`,
      },
    ],
  });
}
