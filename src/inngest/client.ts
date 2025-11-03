import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "deep-research",
  name: "DeepResearch AI",
  eventKey: process.env.INNGEST_EVENT_KEY &&
    process.env.INNGEST_EVENT_KEY !== 'your-inngest-event-key'
    ? process.env.INNGEST_EVENT_KEY
    : undefined,
});
