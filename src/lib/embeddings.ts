import OpenAI from 'openai';
import type { TextChunk } from './chunking';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
});

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;
export const MAX_BATCH_SIZE = 100;

export type EmbeddingResult = {
  embedding: number[];
  index: number;
};

export async function generateEmbeddings(
  chunks: TextChunk[],
  onProgress?: (processed: number, total: number) => void | Promise<void>
): Promise<number[][]> {
  if (chunks.length === 0) {
    return [];
  }

  const allEmbeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += MAX_BATCH_SIZE) {
    const batch = chunks.slice(i, i + MAX_BATCH_SIZE);
    const batchTexts = batch.map((chunk) => chunk.content);

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batchTexts,
    });

    const batchEmbeddings = response.data.map((item) => item.embedding);
    allEmbeddings.push(...batchEmbeddings);

    if (onProgress) {
      await onProgress(Math.min(i + MAX_BATCH_SIZE, chunks.length), chunks.length);
    }
  }

  return allEmbeddings;
}

export async function generateSingleEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0].embedding;
}

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

export function formatEmbeddingForPostgres(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
