import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);


async function runAnalysisScriptOld(projectId: string, files: any[]) {
  
  await new Promise((resolve) => setTimeout(resolve, 2000));

  
  const companies = ['Company A', 'Company B', 'Company C'];

  
  const summaryResults = companies.map((company) => ({
    company_name: company,
    commitment_to_reduce: Math.random() > 0.5,
    net_zero_target: Math.random() > 0.5,
    pilot: Math.random() > 0.5,
    investment_announced: Math.random() > 0.5,
    equipment_purchased: Math.random() > 0.5,
    project_environment: Math.random() > 0.5,
  }));

  
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

  
  const diagnosticsResults = companies.map((company) => ({
    company_name: company,
    emissions_count: Math.floor(Math.random() * 10),
    investments_count: Math.floor(Math.random() * 10),
    machine_purchases_count: Math.floor(Math.random() * 10),
    pilot_projects_count: Math.floor(Math.random() * 10),
    project_environments_count: Math.floor(Math.random() * 10),
  }));

  
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

    
    const userId = 'b2bbb440-1d79-42fa-81e3-069efd22fae8';

    
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

    
    await supabase
      .from('sustainability_projects')
      .update({ analysis_status: 'processing' })
      .eq('id', projectId);

    
    await inngest.send({
      name: 'sustainability/analyze.requested',
      data: {
        projectId,
        userId,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Analysis started. Check back in a few moments.',
    });
  } catch (error) {
    console.error('Error running analysis:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
