import { inngest } from '../client';
import { createServiceClient } from '@/lib/supabase/service';
import { chunkTextSmart } from '@/lib/chunking';
import { generateEmbeddings, formatEmbeddingForPostgres } from '@/lib/embeddings';

interface ResearchDocumentEvent {
  researchDocumentId: string;
  userId?: string;
}

export const processResearchDocument = inngest.createFunction(
  {
    id: 'process-research-document',
    retries: 3,
    concurrency: {
      limit: 5,
    },
    onFailure: async ({ event, error }) => {
      const supabase = createServiceClient();
      const eventData = event.data.event?.data || event.data;
      const { researchDocumentId } = eventData as ResearchDocumentEvent;
      await supabase
        .from('research_documents')
        .update({
          vectorization_status: 'failed',
        })
        .eq('id', researchDocumentId);
    },
  },
  { event: 'research/document.created' },
  async ({ event, step }) => {
    const { researchDocumentId } = event.data as ResearchDocumentEvent;

    // Step 1: Get research document details
    const researchDocument = await step.run('get-research-document', async () => {
      const supabase = createServiceClient();

      const { data: doc, error } = await supabase
        .from('research_documents')
        .select('*')
        .eq('id', researchDocumentId)
        .single();

      if (error || !doc) {
        throw new Error(`Research document not found: ${researchDocumentId}`);
      }

      // Update status to processing
      await supabase
        .from('research_documents')
        .update({
          vectorization_status: 'processing',
        })
        .eq('id', researchDocumentId);

      return doc;
    });

    const fileContent = await step.run('download-file', async () => {
      const supabase = createServiceClient();

      const { data, error } = await supabase.storage
        .from(researchDocument.storage_bucket)
        .download(researchDocument.file_path);

      if (error || !data) {
        throw new Error(`Failed to download file: ${error?.message}`);
      }

      return await data.text();
    });

    const extractedText = await step.run('extract-text', async () => {
      try {
        const jsonData = JSON.parse(fileContent);

        const extractTextFromObject = (obj: any): string => {
          if (typeof obj === 'string') {
            return obj + ' ';
          }
          if (Array.isArray(obj)) {
            return obj.map(extractTextFromObject).join(' ');
          }
          if (obj && typeof obj === 'object') {
            return Object.values(obj).map(extractTextFromObject).join(' ');
          }
          return '';
        };

        const text = extractTextFromObject(jsonData);

        const prefix = `Company: ${researchDocument.company_name}\nCategory: ${researchDocument.category}\n\n`;
        return prefix + text;
      } catch (error) {
        throw new Error(`Failed to parse JSON: ${error}`);
      }
    });

    const chunks = await step.run('chunk-text', async () => {
      const textChunks = chunkTextSmart(extractedText, {
        chunkSize: 500,
        overlap: 50,
      });

      return textChunks;
    });

    const embeddings = await step.run('generate-embeddings', async () => {
      try {
        return await generateEmbeddings(chunks);
      } catch (error: any) {
        console.error('Failed to generate embeddings:', error);

        // If it's a quota error, update the research queue status and throw
        if (error.message?.includes('quota exceeded')) {
          const supabase = createServiceClient();
          await supabase
            .from('research_queue')
            .update({
              status: 'failed',
              error_message: 'OpenAI API quota exceeded. Please check your billing.',
            })
            .eq('id', researchDocument.research_id);
        }

        throw error;
      }
    });

    const userId = await step.run('get-user-id', async () => {
      const { userId: eventUserId } = event.data as ResearchDocumentEvent;

      // If userId is provided in the event, use it directly
      if (eventUserId) {
        return eventUserId;
      }

      // Otherwise, look it up from the research_queue table
      const supabase = createServiceClient();

      const { data: queueEntry, error } = await supabase
        .from('research_queue')
        .select('user_id')
        .eq('id', researchDocument.research_id)
        .single();

      if (error || !queueEntry) {
        throw new Error(
          `Could not find research queue entry for research_id: ${researchDocument.research_id}. ` +
          `Error: ${error?.message || 'No data returned'}. ` +
          `Please ensure the research queue entry exists and RLS is disabled for service client.`
        );
      }

      return queueEntry.user_id;
    });

    const segmentIds = await step.run('insert-segments', async () => {
      const supabase = createServiceClient();

      const dummyClassId = '00000000-0000-0000-0000-000000000001';
      const dummyDocumentId = '00000000-0000-0000-0000-000000000001';

      const segments = chunks.map((chunk, index) => ({
        user_id: userId,
        class_id: dummyClassId,
        document_id: dummyDocumentId,
        content: chunk.content,
        embedding: formatEmbeddingForPostgres(embeddings[index]),
        segment_index: chunk.segmentIndex,
        char_start: chunk.charStart,
        char_end: chunk.charEnd,
        embedding_model: 'text-embedding-3-small',
      }));

      const batchSize = 100;
      const insertedIds: string[] = [];

      for (let i = 0; i < segments.length; i += batchSize) {
        const batch = segments.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('segments')
          .insert(batch)
          .select('id');

        if (error) {
          throw new Error(`Failed to insert segments: ${error.message}`);
        }

        insertedIds.push(...(data || []).map((s) => s.id));
      }

      return insertedIds;
    });

    await step.run('link-segments', async () => {
      const supabase = createServiceClient();

      // Verify the research document still exists
      const { data: docCheck, error: docCheckError } = await supabase
        .from('research_documents')
        .select('id')
        .eq('id', researchDocumentId)
        .single();

      if (docCheckError || !docCheck) {
        console.error('Research document not found when linking segments:', {
          researchDocumentId,
          error: docCheckError,
        });
        throw new Error(`Research document ${researchDocumentId} not found when linking segments`);
      }

      const researchSegments = segmentIds.map((segmentId) => ({
        research_document_id: researchDocumentId,
        segment_id: segmentId,
        company_name: researchDocument.company_name,
        category: researchDocument.category,
      }));

      const { error } = await supabase
        .from('research_segments')
        .insert(researchSegments);

      if (error) {
        console.error('Failed to insert research_segments:', {
          researchDocumentId,
          segmentCount: segmentIds.length,
          error: error.message,
          details: error,
        });
        throw new Error(`Failed to link segments: ${error.message}`);
      }
    });

    await step.run('mark-completed', async () => {
      const supabase = createServiceClient();

      await supabase
        .from('research_documents')
        .update({
          vectorization_status: 'completed',
          segment_count: chunks.length,
        })
        .eq('id', researchDocumentId);
    });

    return {
      success: true,
      researchDocumentId,
      segmentsCreated: chunks.length,
    };
  }
);
