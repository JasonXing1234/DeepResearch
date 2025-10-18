import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get('user_id');
    const class_id = searchParams.get('class_id');

    // For now, use a default user_id if not provided
    const effectiveUserId = user_id || '00000000-0000-0000-0000-000000000000';

    let query = supabase
      .from('documents')
      .select('*')
      .eq('user_id', effectiveUserId)
      .is('deleted_at', null) // Only get non-deleted documents
      .order('created_at', { ascending: false });

    // Filter by class if provided
    if (class_id) {
      query = query.eq('class_id', class_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch documents', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      documents: data,
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch documents',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
