import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const projectId = formData.get('projectId') as string;
    const fileType = formData.get('fileType') as string;

    if (!file || !projectId || !fileType) {
      return NextResponse.json(
        {
          success: false,
          error: 'File, projectId, and fileType are required',
        },
        { status: 400 }
      );
    }

    // Validate file type
    const validFileTypes = [
      'emissions',
      'investments',
      'machine_purchases',
      'pilot_projects',
      'project_environments',
    ];

    if (!validFileTypes.includes(fileType)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid file type',
        },
        { status: 400 }
      );
    }

    // For development, use hardcoded user ID
    const userId = 'b2bbb440-1d79-42fa-81e3-069efd22fae8';

    // Verify project exists and belongs to user
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

    // Create storage path
    const filename = `${Date.now()}_${file.name}`;
    const storagePath = `sustainability/${userId}/${projectId}/${filename}`;

    // Convert file to buffer
    const buffer = await file.arrayBuffer();

    // Upload to Supabase Storage
    const { data: storageData, error: storageError } = await supabase.storage
      .from('sustainability-reports')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (storageError) {
      return NextResponse.json(
        { success: false, error: storageError.message },
        { status: 500 }
      );
    }

    // Create project_files record
    const { data: fileRecord, error: dbError } = await supabase
      .from('project_files')
      .insert([
        {
          project_id: projectId,
          file_type: fileType,
          original_filename: file.name,
          storage_bucket: 'sustainability-reports',
          file_path: storagePath,
          file_size_bytes: file.size,
          mime_type: file.type,
          upload_status: 'completed',
        },
      ])
      .select()
      .single();

    if (dbError) {
      // Clean up uploaded file if database insert fails
      await supabase.storage
        .from('sustainability-reports')
        .remove([storagePath]);

      return NextResponse.json(
        { success: false, error: dbError.message },
        { status: 500 }
      );
    }

    // Update project file reference
    const fileColumnMap: Record<string, string> = {
      emissions: 'emissions_file_id',
      investments: 'investments_file_id',
      machine_purchases: 'machine_purchases_file_id',
      pilot_projects: 'pilot_projects_file_id',
      project_environments: 'project_environments_file_id',
    };

    const updateData: Record<string, string | null> = {
      [fileColumnMap[fileType]]: fileRecord.id,
      analysis_status: 'pending',
    };

    await supabase
      .from('sustainability_projects')
      .update(updateData)
      .eq('id', projectId);

    return NextResponse.json({
      success: true,
      file: fileRecord,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
