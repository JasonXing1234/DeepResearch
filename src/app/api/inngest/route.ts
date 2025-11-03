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
