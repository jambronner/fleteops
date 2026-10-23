import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { processDocumentExtraction } from "@/inngest/functions/process-document-extraction";
import { processEmailMessage } from "@/inngest/functions/process-email-message";
import { processWhatsappMessage } from "@/inngest/functions/process-whatsapp-message";

export const dynamic = "force-dynamic";

const handlers = serve({
  client: inngest,
  functions: [processWhatsappMessage, processEmailMessage, processDocumentExtraction],
});

export const GET: typeof handlers.GET = async (...args) => isDemoMode() ? demoApiDisabled() : handlers.GET(...args);
export const POST: typeof handlers.POST = async (...args) => isDemoMode() ? demoApiDisabled() : handlers.POST(...args);
export const PUT: typeof handlers.PUT = async (...args) => isDemoMode() ? demoApiDisabled() : handlers.PUT(...args);
