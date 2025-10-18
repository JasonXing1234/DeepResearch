/**
 * Tool: Get Class Documents
 *
 * Fetches all lectures and materials for a specific class, including full transcripts.
 * Returns data in the AI SDK message format.
 */

import { createClient } from '@/lib/supabase/server';

export async function getClassDocuments(classId: string, userId: string) {
  const supabase = await createClient();

  // Fetch class information
  const { data: classInfo, error: classError } = await supabase
    .from('classes')
    .select('id, name, class_code, instructor, description')
    .eq('id', classId)
    .eq('user_id', userId)
    .single();

  if (classError || !classInfo) {
    return {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: `Error: Could not find class with ID ${classId}. ${classError?.message || 'Class not found.'}`
        },
      ],
    };
  }

  // Fetch all documents for this class
  const { data: documents, error: docsError } = await supabase
    .from('documents')
    .select('*')
    .eq('class_id', classId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (docsError) {
    return {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: `Error fetching documents: ${docsError.message}`
        },
      ],
    };
  }

  // Separate lectures and materials
  const lectures = (documents || [])
    .filter(d => d.mime_type?.startsWith('audio/') || d.storage_bucket === 'lecture-recordings')
    .map(d => ({
      id: d.id,
      title: d.title,
      date: d.date_of_material || d.created_at?.split('T')[0],
      duration_seconds: d.audio_duration_seconds,
      transcription_status: d.transcription_status,
      transcript: d.transcription_text,
    }));

  const materials = (documents || [])
    .filter(d => !d.mime_type?.startsWith('audio/') && d.storage_bucket !== 'lecture-recordings')
    .map(d => ({
      id: d.id,
      title: d.title,
      type: d.mime_type?.includes('pdf') ? 'PDF' : 'Document',
      date: d.date_of_material || d.created_at?.split('T')[0],
      transcription_status: d.transcription_status,
      transcript: d.transcription_text,
    }));

  // Build comprehensive response text
  let responseText = `**${classInfo.name}**`;
  if (classInfo.class_code) responseText += ` (${classInfo.class_code})`;
  if (classInfo.instructor) responseText += ` - Professor ${classInfo.instructor}`;
  responseText += '\n\n';

  // Add lectures section
  if (lectures.length > 0) {
    responseText += `**Lectures (${lectures.length}):**\n\n`;
    lectures.forEach(lecture => {
      responseText += `### ${lecture.title}\n`;
      responseText += `- Date: ${lecture.date}\n`;
      if (lecture.duration_seconds) {
        const minutes = Math.floor(lecture.duration_seconds / 60);
        responseText += `- Duration: ${minutes} minutes\n`;
      }
      responseText += `- Status: ${lecture.transcription_status}\n`;

      if (lecture.transcript && lecture.transcription_status === 'completed') {
        responseText += `\n**Transcript:**\n${lecture.transcript}\n\n`;
      } else if (lecture.transcription_status === 'processing') {
        responseText += `\n*Transcript is currently being processed...*\n\n`;
      } else if (lecture.transcription_status === 'failed') {
        responseText += `\n*Transcript processing failed*\n\n`;
      } else {
        responseText += `\n*No transcript available*\n\n`;
      }

      responseText += '---\n\n';
    });
  } else {
    responseText += '*No lectures found for this class.*\n\n';
  }

  // Add materials section
  if (materials.length > 0) {
    responseText += `**Materials (${materials.length}):**\n\n`;
    materials.forEach(material => {
      responseText += `- ${material.title} (${material.type})`;
      if (material.date) responseText += ` - ${material.date}`;
      responseText += '\n';

      if (material.transcript && material.transcription_status === 'completed') {
        responseText += `  *Text content available*\n`;
      }
    });
    responseText += '\n';
  } else {
    responseText += '*No materials found for this class.*\n\n';
  }

  return {
    type: "message",
    role: "assistant",
    content: [
      {
        type: "text",
        text: responseText
      },
    ],
  };
}
