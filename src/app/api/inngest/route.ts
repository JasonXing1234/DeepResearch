/**
 * Inngest webhook endpoint.
 *
 * This route is required by Inngest to communicate with your application.
 * It registers all your Inngest functions and handles incoming events.
 *
 * Local development: http://localhost:3000/api/inngest
 * Production: https://your-app.vercel.app/api/inngest
 */

import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { processAudio } from '@/inngest/functions/process-audio';
// import { processPDF } from '@/inngest/functions/process-pdf'; // TODO: Fix pdf-parse import issues
import { processTranscript } from '@/inngest/functions/process-transcript';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processAudio,
    // processPDF, // TODO: Fix pdf-parse import issues
    processTranscript,
  ],
});
