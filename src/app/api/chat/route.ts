import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, UIMessage } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getClassDocuments } from '@/lib/tools/getClassDocuments';

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

When the student asks about a class (e.g., "my CS class", "intro to programming", "Professor Smith's class"):
1. Identify which class they're referring to based on the name, code, instructor, or description
2. Call getClassDocuments with the appropriate class ID
3. Synthesize the data into a natural, conversational response

Important guidelines:
- Use the tool data to create natural responses, don't just list the raw output
- When discussing lectures, reference specific content from the transcripts
- Be conversational and helpful - answer what the user actually asked
- Cite lecture titles and dates when referencing specific content
- If asked to summarize, create concise summaries from the transcript text
- If asked about specific topics, search through the transcripts for relevant information

You have access to complete lecture transcripts, so you can:
- Answer specific questions about topics covered in lectures
- Summarize entire lectures or specific sections
- Generate study guides, quiz questions, and flashcards
- Find information across multiple lectures
- Compare and contrast concepts from different lectures
- Recommend relevant materials based on what the student is studying

Be helpful, concise, and educational.`;

    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: convertToModelMessages(messages),
      tools: {
        getClassDocuments: {
          description: 'Get all lectures and materials for a specific class. Returns complete lecture transcripts and material metadata.',
          inputSchema: z.object({
            class_id: z.string().describe('The UUID of the class to fetch documents for'),
          }),
          execute: async (args: { class_id: string }) => {
            return await getClassDocuments(args.class_id, userId);
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