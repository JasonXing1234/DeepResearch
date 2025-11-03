import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId');
    const resultType = request.nextUrl.searchParams.get('type') || 'summary'; 

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    
    const userId = 'b2bbb440-1d79-42fa-81e3-069efd22fae8';

    
    const { data: project } = await supabase
      .from('sustainability_projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (!project || project.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: 'Project not found or access denied' },
        { status: 403 }
      );
    }

    if (resultType === 'summary') {
      const { data: results, error } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('project_id', projectId);

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        results: results || [],
      });
    } else if (resultType === 'details') {
      const { data: results, error } = await supabase
        .from('analysis_details')
        .select('*')
        .eq('project_id', projectId);

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        results: results || [],
      });
    } else if (resultType === 'diagnostics') {
      const { data: results, error } = await supabase
        .from('analysis_diagnostics')
        .select('*')
        .eq('project_id', projectId);

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        results: results || [],
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid result type' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error fetching results:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
