import { z } from "zod";

import type { DocumentExtractionRequest } from "@/lib/documents/types";

export const operatorExtractionRequestSchema = z.object({
  tenantId: z.string().uuid(),
  documentId: z.string().uuid(),
  forceVisionFallback: z.boolean().optional().default(false),
});

export function buildOperatorExtractionRequest(args: {
  tenantId: string;
  documentId: string;
  forceVisionFallback?: boolean;
}): DocumentExtractionRequest {
  return {
    tenantId: args.tenantId,
    documentId: args.documentId,
    trigger: "operator_request",
    forceVisionFallback: args.forceVisionFallback ?? false,
  };
}
