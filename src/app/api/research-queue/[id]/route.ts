import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;





export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const userId = 'b2bbb440-1d79-42fa-81e3-069efd22fae8'; 

    
    const { data: queueEntry, error: queueError } = await supabase
      .from('research_queue')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (queueError || !queueEntry) {
      return NextResponse.json(
        { success: false, error: 'Research entry not found' },
        { status: 404 }
      );
    }

    
    const { data: documents, error: docsError } = await supabase
      .from('research_documents')
      .select('*')
      .eq('research_id', id);

    if (docsError) {
      console.error('Error fetching documents:', docsError);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...queueEntry,
        documents: documents || [],
      },
    });
  } catch (error) {
    console.error('Error in research-queue detail API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}





export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const userId = 'b2bbb440-1d79-42fa-81e3-069efd22fae8'; 

    
    const { error } = await supabase
      .from('research_queue')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting research entry:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Research entry deleted successfully',
    });
  } catch (error) {
    console.error('Error in research-queue delete API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
