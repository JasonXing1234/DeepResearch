import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

// Mock analysis function - replace with actual backend analysis script
async function runAnalysisScript(projectId: string, files: any[]) {
  // Simulate analysis delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Mock analysis results
  const companies = ['Company A', 'Company B', 'Company C'];

  // Generate summary results
  const summaryResults = companies.map((company) => ({
    company_name: company,
    commitment_to_reduce: Math.random() > 0.5,
    net_zero_target: Math.random() > 0.5,
    pilot: Math.random() > 0.5,
    investment_announced: Math.random() > 0.5,
    equipment_purchased: Math.random() > 0.5,
    project_environment: Math.random() > 0.5,
  }));

  // Generate detailed results
  const attributes = [
    'Commitment to Reduce',
    'Net-zero target',
    'Pilot',
    'Investment announced',
    'Equipment purchased',
    'Project environment',
  ];

  const detailsResults: any[] = [];
  companies.forEach((company) => {
    attributes.forEach((attr) => {
      detailsResults.push({
        customer: company,
        attribute: attr,
        yes_no: Math.random() > 0.5 ? 'Yes' : 'No',
        text_value: `Sample text for ${attr}`,
        source: files[Math.floor(Math.random() * files.length)]?.file_type || 'unknown',
        url: `https://example.com/${company}/${attr}`,
        source_file_type: files[Math.floor(Math.random() * files.length)]?.file_type || 'unknown',
      });
    });
  });

  // Generate diagnostics
  const diagnosticsResults = companies.map((company) => ({
    company_name: company,
    emissions_count: Math.floor(Math.random() * 10),
    investments_count: Math.floor(Math.random() * 10),
    machine_purchases_count: Math.floor(Math.random() * 10),
    pilot_projects_count: Math.floor(Math.random() * 10),
    project_environments_count: Math.floor(Math.random() * 10),
  }));

  // Calculate totals for diagnostics
  diagnosticsResults.forEach((diag) => {
    diag.total_count =
      diag.emissions_count +
      diag.investments_count +
      diag.machine_purchases_count +
      diag.pilot_projects_count +
      diag.project_environments_count;
  });

  return {
    summaryResults,
    detailsResults,
    diagnosticsResults,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // For development, use hardcoded user ID
    const userId = 'b2bbb440-1d79-42fa-81e3-069efd22fae8';

    // Verify project exists and belongs to user
    const { data: project } = await supabase
      .from('sustainability_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (!project || project.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: 'Project not found or access denied' },
        { status: 403 }
      );
    }

    // Check that at least one file is uploaded
    const fileCount = [
      project.emissions_file_id,
      project.investments_file_id,
      project.machine_purchases_file_id,
      project.pilot_projects_file_id,
      project.project_environments_file_id,
    ].filter((id) => id !== null).length;

    if (fileCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Please upload at least one file' },
        { status: 400 }
      );
    }

    // Update analysis status to processing
    await supabase
      .from('sustainability_projects')
      .update({ analysis_status: 'processing' })
      .eq('id', projectId);

    // Fetch project files
    const { data: files } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId);

    try {
      // Run analysis script
      const {
        summaryResults,
        detailsResults,
        diagnosticsResults,
      } = await runAnalysisScript(projectId, files || []);

      // Insert summary results
      const { error: summaryError } = await supabase
        .from('analysis_results')
        .insert(
          summaryResults.map((result) => ({
            project_id: projectId,
            ...result,
          }))
        );

      if (summaryError) throw summaryError;

      // Insert detailed results
      const { error: detailsError } = await supabase
        .from('analysis_details')
        .insert(
          detailsResults.map((result) => ({
            project_id: projectId,
            ...result,
          }))
        );

      if (detailsError) throw detailsError;

      // Insert diagnostics
      const { error: diagnosticsError } = await supabase
        .from('analysis_diagnostics')
        .insert(
          diagnosticsResults.map((result) => ({
            project_id: projectId,
            ...result,
          }))
        );

      if (diagnosticsError) throw diagnosticsError;

      // Update project status to completed
      await supabase
        .from('sustainability_projects')
        .update({ analysis_status: 'completed' })
        .eq('id', projectId);

      return NextResponse.json({
        success: true,
        message: 'Analysis completed successfully',
        results: {
          summaryResults,
          detailsResults,
          diagnosticsResults,
        },
      });
    } catch (analysisError) {
      console.error('Analysis error:', analysisError);

      // Update project status to failed
      await supabase
        .from('sustainability_projects')
        .update({
          analysis_status: 'failed',
          analysis_error: analysisError instanceof Error ? analysisError.message : 'Unknown error',
        })
        .eq('id', projectId);

      return NextResponse.json(
        {
          success: false,
          error: analysisError instanceof Error ? analysisError.message : 'Analysis failed',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error running analysis:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
