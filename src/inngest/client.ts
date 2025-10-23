import { Inngest } from "inngest";

/**
 * Inngest client for the DeepResearch application.
 *
 * In local development, no event key is needed.
 * In production, set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY.
 */
export const inngest = new Inngest({
  id: "deep-research",
  name: "DeepResearch AI",
  // Only use event key if it's a real key (not the placeholder)
  eventKey: process.env.INNGEST_EVENT_KEY &&
    process.env.INNGEST_EVENT_KEY !== 'your-inngest-event-key'
    ? process.env.INNGEST_EVENT_KEY
    : undefined,
});
