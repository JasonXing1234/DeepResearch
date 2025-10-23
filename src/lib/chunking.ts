/**
 * Text chunking utilities for processing documents into segments.
 * Used for preparing text for embedding generation and vector search.
 */

export type TextChunk = {
  content: string;
  segmentIndex: number;
  charStart: number;
  charEnd: number;
};

export type ChunkOptions = {
  chunkSize: number;
  overlap: number;
};

/**
 * Smart text chunking that respects sentence boundaries.
 *
 * Splits text into chunks of approximately chunkSize tokens, trying to break
 * at sentence boundaries when possible to preserve semantic coherence.
 *
 * @param text - Text to chunk
 * @param options - Chunking configuration
 * @returns Array of text chunks with metadata
 */
export function chunkTextSmart(
  text: string,
  options: ChunkOptions = { chunkSize: 500, overlap: 50 }
): TextChunk[] {
  const { chunkSize, overlap } = options;

  if (!text || text.trim().length === 0) {
    return [];
  }

  // Approximate tokens as words (rough estimate: 1 token ≈ 0.75 words)
  const approxTokensPerWord = 0.75;
  const targetWordCount = Math.floor(chunkSize / approxTokensPerWord);
  const overlapWordCount = Math.floor(overlap / approxTokensPerWord);

  // Split into sentences (basic splitting on . ! ? followed by space)
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];

  const chunks: TextChunk[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;
  let charStart = 0;
  let segmentIndex = 0;

  for (const sentence of sentences) {
    const sentenceWords = sentence.trim().split(/\s+/).length;

    // If adding this sentence would exceed target, finalize current chunk
    if (currentWordCount > 0 && currentWordCount + sentenceWords > targetWordCount) {
      const chunkContent = currentChunk.join(' ').trim();
      const charEnd = charStart + chunkContent.length;

      chunks.push({
        content: chunkContent,
        segmentIndex,
        charStart,
        charEnd,
      });

      segmentIndex++;

      // Start next chunk with overlap
      const overlapSentences = [];
      let overlapWords = 0;

      // Take last few sentences for overlap
      for (let i = currentChunk.length - 1; i >= 0 && overlapWords < overlapWordCount; i--) {
        const s = currentChunk[i];
        overlapSentences.unshift(s);
        overlapWords += s.split(/\s+/).length;
      }

      currentChunk = overlapSentences;
      currentWordCount = overlapWords;
      charStart = charEnd - overlapSentences.join(' ').length;
    }

    currentChunk.push(sentence.trim());
    currentWordCount += sentenceWords;
  }

  // Add final chunk if there's content
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join(' ').trim();
    const charEnd = charStart + chunkContent.length;

    chunks.push({
      content: chunkContent,
      segmentIndex,
      charStart,
      charEnd,
    });
  }

  return chunks;
}
