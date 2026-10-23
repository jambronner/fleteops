import type {
  DocumentExtractionRequest,
  DocumentExtractionResult,
  DocumentRoutingDecision,
  ExtractionProviderName,
} from "@/lib/documents/types";

type JsonRecord = Record<string, unknown>;

export type ExtractionRunProvenanceInput = {
  id: string;
  provider: string;
  model: string | null;
  status: string;
  isFallbackRun: boolean;
  fallbackFromRunId: string | null;
  metadata: JsonRecord | null;
};

export type ExtractionFactProvenanceInput = {
  extractionRunId: string | null;
  sourceArtifactId: string | null;
  sourceProvider: string | null;
};

export type ExtractionProvenanceSummary = {
  provider: string;
  model: string | null;
  status: string;
  upstreamProvider: string | null;
  externalProcessing: boolean;
  isFallbackRun: boolean;
  fallbackFrom: {
    provider: string;
    model: string | null;
    status: string;
  } | null;
  reusedFromStoredEvidence: boolean;
  factCount: number;
  sourceLinkedFactCount: number;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function optionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized.slice(0, 128) : null;
}

function sanitizeExistingMetadata(metadata: JsonRecord | null | undefined) {
  const existing = metadata ?? {};
  const request = asRecord(existing.request);

  if (!request) {
    return existing;
  }

  const safeRequest = Object.fromEntries(
    Object.entries(request).filter(
      ([key]) => key !== "fileUrl" && key !== "fileDataUrl",
    ),
  );

  return {
    ...existing,
    request: safeRequest,
  };
}

export function buildExtractionRunMetadata(args: {
  request: DocumentExtractionRequest;
  decision: DocumentRoutingDecision;
  provider: ExtractionProviderName;
}) {
  return {
    request: {
      source: "tenant_stored_document",
      mimeType: args.request.mimeType ?? null,
      originalFileName: args.request.originalFileName ?? null,
      documentType: args.request.documentType ?? null,
      language: args.request.language ?? null,
      inferredDocumentClass: args.request.inferredDocumentClass ?? null,
    },
    routing: args.decision,
    execution: {
      provider: args.provider,
      model: null,
      upstreamProvider: null,
      externalProcessing: args.provider === "openrouter_vision",
    },
  } satisfies JsonRecord;
}

export function mergeExtractionResultMetadata(args: {
  existingMetadata: JsonRecord | null;
  provider: ExtractionProviderName;
  result: DocumentExtractionResult;
}): JsonRecord {
  if (args.result.provider !== args.provider) {
    throw new Error("Extraction result provider does not match the executing provider.");
  }

  const resultMetadata = asRecord(args.result.metadata);

  return {
    ...sanitizeExistingMetadata(args.existingMetadata),
    execution: {
      provider: args.provider,
      model: args.result.model ?? null,
      upstreamProvider: optionalString(resultMetadata?.provider),
      externalProcessing: args.provider === "openrouter_vision",
    },
  } satisfies JsonRecord;
}

export function buildReusedExtractionMetadata(args: {
  sourceMetadata: JsonRecord | null;
  sourceDocumentId: string;
  sourceRunId: string;
  sourceFallbackFromRunId: string | null;
  copiedAt: string;
}): JsonRecord {
  return {
    ...sanitizeExistingMetadata(args.sourceMetadata),
    reusedExtraction: {
      sourceDocumentId: args.sourceDocumentId,
      sourceRunId: args.sourceRunId,
      sourceFallbackFromRunId: args.sourceFallbackFromRunId,
      copiedAt: args.copiedAt,
    },
  } satisfies JsonRecord;
}

export function buildExtractionProvenanceSummary(args: {
  latestRun: ExtractionRunProvenanceInput;
  runs: ExtractionRunProvenanceInput[];
  facts: ExtractionFactProvenanceInput[];
}): ExtractionProvenanceSummary {
  const execution = asRecord(args.latestRun.metadata?.execution);
  const fallbackSource = args.latestRun.fallbackFromRunId
    ? args.runs.find((run) => run.id === args.latestRun.fallbackFromRunId) ?? null
    : null;
  const latestFacts = args.facts.filter(
    (fact) => fact.extractionRunId === args.latestRun.id,
  );

  return {
    provider: args.latestRun.provider,
    model: args.latestRun.model,
    status: args.latestRun.status,
    upstreamProvider: optionalString(execution?.upstreamProvider),
    externalProcessing:
      execution?.externalProcessing === true ||
      args.latestRun.provider === "openrouter_vision",
    isFallbackRun: args.latestRun.isFallbackRun,
    fallbackFrom: fallbackSource
      ? {
          provider: fallbackSource.provider,
          model: fallbackSource.model,
          status: fallbackSource.status,
        }
      : null,
    reusedFromStoredEvidence: Boolean(
      asRecord(args.latestRun.metadata?.reusedExtraction),
    ),
    factCount: latestFacts.length,
    sourceLinkedFactCount: latestFacts.filter(
      (fact) => Boolean(fact.sourceArtifactId && fact.sourceProvider),
    ).length,
  };
}
