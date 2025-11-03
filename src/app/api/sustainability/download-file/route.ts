import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const fileType = searchParams.get('fileType');

    if (!projectId || !fileType) {
      return NextResponse.json(
        { success: false, error: 'Project ID and file type are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    
    const { data: fileRecord, error: fileError } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .eq('file_type', fileType)
      .single();

    if (fileError || !fileRecord) {
      console.error('Error fetching file record:', fileError);
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from(fileRecord.storage_bucket)
      .download(fileRecord.file_path);

    if (downloadError || !fileData) {
      console.error('Error downloading file:', downloadError);
      return NextResponse.json(
        { success: false, error: 'Failed to download file' },
        { status: 500 }
      );
    }

    
    const headers = new Headers();
    headers.set('Content-Type', fileRecord.mime_type || 'text/plain');
    headers.set('Content-Disposition', `attachment; filename="${fileRecord.original_filename}"`);

    return new NextResponse(fileData, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Error in download-file API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
