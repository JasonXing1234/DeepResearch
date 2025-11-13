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

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // If it's a quota error (429), throw immediately without retrying
      if (error.status === 429 || error.code === 'insufficient_quota') {
        throw new Error(
          `OpenAI API quota exceeded. Please check your billing and quota at https://platform.openai.com/account/billing. Original error: ${error.message}`
        );
      }

      // For rate limit errors that aren't quota issues, retry with exponential backoff
      if (error.status === 429 && attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // For other errors, retry with exponential backoff
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

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

    try {
      const response = await retryWithBackoff(() =>
        openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: batchTexts,
        })
      );

      const batchEmbeddings = response.data.map((item) => item.embedding);
      allEmbeddings.push(...batchEmbeddings);

      if (onProgress) {
        await onProgress(Math.min(i + MAX_BATCH_SIZE, chunks.length), chunks.length);
      }

      // Add a small delay between batches to avoid rate limiting
      if (i + MAX_BATCH_SIZE < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error: any) {
      console.error(`Failed to generate embeddings for batch ${i}-${i + batch.length}:`, error.message);
      throw error;
    }
  }

  return allEmbeddings;
}

export async function generateSingleEmbedding(text: string): Promise<number[]> {
  try {
    const response = await retryWithBackoff(() =>
      openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
      })
    );

    return response.data[0].embedding;
  } catch (error: any) {
    console.error('Failed to generate single embedding:', error.message);
    throw error;
  }
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
