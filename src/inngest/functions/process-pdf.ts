/**
 * Process PDF files: extract text and save transcript to storage.
 *
 * Flow:
 * 1. Download PDF file from class-materials bucket
 * 2. Extract text using pdf-parse library
 * 3. Save extracted text as .txt file in transcripts bucket
 * 4. Update database with extraction status
 * 5. Trigger transcript/created event to start embedding generation
 */

import { inngest } from '../client';
import { createClient } from '@/lib/supabase/server';
import { getOriginalFile, getTranscriptFile } from '@/lib/storage';
import { extractText } from 'unpdf';

export const processPDF = inngest.createFunction(
  {
    id: 'process-pdf',
    retries: 3,
    concurrency: {
      limit: 10, // PDFs are CPU-bound, can handle more concurrency than API calls
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
  { event: 'pdf/uploaded' },
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

    // Step 2: Download PDF and extract text
    // Note: Download and extraction are in same step because Blob can't be serialized between steps
    const extractedText = await step.run('download-and-extract', async () => {
      // Download PDF file
      const supabase = await createClient();
      const originalFile = getOriginalFile(document);

      const { data: pdfBlob, error } = await supabase.storage
        .from(originalFile.bucket)
        .download(originalFile.path);

      if (error || !pdfBlob) {
        throw new Error(`Failed to download PDF: ${error?.message}`);
      }

      // Convert Blob to ArrayBuffer for unpdf
      const arrayBuffer = await pdfBlob.arrayBuffer();

      // Extract text from PDF using unpdf
      // mergePages: true returns a single string instead of array
      const { text, totalPages } = await extractText(arrayBuffer, { mergePages: true });

      if (!text || text.trim().length === 0) {
        throw new Error('No text content found in PDF. The PDF may be scanned or image-based.');
      }

      return {
        text,
        numPages: totalPages,
      };
    });

    // Step 3: Save extracted text to storage
    await step.run('save-transcript', async () => {
      const supabase = await createClient();
      const transcriptFile = getTranscriptFile(document);

      // Upload transcript as .txt file
      const { error } = await supabase.storage
        .from(transcriptFile.bucket)
        .upload(transcriptFile.path, extractedText.text, {
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

      const wordCount = extractedText.text.split(/\s+/).length;

      await supabase
        .from('documents')
        .update({
          transcription_status: 'completed',
          transcription_completed_at: new Date().toISOString(),
          transcription_model: 'unpdf',
          transcription_text: extractedText.text, // Save extracted text to database
          word_count: wordCount,
          // Store PDF metadata if available
          metadata: {
            numPages: extractedText.numPages,
          },
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

    return { success: true, documentId, numPages: extractedText.numPages };
  }
);
