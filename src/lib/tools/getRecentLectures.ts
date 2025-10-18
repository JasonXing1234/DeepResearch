/**
 * Tool: Get Recent Lectures
 *
 * Fetches recent lectures for a class, optionally filtering by date.
 * Useful for queries like "what did we talk about last time?"
 */

import { createClient } from '@/lib/supabase/server';

export async function getRecentLectures(
  userId: string,
  options?: {
    classId?: string; // Optional: filter by specific class
    limit?: number; // Default: 5
    sinceDate?: string; // Optional: only lectures after this date (ISO format)
  }
) {
  const limit = options?.limit || 5;
  const supabase = await createClient();

  let query = supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .eq('transcription_status', 'completed') // Only get successfully transcribed lectures
    .order('created_at', { ascending: false });

  // Filter by class if specified
  if (options?.classId) {
    query = query.eq('class_id', options.classId);
  }

  // Filter by date if specified
  if (options?.sinceDate) {
    query = query.gte('created_at', options.sinceDate);
  }

  query = query.limit(limit);

  const { data: documents, error } = await query;

  if (error) {
    console.error('Error fetching recent lectures:', error);
    throw new Error(`Failed to fetch recent lectures: ${error.message}`);
  }

  if (!documents || documents.length === 0) {
    return {
      found: false,
      message: 'No recent lectures found.',
      lectures: [],
    };
  }

  // Format lectures with their full transcripts
  const lectures = documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    date: doc.date_of_material || doc.created_at?.split('T')[0],
    duration_seconds: doc.audio_duration_seconds,
    transcript: doc.transcription_text,
    word_count: doc.word_count,
  }));

  return {
    found: true,
    totalLectures: lectures.length,
    lectures,
  };
}
