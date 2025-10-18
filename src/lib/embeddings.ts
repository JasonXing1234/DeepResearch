/**
 * Embedding generation utilities using OpenAI's embedding models.
 */

import OpenAI from 'openai';
import type { TextChunk } from './chunking';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;
export const MAX_BATCH_SIZE = 100; // OpenAI limit

export type EmbeddingResult = {
  embedding: number[];
  index: number;
};

/**
 * Generate embeddings for an array of text chunks in batches.
 *
 * OpenAI allows up to 100 inputs per request, so we batch accordingly.
 *
 * @param chunks - Array of text chunks to embed
 * @param onProgress - Optional callback for progress updates
 * @returns Array of embeddings in the same order as input chunks
 *
 * @example
 * const embeddings = await generateEmbeddings(chunks, (processed, total) => {
 *   console.log(`Progress: ${processed}/${total}`);
 * });
 */
export async function generateEmbeddings(
  chunks: TextChunk[],
  onProgress?: (processed: number, total: number) => void | Promise<void>
): Promise<number[][]> {
  if (chunks.length === 0) {
    return [];
  }

  const allEmbeddings: number[][] = [];

  // Process in batches
  for (let i = 0; i < chunks.length; i += MAX_BATCH_SIZE) {
    const batch = chunks.slice(i, i + MAX_BATCH_SIZE);
    const batchTexts = batch.map((chunk) => chunk.content);

    // Call OpenAI API
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batchTexts,
    });

    // Extract embeddings in order
    const batchEmbeddings = response.data.map((item) => item.embedding);
    allEmbeddings.push(...batchEmbeddings);

    // Report progress
    if (onProgress) {
      await onProgress(Math.min(i + MAX_BATCH_SIZE, chunks.length), chunks.length);
    }
  }

  return allEmbeddings;
}

/**
 * Generate embedding for a single piece of text.
 *
 * @param text - Text to embed
 * @returns Embedding vector
 */
export async function generateSingleEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Calculate cosine similarity between two embedding vectors.
 * Returns a value between -1 and 1, where 1 means identical.
 *
 * @param a - First embedding vector
 * @param b - Second embedding vector
 * @returns Cosine similarity score
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Format embedding as a string for PostgreSQL vector type.
 * Converts array to format: [0.1, 0.2, 0.3, ...]
 *
 * @param embedding - Embedding vector
 * @returns Formatted string for pgvector
 */
export function formatEmbeddingForPostgres(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
