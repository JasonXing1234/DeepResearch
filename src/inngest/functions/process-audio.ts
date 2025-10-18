/**
 * Process audio files: transcribe with Whisper and save transcript to storage.
 *
 * Flow:
 * 1. Download audio file from lecture-recordings bucket
 * 2. Call OpenAI Whisper API for transcription
 * 3. Save transcript as .txt file in transcripts bucket
 * 4. Update database with transcription status
 * 5. Trigger transcript/created event to start embedding generation
 */

import { inngest } from '../client';
import { createClient } from '@/lib/supabase/server';
import { getOriginalFile, getTranscriptFile } from '@/lib/storage';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const processAudio = inngest.createFunction(
  {
    id: 'process-audio',
    retries: 3,
    concurrency: {
      limit: 5, // Limit concurrent transcriptions to respect OpenAI rate limits
    },
    onFailure: async ({ event, error }) => {
      // Mark document as failed in database
      const supabase = await createClient();
      const { documentId } = event.data as unknown as { documentId: string };
      await supabase
        .from('documents')
        .update({
          transcription_status: 'failed',
          error_message: error.message,
        })
        .eq('id', documentId);
    },
  },
  { event: 'audio/uploaded' },
  async ({ event, step }) => {
    const { documentId } = event.data;

    // Step 1: Get document details and update status
    const document = await step.run('get-document', async () => {
      const supabase = await createClient();

      const { data: doc, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (error || !doc) {
        throw new Error(`Document not found: ${documentId}`);
      }

      // Update status to processing
      await supabase
        .from('documents')
        .update({
          transcription_status: 'processing',
          transcription_started_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      return doc;
    });

    // Step 2: Download audio and transcribe with Whisper
    // Note: Download and transcription are in same step because Blob can't be serialized between steps
    const transcription = await step.run('download-and-transcribe', async () => {
      // Download audio file
      const supabase = await createClient();
      const originalFile = getOriginalFile(document);

      const { data: audioBlob, error } = await supabase.storage
        .from(originalFile.bucket)
        .download(originalFile.path);

      if (error || !audioBlob) {
        throw new Error(`Failed to download audio: ${error?.message}`);
      }

      // Convert Blob to File object for OpenAI API
      const file = new File([audioBlob], document.original_filename || 'audio.mp3', {
        type: document.mime_type || 'audio/mpeg',
      });

      // Transcribe with Whisper
      const result = await openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: document.transcription_language || 'en',
        response_format: 'verbose_json', // Get timestamps and other metadata
      });

      return result;
    });

    // Step 3: Save transcript to storage
    await step.run('save-transcript', async () => {
      const supabase = await createClient();
      const transcriptFile = getTranscriptFile(document);

      // Upload transcript as .txt file
      const { error } = await supabase.storage
        .from(transcriptFile.bucket)
        .upload(transcriptFile.path, transcription.text, {
          contentType: 'text/plain',
          upsert: true,
        });

      if (error) {
        throw new Error(`Failed to save transcript: ${error.message}`);
      }
    });

    // Step 4: Update document in database
    await step.run('update-document', async () => {
      const supabase = await createClient();

      const wordCount = transcription.text.split(/\s+/).length;

      await supabase
        .from('documents')
        .update({
          transcription_status: 'completed',
          transcription_completed_at: new Date().toISOString(),
          transcription_model: 'whisper-1',
          transcription_text: transcription.text, // Save transcript to database
          audio_duration_seconds: Math.round(transcription.duration || 0),
          word_count: wordCount,
        })
        .eq('id', documentId);
    });

    // Step 5: Trigger transcript processing (embeddings)
    await step.sendEvent('trigger-transcript-processing', {
      name: 'transcript/created',
      data: {
        documentId,
      },
    });

    return { success: true, documentId };
  }
);
