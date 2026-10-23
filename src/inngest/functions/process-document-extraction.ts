import { z } from "zod";

import { inngest } from "@/inngest/client";
import { previewDocumentRouting, runDocumentExtraction } from "@/lib/documents/service";

const extractionEventSchema = z.object({
  tenantId: z.string().uuid(),
  documentId: z.string().uuid(),
  fileUrl: z.string().url().optional().nullable(),
  documentType: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  originalFileName: z.string().optional().nullable(),
  language: z.string().default("es-MX"),
  sourceChannel: z
    .enum(["upload", "whatsapp", "email", "manual", "api", "spreadsheet_import"])
    .default("upload"),
  trigger: z
    .enum(["upload", "whatsapp_ingest", "email_ingest", "manual_retry", "operator_request", "workflow"])
    .default("workflow"),
  pageCount: z.number().int().optional().nullable(),
  forceVisionFallback: z.boolean().optional().default(false),
  detectedScanConfidence: z.number().min(0).max(1).optional().nullable(),
  intakeContext: z
    .object({
      subject: z.string().optional().nullable(),
      textBody: z.string().optional().nullable(),
      senderName: z.string().optional().nullable(),
      senderAddress: z.string().optional().nullable(),
      attachmentNames: z.array(z.string()).optional().nullable(),
      messageCaption: z.string().optional().nullable(),
      threadSnippet: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  inferredDocumentClass: z
    .enum([
      "purchase_order",
      "invoice",
      "proof_of_delivery",
      "delivery_photo",
      "spreadsheet_manifest",
      "generic_document",
    ])
    .optional()
    .nullable(),
});

export const processDocumentExtraction = inngest.createFunction(
  {
    id: "process-document-extraction",
    retries: 1,
    triggers: [{ event: "document/extraction.requested" }],
  },
  async ({ event, step }) => {
    const request = extractionEventSchema.parse(event.data);

    const routing = await step.run("preview-routing", async () => {
      return previewDocumentRouting(request);
    });

    const extraction = await step.run("extract-document", async () => {
      return runDocumentExtraction(request);
    });

    return {
      routing,
      extraction,
    };
  },
);
