/**
 * Upload audio endpoint.
 *
 * Handles audio file uploads for lecture recordings.
 *
 * Flow:
 * 1. Create document record in database
 * 2. Upload audio file to lecture-recordings bucket
 * 3. Trigger Inngest event to start transcription
 * 4. Return document ID to client
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';
import { buildStoragePath } from '@/lib/storage';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // TEMP: Hardcoded user for local development
    // TODO: Remove this and use real auth when ready
    const HARDCODED_USER_ID = 'b2bbb440-1d79-42fa-81e3-069efd22fae8';

    const profile = { id: HARDCODED_USER_ID };

    // Uncomment this when you want real auth:
    // const {
    //   data: { user },
    //   error: authError,
    // } = await supabase.auth.getUser();
    //
    // if (authError || !user) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }
    //
    // const { data: profile } = await supabase
    //   .from('profiles')
    //   .select('id')
    //   .eq('supabase_auth_id', user.id)
    //   .single();
    //
    // if (!profile) {
    //   return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    // }

    // Parse form data
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const classId = formData.get('classId') as string;
    const title = formData.get('title') as string | null;

    if (!audioFile || !classId) {
      return NextResponse.json(
        { error: 'Missing required fields: audio, classId' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/mp4'];
    if (!validTypes.includes(audioFile.type)) {
      return NextResponse.json(
        { error: `Invalid file type. Supported types: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Step 1: Create document record
    const { data: document, error: insertError } = await supabase
      .from('documents')
      .insert({
        user_id: profile.id,
        class_id: classId,
        title: title || `Recording ${new Date().toLocaleDateString()}`,
        content_type: 'lecture_recording',
        original_filename: audioFile.name,
        file_size_bytes: audioFile.size,
        mime_type: audioFile.type,
        storage_bucket: 'lecture-recordings',
        transcription_status: 'pending',
        embedding_status: 'pending',
        upload_status: 'uploading',
        upload_started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !document) {
      console.error('Failed to create document:', insertError);
      return NextResponse.json(
        { error: 'Failed to create document record' },
        { status: 500 }
      );
    }

    // Step 2: Upload to storage
    const filePath = buildStoragePath(profile.id, classId, audioFile.name, document.id);

    const { error: uploadError } = await supabase.storage
      .from('lecture-recordings')
      .upload(filePath, audioFile, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Failed to upload file:', uploadError);

      // Clean up document record
      await supabase.from('documents').delete().eq('id', document.id);

      return NextResponse.json(
        { error: 'Failed to upload file to storage' },
        { status: 500 }
      );
    }

    // Step 3: Update document with final path and status
    await supabase
      .from('documents')
      .update({
        file_path: filePath,
        upload_status: 'completed',
        upload_completed_at: new Date().toISOString(),
      })
      .eq('id', document.id);

    // Step 4: Trigger Inngest processing
    await inngest.send({
      name: 'audio/uploaded',
      data: {
        documentId: document.id,
      },
    });

    // Step 5: Return success response
    return NextResponse.json({
      success: true,
      documentId: document.id,
      status: 'processing',
      message: 'Audio uploaded successfully. Transcription in progress.',
    });
  } catch (error) {
    console.error('Upload audio error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
