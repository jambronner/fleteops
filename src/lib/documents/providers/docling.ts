import { z } from "zod";

import type { ExtractedFactCandidate } from "@/lib/ai/contracts";
import { getDoclingApiKey, getDoclingBaseUrl } from "@/lib/env";
import type {
  DocumentArtifactType,
  DocumentExtractionArtifact,
  DocumentExtractionProvider,
  DocumentExtractionResult,
} from "@/lib/documents/types";

const factCandidateSchema = z.object({
  factType: z.string(),
  valueText: z.string().optional().nullable(),
  valueNumber: z.number().optional().nullable(),
  valueDate: z.string().optional().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional().nullable(),
});

const artifactSchema = z.object({
  artifactType: z.enum([
    "ocr_text",
    "markdown",
    "layout_json",
    "provider_raw",
    "normalized_text",
    "preview_image",
  ] satisfies [DocumentArtifactType, ...DocumentArtifactType[]]),
  storageType: z.enum(["inline_text", "inline_json", "object_storage", "external_url"]),
  mimeType: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  fileUrl: z.string().url().optional().nullable(),
  textContent: z.string().optional().nullable(),
  jsonContent: z.record(z.string(), z.unknown()).optional().nullable(),
  byteSize: z.number().int().optional().nullable(),
  pageFrom: z.number().int().optional().nullable(),
  pageTo: z.number().int().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const doclingResponseSchema = z.object({
  model: z.string().optional().nullable(),
  status: z.enum(["completed", "needs_review", "failed"]).default("completed"),
  overallConfidence: z.number().min(0).max(1).optional().nullable(),
  needsReview: z.boolean().optional().default(false),
  facts: z.array(factCandidateSchema).default([]),
  artifacts: z.array(artifactSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  errorCode: z.string().optional().nullable(),
  errorMessage: z.string().optional().nullable(),
});

function appendProviderRawArtifact(
  result: z.infer<typeof doclingResponseSchema>,
): DocumentExtractionArtifact[] {
  const artifacts = [...result.artifacts];

  if (!artifacts.some((artifact) => artifact.artifactType === "provider_raw")) {
    artifacts.push({
      artifactType: "provider_raw",
      storageType: "inline_json",
      jsonContent: {
        facts: result.facts,
        metadata: result.metadata ?? null,
      },
      metadata: {
        normalizedBy: "fleteops-docling-adapter",
      },
    });
  }

  return artifacts;
}

function normalizeFacts(facts: z.infer<typeof factCandidateSchema>[]): ExtractedFactCandidate[] {
  return facts.map((fact) => ({
    factType: fact.factType,
    valueText: fact.valueText ?? undefined,
    valueNumber: fact.valueNumber ?? undefined,
    valueDate: fact.valueDate ?? undefined,
    confidence: fact.confidence,
    reasoning: fact.reasoning ?? undefined,
  }));
}

export const doclingProvider: DocumentExtractionProvider = {
  name: "docling",
  async extract({ request, decision }): Promise<DocumentExtractionResult> {
    const doclingBaseUrl = getDoclingBaseUrl();
    const doclingApiKey = getDoclingApiKey();

    if (!doclingBaseUrl) {
      throw new Error("DOCLING_BASE_URL is required to use the Docling extraction provider.");
    }

    if (!request.fileUrl) {
      throw new Error("A fileUrl is required for Docling extraction.");
    }

    const endpoint = new URL("/extract", doclingBaseUrl).toString();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(doclingApiKey ? { authorization: `Bearer ${doclingApiKey}` } : {}),
      },
      body: JSON.stringify({
        tenantId: request.tenantId,
        documentId: request.documentId,
        fileUrl: request.fileUrl,
        mimeType: request.mimeType ?? undefined,
        language: request.language ?? "es-MX",
        strategy: decision.strategy,
        outputFormats: ["markdown", "json", "ocr_text"],
        metadata: {
          originalFileName: request.originalFileName ?? null,
          sourceChannel: request.sourceChannel ?? null,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Docling extraction failed with status ${response.status}.`);
    }

    const payload = doclingResponseSchema.parse(await response.json());

    return {
      provider: "docling",
      model: payload.model ?? "docling",
      status: payload.status,
      overallConfidence: payload.overallConfidence ?? null,
      needsReview: payload.needsReview || payload.status === "needs_review",
      facts: normalizeFacts(payload.facts),
      artifacts: appendProviderRawArtifact(payload),
      metadata: payload.metadata,
      errorCode: payload.errorCode ?? null,
      errorMessage: payload.errorMessage ?? null,
    };
  },
};
