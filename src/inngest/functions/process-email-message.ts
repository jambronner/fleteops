import { inboundEmailEventSchema, processInboundEmailMessages } from "@/lib/email/process-inbound";
import { inngest } from "@/inngest/client";

export const processEmailMessage = inngest.createFunction(
  {
    id: "process-email-message",
    retries: 2,
    triggers: [{ event: "email/message.received" }],
  },
  async ({ event, step }) => {
    const payload = inboundEmailEventSchema.parse(event.data);
    return step.run("process-email-intake-events", async () => processInboundEmailMessages(payload));
  },
);
