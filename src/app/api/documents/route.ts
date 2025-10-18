import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
  const supabase = await createClient();
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

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const formData = await req.formData();

    const file = formData.get('file') as File;
    const class_id = formData.get('class_id') as string;
    const user_id = formData.get('user_id') as string;
    const title = formData.get('title') as string;

    if (!file || !class_id) {
      return NextResponse.json(
        { error: 'Missing required fields: file and class_id' },
        { status: 400 }
      );
    }

    // For now, use a default user_id if not provided
    const effectiveUserId = user_id || '00000000-0000-0000-0000-000000000000';

    // Generate unique file path
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${effectiveUserId}/${class_id}/${fileName}`;

    // Upload file to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('class-materials')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file', details: uploadError.message },
        { status: 500 }
      );
    }

    // Get file size as number
    const fileSize = file.size;

    // Insert document metadata into database
    const { data: document, error: dbError } = await supabase
      .from('documents')
      .insert({
        user_id: effectiveUserId,
        class_id: class_id,
        title: title || file.name.replace(/\.[^/.]+$/, ''), // Remove extension if no title provided
        original_filename: file.name,
        file_path: filePath,
        file_size_bytes: fileSize,
        mime_type: file.type,
        storage_bucket: 'class-materials',
        storage_provider: 'supabase',
        upload_status: 'completed',
        transcription_status: 'not_applicable', // Non-audio files
        embedding_status: 'pending',
        date_of_material: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // Try to clean up uploaded file
      await supabase.storage.from('class-materials').remove([filePath]);

      return NextResponse.json(
        { error: 'Failed to save document metadata', details: dbError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      document,
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload document',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
