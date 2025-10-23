import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

/**
 * POST /api/research-queue/search
 * Search research segments by company and optional query embedding
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companyName, category, queryEmbedding, limit = 10 } = body;

    if (!companyName) {
      return NextResponse.json(
        { success: false, error: 'Company name is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const userId = 'b2bbb440-1d79-42fa-81e3-069efd22fae8'; // Hardcoded dev user

    // Search research segments
    const { data, error } = await supabase.rpc('search_research_segments', {
      p_user_id: userId,
      p_company_name: companyName,
      p_category: category || null,
      p_query_embedding: queryEmbedding || null,
      p_limit: limit,
    });

    if (error) {
      console.error('Error searching research segments:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('Error in research-queue search API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
