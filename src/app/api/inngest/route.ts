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
import { processResearchDocument } from '@/inngest/functions/process-research-document';
import { processSustainabilityAnalysis } from '@/inngest/functions/process-sustainability-analysis';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processResearchDocument,
    processSustainabilityAnalysis,
  ],
});
