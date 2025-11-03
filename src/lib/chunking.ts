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

export function chunkTextSmart(
  text: string,
  options: ChunkOptions = { chunkSize: 500, overlap: 50 }
): TextChunk[] {
  const { chunkSize, overlap } = options;

  if (!text || text.trim().length === 0) {
    return [];
  }

  const approxTokensPerWord = 0.75;
  const targetWordCount = Math.floor(chunkSize / approxTokensPerWord);
  const overlapWordCount = Math.floor(overlap / approxTokensPerWord);

  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];

  const chunks: TextChunk[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;
  let charStart = 0;
  let segmentIndex = 0;

  for (const sentence of sentences) {
    const sentenceWords = sentence.trim().split(/\s+/).length;

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

      const overlapSentences = [];
      let overlapWords = 0;

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
