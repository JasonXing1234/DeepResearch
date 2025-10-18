/**
 * Text chunking utilities for creating segments from documents.
 *
 * Chunks text into overlapping segments for better retrieval in RAG systems.
 */

export type TextChunk = {
  content: string;
  charStart: number;
  charEnd: number;
  segmentIndex: number;
};

export type ChunkingOptions = {
  /** Target chunk size in tokens (approximate) */
  chunkSize?: number;
  /** Overlap between chunks in tokens (approximate) */
  overlap?: number;
};

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_OVERLAP = 50;

/**
 * Rough token estimation: ~4 characters per token for English text
 * This is an approximation - actual tokenization varies by model
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Convert token count to approximate character count
 */
function tokensToChars(tokens: number): number {
  return tokens * 4;
}

/**
 * Split text into chunks with overlap.
 *
 * @param text - The full text to chunk
 * @param options - Chunking configuration
 * @returns Array of text chunks with metadata
 *
 * @example
 * const chunks = chunkText(transcription, { chunkSize: 500, overlap: 50 });
 * // chunks = [
 * //   { content: "...", charStart: 0, charEnd: 2000, segmentIndex: 0 },
 * //   { content: "...", charStart: 1800, charEnd: 3800, segmentIndex: 1 },
 * //   ...
 * // ]
 */
export function chunkText(
  text: string,
  options: ChunkingOptions = {}
): TextChunk[] {
  const { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP } = options;

  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks: TextChunk[] = [];
  const chunkChars = tokensToChars(chunkSize);
  const overlapChars = tokensToChars(overlap);
  const step = chunkChars - overlapChars;

  let segmentIndex = 0;
  let charStart = 0;

  while (charStart < text.length) {
    const charEnd = Math.min(charStart + chunkChars, text.length);
    const content = text.slice(charStart, charEnd).trim();

    if (content.length > 0) {
      chunks.push({
        content,
        charStart,
        charEnd,
        segmentIndex,
      });
      segmentIndex++;
    }

    charStart += step;

    // Break if we're at the end
    if (charEnd >= text.length) {
      break;
    }
  }

  return chunks;
}

/**
 * Smart chunking that tries to break on sentence boundaries.
 * Falls back to character-based chunking if no good break points found.
 *
 * @param text - The full text to chunk
 * @param options - Chunking configuration
 * @returns Array of text chunks with metadata
 */
export function chunkTextSmart(
  text: string,
  options: ChunkingOptions = {}
): TextChunk[] {
  const { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP } = options;

  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks: TextChunk[] = [];
  const chunkChars = tokensToChars(chunkSize);
  const overlapChars = tokensToChars(overlap);
  const step = chunkChars - overlapChars;

  // Sentence boundary regex (. ! ? followed by space or newline)
  const sentenceEnd = /[.!?][\s\n]+/g;

  let segmentIndex = 0;
  let charStart = 0;

  while (charStart < text.length) {
    let charEnd = Math.min(charStart + chunkChars, text.length);

    // Try to find a sentence boundary near the target end
    if (charEnd < text.length) {
      const searchStart = Math.max(charStart, charEnd - 200); // Look back up to 200 chars
      const searchText = text.slice(searchStart, charEnd + 200); // Look ahead up to 200 chars
      const matches = Array.from(searchText.matchAll(sentenceEnd));

      if (matches.length > 0) {
        // Find the match closest to our target end point
        const targetOffset = charEnd - searchStart;
        let closestMatch = matches[0];
        let closestDist = Math.abs((matches[0].index || 0) - targetOffset);

        for (const match of matches) {
          const dist = Math.abs((match.index || 0) - targetOffset);
          if (dist < closestDist) {
            closestMatch = match;
            closestDist = dist;
          }
        }

        if (closestMatch.index !== undefined) {
          charEnd = searchStart + closestMatch.index + closestMatch[0].length;
        }
      }
    }

    const content = text.slice(charStart, charEnd).trim();

    if (content.length > 0) {
      chunks.push({
        content,
        charStart,
        charEnd,
        segmentIndex,
      });
      segmentIndex++;
    }

    charStart += step;

    // Break if we're at the end
    if (charEnd >= text.length) {
      break;
    }
  }

  return chunks;
}

/**
 * Get the total word count for chunked text
 */
export function getWordCount(chunks: TextChunk[]): number {
  return chunks.reduce((count, chunk) => {
    return count + chunk.content.split(/\s+/).length;
  }, 0);
}
