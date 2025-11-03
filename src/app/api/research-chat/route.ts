import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateSingleEmbedding } from '@/lib/embeddings';
import { OpenAI } from 'openai';

export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}












export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { researchId, message, conversationHistory = [] } = body;

    if (!researchId || !message) {
      return NextResponse.json(
        { success: false, error: 'Research ID and message are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const userId = 'b2bbb440-1d79-42fa-81e3-069efd22fae8'; 

    
    const { data: researchEntry, error: researchError } = await supabase
      .from('research_queue')
      .select('companies, status')
      .eq('id', researchId)
      .eq('user_id', userId)
      .single();

    if (researchError || !researchEntry) {
      return NextResponse.json(
        { success: false, error: 'Research not found' },
        { status: 404 }
      );
    }

    if (researchEntry.status !== 'completed') {
      return NextResponse.json(
        { success: false, error: 'Research is not yet completed' },
        { status: 400 }
      );
    }

    
    const queryEmbedding = await generateSingleEmbedding(message);

    
    
    const { data: researchDocs } = await supabase
      .from('research_documents')
      .select('id')
      .eq('research_id', researchId);

    if (!researchDocs || researchDocs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No research documents found' },
        { status: 404 }
      );
    }

    const docIds = researchDocs.map(d => d.id);

    
    const { data: researchSegments } = await supabase
      .from('research_segments')
      .select('segment_id, company_name, category')
      .in('research_document_id', docIds);

    if (!researchSegments || researchSegments.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No vectorized segments found. Research may still be processing.' },
        { status: 404 }
      );
    }

    const segmentIds = researchSegments.map(s => s.segment_id);

    
    const { data: relevantSegments, error: searchError } = await supabase.rpc(
      'match_segments',
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: 10,
        filter_segment_ids: segmentIds,
      }
    );

    if (searchError) {
      console.error('Vector search error:', searchError);
      
      const { data: fallbackSegments } = await supabase
        .from('segments')
        .select('id, content')
        .in('id', segmentIds.slice(0, 10));

      return buildChatResponse(message, fallbackSegments || [], researchEntry.companies, conversationHistory);
    }

    
    const enrichedSegments = relevantSegments?.map(seg => {
      const segmentInfo = researchSegments.find(rs => rs.segment_id === seg.id);
      return {
        ...seg,
        company_name: segmentInfo?.company_name,
        category: segmentInfo?.category,
      };
    });

    return buildChatResponse(message, enrichedSegments || [], researchEntry.companies, conversationHistory);
  } catch (error) {
    console.error('Error in research chat:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

interface RelevantSegment {
  id: string;
  content: string;
  similarity?: number;
  company_name?: string;
  category?: string;
}

async function buildChatResponse(
  userMessage: string,
  relevantSegments: RelevantSegment[],
  companies: string[],
  conversationHistory: Message[]
) {
  
  const context = relevantSegments
    .map((seg, idx) => {
      const companyLabel = seg.company_name ? `[${seg.company_name}]` : '';
      const categoryLabel = seg.category ? `[${seg.category}]` : '';
      return `${idx + 1}. ${companyLabel}${categoryLabel} ${seg.content}`;
    })
    .join('\n\n');

  
  const systemPrompt = `You are a research assistant helping analyze sustainability and Leads data for the following companies: ${companies.join(', ')}.

You have access to research documents covering:
- Emissions Reduction commitments and targets
- Investments in sustainability initiatives
- Machine and Equipment Purchases (clean energy infrastructure)
- Pilot Projects (carbon capture, renewable energy trials)
- Project Environments (sustainability constraints and factors)

Use the following research context to answer the user's question. If the context doesn't contain relevant information, say so clearly.

RESEARCH CONTEXT:
${context}

Guidelines:
- Base your answers on the research context provided
- Cite specific companies when relevant
- Be concise and factual
- If information is missing or unclear, acknowledge it
- Format numbers and data clearly`;

  
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: messages,
    temperature: 0.7,
    max_tokens: 1000,
  });

  const assistantMessage = completion.choices[0].message.content || 'I could not generate a response.';

  return NextResponse.json({
    success: true,
    message: assistantMessage,
    sources: relevantSegments.slice(0, 5).map(seg => ({
      company: seg.company_name,
      category: seg.category,
      content: seg.content.substring(0, 200) + '...',
      similarity: seg.similarity,
    })),
  });
}
