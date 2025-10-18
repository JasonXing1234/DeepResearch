import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, UIMessage } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { semanticSearch } from '@/lib/tools/semanticSearch';
import { getRecentLectures } from '@/lib/tools/getRecentLectures';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    // Hardcoded user ID for development (matches upload routes)
    const userId = '00000000-0000-0000-0000-000000000000';

    // Fetch user's classes to include in system prompt
    const supabase = await createClient();
    const { data: classes, error: classError } = await supabase
      .from('classes')
      .select('id, name, class_code, instructor, description')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (classError) {
      console.error('Error fetching classes:', classError);
    }

    // Build dynamic system prompt with user's classes
    const classListText = classes && classes.length > 0
      ? classes.map(c =>
          `- ${c.name}${c.class_code ? ` (${c.class_code})` : ''}` +
          `${c.instructor ? ` - Professor ${c.instructor}` : ''}` +
          `${c.description ? `: ${c.description}` : ''} [ID: ${c.id}]`
        ).join('\n')
      : 'No classes found.';

  const systemPrompt = `You are an AI study assistant helping a student manage and learn from their course materials.

The student has the following classes:
${classListText}

**CRITICAL RULE: You MUST use your tools to access the student's materials. NEVER use general knowledge for academic questions.**

**Which tool to use:**

1. **Use getRecentLectures when the student asks about:**
   - "What did we talk about last time / recently / today?"
   - "Summarize the last lecture"
   - "What topics were covered in [class name]?"
   - Any question about recent or specific lectures
   - Example: User says "what did we cover in calculus?" → call getRecentLectures with the Calculus class_id

2. **Use semanticSearch when the student asks about:**
   - Specific topics or concepts (e.g., "Explain derivatives", "What are loops?")
   - Finding information across multiple lectures
   - Comparing concepts or ideas
   - Example: User says "explain derivatives" → call semanticSearch with query "derivatives"

**How to answer questions:**

1. **FIRST: Choose the right tool**
   - Identify which class they're asking about (match class name/code to ID from list above)
   - Determine if they want recent lectures (temporal query) or specific content (semantic query)
   - Call the appropriate tool

2. **AFTER getting results:**
   - If results found: Synthesize information into a clear, conversational answer
   - ALWAYS cite sources (lecture title, date)
   - Combine information from multiple sources when helpful
   - Answer exactly what they asked - don't over-explain

3. **If NO results found:**
   - Tell them you don't have this information in their materials
   - DO NOT provide generic textbook explanations
   - Suggest they upload materials or check if the content was transcribed

**Important guidelines:**
- Only use information from tool results - never use general knowledge
- When citing, mention the lecture title and date
- Be conversational and friendly
- If unsure which class they mean, ask for clarification

**Remember:** This student wants help with THEIR course materials, not Wikipedia. Always use tools first!`;

    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: convertToModelMessages(messages),
      tools: {
        getRecentLectures: {
          description: 'Get recent lectures from a class. Use this when the student asks about "what we talked about last time", "recent lectures", "what we covered in [class]", or any temporal/recency-based question. Returns full lecture transcripts.',
          inputSchema: z.object({
            class_id: z.string().optional().describe('Optional: UUID of the class to get lectures from. If not provided, returns lectures from all classes.'),
            limit: z.number().optional().describe('Optional: number of recent lectures to return (default: 5)'),
          }),
          execute: async (args: { class_id?: string; limit?: number }) => {
            const result = await getRecentLectures(userId, {
              classId: args.class_id,
              limit: args.limit || 5,
            });

            if (!result.found) {
              return result;
            }

            return {
              found: true,
              totalLectures: result.totalLectures,
              lectures: result.lectures.map(l => ({
                title: l.title,
                date: l.date,
                duration_minutes: l.duration_seconds ? Math.floor(l.duration_seconds / 60) : null,
                transcript: l.transcript,
              })),
            };
          },
        },
        semanticSearch: {
          description: 'Search for specific topics or concepts across the student\'s course materials. Use this when the student asks about a specific topic (e.g., "explain derivatives", "what are variables", "photosynthesis process"). Returns relevant text chunks.',
          inputSchema: z.object({
            query: z.string().describe('The search query - should be a specific topic or concept (e.g., "derivatives", "variables", "photosynthesis")'),
            class_id: z.string().optional().describe('Optional: filter results to a specific class by providing its UUID'),
            limit: z.number().optional().describe('Optional: maximum number of results to return (default: 20)'),
          }),
          execute: async (args: { query: string; class_id?: string; limit?: number }) => {
            const searchResults = await semanticSearch(args.query, userId, {
              classId: args.class_id,
              limit: args.limit || 20,
            });

            // Format results for the LLM
            if (searchResults.results.length === 0) {
              return {
                found: false,
                message: 'No relevant information found in your course materials for this query.',
              };
            }

            return {
              found: true,
              totalResults: searchResults.totalResults,
              results: searchResults.results.map(r => ({
                content: r.content,
                source: `${r.documentTitle}${r.documentDate ? ` (${r.documentDate})` : ''}`,
                class: r.className,
                similarity: Math.round(r.similarity * 100) + '%',
              })),
            };
          },
        },
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process chat request', details: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}