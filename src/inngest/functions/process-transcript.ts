/**
 * Process transcripts: chunk text and generate embeddings.
 *
 * This is a SHARED function used by both audio and PDF processing pipelines.
 * It reads the transcript .txt file from storage, chunks it, and generates embeddings.
 *
 * Flow:
 * 1. Download transcript .txt file from transcripts bucket
 * 2. Chunk text into segments (500 tokens with 50 token overlap)
 * 3. Generate embeddings in batches (100 chunks at a time)
 * 4. Insert segments into database with embeddings
 * 5. Update document status to completed
 */

import { inngest } from '../client';
import { createClient } from '@/lib/supabase/server';
import { getTranscriptFile } from '@/lib/storage';
import { chunkTextSmart } from '@/lib/chunking';
import { generateEmbeddings, formatEmbeddingForPostgres } from '@/lib/embeddings';

export const processTranscript = inngest.createFunction(
  {
    id: 'process-transcript',
    retries: 3,
    concurrency: {
      limit: 5, // Limit concurrent embedding generation (OpenAI rate limits)
    },
    onFailure: async ({ event, error }) => {
      // Mark document as failed in database
      const supabase = await createClient();
      const { documentId } = event.data as unknown as { documentId: string };
      await supabase
        .from('documents')
        .update({
          embedding_status: 'failed',
          error_message: error.message,
        })
        .eq('id', documentId);
    },
  },
  { event: 'transcript/created' },
  async ({ event, step }) => {
    const { documentId } = event.data;

    // Step 1: Get document details
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
          embedding_status: 'processing',
          embedding_started_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      return doc;
    });

    // Step 2: Download transcript from storage
    const transcriptText = await step.run('download-transcript', async () => {
      const supabase = await createClient();
      const transcriptFile = getTranscriptFile(document);

      const { data, error } = await supabase.storage
        .from(transcriptFile.bucket)
        .download(transcriptFile.path);

      if (error || !data) {
        throw new Error(`Failed to download transcript: ${error?.message}`);
      }

      // Convert Blob to text
      return await data.text();
    });

    // Step 3: Chunk the text
    const chunks = await step.run('chunk-text', async () => {
      const textChunks = chunkTextSmart(transcriptText, {
        chunkSize: 500,
        overlap: 50,
      });

      // Update total segments count
      const supabase = await createClient();
      await supabase
        .from('documents')
        .update({ total_segments: textChunks.length })
        .eq('id', documentId);

      return textChunks;
    });

    // Step 4: Generate embeddings
    const embeddings = await step.run('generate-embeddings', async () => {
      // Progress callback to update database
      const updateProgress = async (processed: number, total: number) => {
        const supabase = await createClient();
        await supabase
          .from('documents')
          .update({ processed_segments: processed })
          .eq('id', documentId);
      };

      return await generateEmbeddings(chunks, updateProgress);
    });

    // Step 5: Insert segments into database
    await step.run('insert-segments', async () => {
      const supabase = await createClient();

      // Prepare segment rows
      const segments = chunks.map((chunk, index) => ({
        document_id: documentId,
        user_id: document.user_id,
        class_id: document.class_id,
        content: chunk.content,
        embedding: formatEmbeddingForPostgres(embeddings[index]),
        segment_index: chunk.segmentIndex,
        char_start: chunk.charStart,
        char_end: chunk.charEnd,
        embedding_model: 'text-embedding-3-small',
      }));

      // Insert in batches (Supabase can handle large inserts, but be safe)
      const batchSize = 100;
      for (let i = 0; i < segments.length; i += batchSize) {
        const batch = segments.slice(i, i + batchSize);
        const { error } = await supabase.from('segments').insert(batch);

        if (error) {
          throw new Error(`Failed to insert segments: ${error.message}`);
        }
      }
    });

    // Step 6: Mark as completed
    await step.run('mark-completed', async () => {
      const supabase = await createClient();

      await supabase
        .from('documents')
        .update({
          embedding_status: 'completed',
          embedding_completed_at: new Date().toISOString(),
          processed_segments: chunks.length,
        })
        .eq('id', documentId);
    });

    return {
      success: true,
      documentId,
      segmentsCreated: chunks.length,
    };
  }
);
