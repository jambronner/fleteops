import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOperatorExtractionRequest,
  operatorExtractionRequestSchema,
} from "@/lib/documents/extraction-request";

test("operator extraction accepts only the tenant-owned document identity and routing override", () => {
  const parsed = operatorExtractionRequestSchema.parse({
    tenantId: "11111111-1111-4111-8111-111111111111",
    documentId: "22222222-2222-4222-8222-222222222222",
    forceVisionFallback: true,
    fileUrl: "https://attacker.example/file.pdf",
    intakeContext: {
      senderAddress: "spoofed@example.com",
    },
    documentType: "carrier_invoice",
  });

  assert.deepEqual(parsed, {
    tenantId: "11111111-1111-4111-8111-111111111111",
    documentId: "22222222-2222-4222-8222-222222222222",
    forceVisionFallback: true,
  });
  assert.deepEqual(buildOperatorExtractionRequest(parsed), {
    tenantId: parsed.tenantId,
    documentId: parsed.documentId,
    trigger: "operator_request",
    forceVisionFallback: true,
  });
});
