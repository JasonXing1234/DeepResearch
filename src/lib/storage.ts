/**
 * Storage utility functions for managing file paths across buckets.
 *
 * Architecture:
 * - Original files stored in their respective buckets (lecture-recordings, class-materials)
 * - Extracted transcripts stored in 'transcripts' bucket
 * - Transcript paths derived from original paths by changing extension to .txt
 */

type Document = {
  file_path: string;
  storage_bucket: string;
};

/**
 * Get the path to the transcript file for a given document.
 * Replaces the file extension with .txt
 *
 * @example
 * getTranscriptPath({ file_path: "user_123/class_456/recording.mp3", storage_bucket: "lecture-recordings" })
 * // Returns: "user_123/class_456/recording.txt"
 */
export function getTranscriptPath(document: Document): string {
  const pathWithoutExt = document.file_path.replace(/\.[^.]+$/, '');
  return `${pathWithoutExt}.txt`;
}

/**
 * Get the bucket and path for the original file
 */
export function getOriginalFile(document: Document) {
  return {
    bucket: document.storage_bucket,
    path: document.file_path,
  };
}

/**
 * Get the bucket and path for the transcript file
 * All transcripts live in the 'transcripts' bucket
 */
export function getTranscriptFile(document: Document) {
  return {
    bucket: 'transcripts',
    path: getTranscriptPath(document),
  };
}

/**
 * Get the filename without extension
 */
export function getFilenameWithoutExtension(filePath: string): string {
  const filename = filePath.split('/').pop() || '';
  return filename.replace(/\.[^.]+$/, '');
}

/**
 * Get the file extension
 */
export function getFileExtension(filePath: string): string {
  const match = filePath.match(/\.([^.]+)$/);
  return match ? match[1] : '';
}

/**
 * Build a storage path for a new file upload
 *
 * @param userId - User ID
 * @param classId - Class ID
 * @param filename - Original filename
 * @param documentId - Document UUID (used for uniqueness)
 * @returns Path in format: user_{userId}/class_{classId}/{documentId}.{ext}
 */
export function buildStoragePath(
  userId: string,
  classId: string,
  filename: string,
  documentId: string
): string {
  const extension = getFileExtension(filename);
  return `${userId}/${classId}/${documentId}.${extension}`;
}
