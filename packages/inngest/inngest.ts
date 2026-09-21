import { EventSchemas, Inngest } from "inngest";

import type { Events } from ".";

export const inngest = new Inngest({
  id: "next",
  schemas: new EventSchemas().fromRecord<Events>(),
  // Without this, `bun run build && bun start` sends real events to Inngest
  // Cloud using whatever INNGEST_EVENT_KEY is in .env — including the literal
  // "local" that .env.example ships. Only talk to the cloud when this is a
  // genuine production deploy with a real key.
  isDev: !(
    process.env.NODE_ENV === "production" &&
    !!process.env.INNGEST_EVENT_KEY &&
    process.env.INNGEST_EVENT_KEY !== "local"
  ),
});
