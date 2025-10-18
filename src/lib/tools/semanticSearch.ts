/**
 * Tool: Semantic Search
 *
 * Performs vector similarity search on document segments to find relevant content.
 * Uses OpenAI embeddings and pgvector for semantic search.
 */

import { createClient } from '@/lib/supabase/server';
import { generateSingleEmbedding } from '@/lib/embeddings';

interface SearchResult {
  content: string;
  documentId: string;
  documentTitle: string;
  documentDate?: string;
  similarity: number;
  segmentIndex: number;
  classId: string;
  className?: string;
}

export async function semanticSearch(
  query: string,
  userId: string,
  options?: {
    classId?: string; // Optional: filter by specific class
    limit?: number; // Default: 10
    similarityThreshold?: number; // Default: 0.7 (0-1, higher = more similar)
  }
): Promise<{
  results: SearchResult[];
  totalResults: number;
}> {
  const limit = options?.limit || 20;
  const similarityThreshold = options?.similarityThreshold || 0.3; // Lower threshold to catch more results

  // Step 1: Generate embedding for the query
  const queryEmbedding = await generateSingleEmbedding(query);

  // Step 2: Call the semantic search RPC function
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('search_segments', {
    query_embedding: queryEmbedding,
    match_threshold: similarityThreshold,
    match_count: limit,
    filter_user_id: userId,
    filter_class_id: options?.classId || null,
  });

  if (error) {
    console.error('Semantic search error:', error);
    throw new Error(`Semantic search failed: ${error.message}`);
  }

  // Map results
  const results: SearchResult[] = (data || []).map((row: any) => ({
    content: row.content,
    documentId: row.document_id,
    documentTitle: row.document_title || 'Untitled',
    documentDate: row.document_date,
    className: row.class_name,
    classId: row.class_id,
    segmentIndex: row.segment_index,
    similarity: row.similarity,
  }));

  return {
    results,
    totalResults: results.length,
  };
}
