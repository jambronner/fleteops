import { Inngest } from "inngest";

import { env } from "@/lib/env";

export const inngest = new Inngest({
  id: "fleteops-ai",
  eventKey: env.INNGEST_EVENT_KEY,
});
