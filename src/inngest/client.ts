import { Inngest } from "inngest";

/**
 * Inngest client for the study assistant application.
 *
 * In local development, no event key is needed.
 * In production, set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY.
 */
export const inngest = new Inngest({
  id: "study-assistant",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
