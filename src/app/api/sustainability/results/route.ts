import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const projectId = request.nextUrl.searchParams.get('projectId');
    const resultType = request.nextUrl.searchParams.get('type') || 'summary';

    console.log('[Results API] Request:', { projectId, resultType });

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }


    const userId = 'b2bbb440-1d79-42fa-81e3-069efd22fae8';


    const { data: project, error: projectError } = await supabase
      .from('sustainability_projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('[Results API] Project fetch error:', projectError);
      return NextResponse.json(
        { success: false, error: `Project fetch failed: ${projectError.message}` },
        { status: 500 }
      );
    }

    if (!project || project.user_id !== userId) {
      console.warn('[Results API] Project not found or access denied:', { project, userId });
      return NextResponse.json(
        { success: false, error: 'Project not found or access denied' },
        { status: 403 }
      );
    }

    console.log('[Results API] Project found:', project.id);

    if (resultType === 'summary') {
      console.log('[Results API] Fetching summary results...');
      const { data: results, error } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('project_id', projectId);

      if (error) {
        console.error('[Results API] Summary fetch error:', error);
        return NextResponse.json(
          { success: false, error: `Summary fetch failed: ${error.message}` },
          { status: 500 }
        );
      }

      console.log('[Results API] Summary results count:', results?.length || 0);
      return NextResponse.json({
        success: true,
        results: results || [],
      });
    } else if (resultType === 'details') {
      console.log('[Results API] Fetching detail results...');
      const { data: results, error } = await supabase
        .from('analysis_details')
        .select('*')
        .eq('project_id', projectId);

      if (error) {
        console.error('[Results API] Details fetch error:', error);
        return NextResponse.json(
          { success: false, error: `Details fetch failed: ${error.message}` },
          { status: 500 }
        );
      }

      console.log('[Results API] Detail results count:', results?.length || 0);
      return NextResponse.json({
        success: true,
        results: results || [],
      });
    } else if (resultType === 'diagnostics') {
      console.log('[Results API] Fetching diagnostic results...');
      const { data: results, error } = await supabase
        .from('analysis_diagnostics')
        .select('*')
        .eq('project_id', projectId);

      if (error) {
        console.error('[Results API] Diagnostics fetch error:', error);
        return NextResponse.json(
          { success: false, error: `Diagnostics fetch failed: ${error.message}` },
          { status: 500 }
        );
      }

      console.log('[Results API] Diagnostic results count:', results?.length || 0);
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
    console.error('[Results API] Unhandled error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
