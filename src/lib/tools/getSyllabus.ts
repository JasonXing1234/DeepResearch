/**
 * Tool: Get Syllabus
 *
 * Retrieves syllabus documents for a class.
 * Looks for uploaded PDFs that are likely syllabi based on title or metadata.
 */

import { createClient } from '@/lib/supabase/server';

export async function getSyllabus(
  userId: string,
  options: {
    classId: string; // Required: the class to get syllabus for
  }
) {
  const supabase = await createClient();

  // Search for documents that might be syllabi
  // Strategy: Look for PDFs with "syllabus" in the title, or all non-lecture PDFs
  let query = supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .eq('class_id', options.classId)
    .is('deleted_at', null)
    .eq('is_lecture_notes', false) // Syllabi are materials, not lecture notes
    .or('mime_type.eq.application/pdf,storage_bucket.eq.class-materials'); // PDFs in class materials

  const { data: documents, error } = await query;

  if (error) {
    console.error('Error fetching syllabus:', error);
    throw new Error(`Failed to fetch syllabus: ${error.message}`);
  }

  if (!documents || documents.length === 0) {
    return {
      found: false,
      message: 'No syllabus found for this class. Make sure you\'ve uploaded the syllabus PDF.',
    };
  }

  // Prioritize documents with "syllabus" in the title
  const syllabusDocs = documents.filter(doc =>
    doc.title?.toLowerCase().includes('syllabus')
  );

  // If we found explicit syllabus documents, use those; otherwise use all PDFs
  const docsToReturn = syllabusDocs.length > 0 ? syllabusDocs : documents;

  // Format documents with their content
  // Use embedding_status since that's what matters for semantic search
  const syllabi = docsToReturn
    .filter(doc => doc.embedding_status === 'completed') // Only show if embeddings are ready
    .map(doc => ({
      id: doc.id,
      title: doc.title,
      date: doc.date_of_material || doc.created_at?.split('T')[0],
      content: doc.transcription_text,
      file_size_bytes: doc.file_size_bytes,
      pages: doc.metadata?.numPages,
      total_segments: doc.total_segments,
    }));

  if (syllabi.length === 0) {
    return {
      found: false,
      message: 'Syllabus document(s) found but not yet processed. Please wait for text extraction to complete.',
      pendingDocuments: docsToReturn.map(d => ({
        title: d.title,
        transcription_status: d.transcription_status,
        embedding_status: d.embedding_status,
      })),
    };
  }

  return {
    found: true,
    totalDocuments: syllabi.length,
    syllabi,
  };
}
