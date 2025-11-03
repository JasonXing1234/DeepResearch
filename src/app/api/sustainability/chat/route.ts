import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
});

export const maxDuration = 30;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const { projectId, message, conversationHistory } = await request.json();

    if (!projectId || !message) {
      return NextResponse.json(
        { success: false, error: 'Project ID and message are required' },
        { status: 400 }
      );
    }

    
    const userId = 'b2bbb440-1d79-42fa-81e3-069efd22fae8';

    
    const { data: project } = await supabase
      .from('sustainability_projects')
      .select('id, user_id, name')
      .eq('id', projectId)
      .single();

    if (!project || project.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: 'Project not found or access denied' },
        { status: 403 }
      );
    }

    
    const [summaryRes, detailsRes, diagnosticsRes] = await Promise.all([
      supabase
        .from('analysis_results')
        .select('*')
        .eq('project_id', projectId),
      supabase
        .from('analysis_details')
        .select('*')
        .eq('project_id', projectId),
      supabase
        .from('analysis_diagnostics')
        .select('*')
        .eq('project_id', projectId),
    ]);

    const summaryData = summaryRes.data || [];
    const detailsData = detailsRes.data || [];
    const diagnosticsData = diagnosticsRes.data || [];

    
    const context = `
You are an AI assistant helping users analyze sustainability project data for "${project.name}".

# Summary Data (${summaryData.length} companies):
${summaryData.map(row => `
Company: ${row.company_name}
- Commitment to Reduce: ${row.commitment_to_reduce ? 'Yes' : 'No'}
- Net-zero Target: ${row.net_zero_target ? 'Yes' : 'No'}
- Pilot: ${row.pilot ? 'Yes' : 'No'}
- Investment Announced: ${row.investment_announced ? 'Yes' : 'No'}
- Equipment Purchased: ${row.equipment_purchased ? 'Yes' : 'No'}
- Project Environment: ${row.project_environment ? 'Yes' : 'No'}
`).join('\n')}

# Detailed Data (${detailsData.length} records):
${detailsData.slice(0, 50).map(row => `
Customer: ${row.customer}
Attribute: ${row.attribute}
Status: ${row.yes_no}
Details: ${row.text_value || 'N/A'}
Source: ${row.source || 'N/A'}
${row.url ? `URL: ${row.url}` : ''}
`).join('\n')}
${detailsData.length > 50 ? `\n... and ${detailsData.length - 50} more records` : ''}

# Diagnostics (${diagnosticsData.length} companies):
${diagnosticsData.map(row => `
Company: ${row.company_name}
- Emissions Records: ${row.emissions_count}
- Investments Records: ${row.investments_count}
- Machine Purchases Records: ${row.machine_purchases_count}
- Pilot Projects Records: ${row.pilot_projects_count}
- Project Environments Records: ${row.project_environments_count}
- Total Records: ${row.total_count}
`).join('\n')}

Instructions:
- Answer questions based on the data provided above
- Be specific and cite company names when relevant
- If asked for a list, provide it in a clear format
- If data is missing or unclear, acknowledge it
- Use markdown formatting for better readability
- Keep responses concise but informative
`;

    
    const messages: ChatMessage[] = [
      {
        role: 'user' as const,
        content: context,
      },
      ...(conversationHistory || []).map((msg: ChatMessage) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user' as const,
        content: message,
      },
    ];

    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const assistantMessage = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

    return NextResponse.json({
      success: true,
      message: assistantMessage,
    });
  } catch (error) {
    console.error('Error in sustainability chat:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
