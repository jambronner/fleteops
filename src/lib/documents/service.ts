import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  documentArtifacts,
  documentExtractionRuns,
  documents,
  extractedFacts,
} from "@/lib/db/schema";
import { inferDocumentClass } from "@/lib/documents/classification";
import {
  buildExtractionRunMetadata,
  mergeExtractionResultMetadata,
} from "@/lib/documents/extraction-provenance";
import { getDoclingBaseUrl, getOpenRouterApiKey } from "@/lib/env";
import { getStoredDocumentContext } from "@/lib/documents/repository";
import { doclingProvider } from "@/lib/documents/providers/docling";
import { openRouterVisionProvider } from "@/lib/documents/providers/openrouter-vision";
import { decideDocumentRouting } from "@/lib/documents/routing";
import type {
  DocumentExtractionProvider,
  DocumentExtractionRequest,
  DocumentExtractionResult,
  DocumentRoutingDecision,
  DocumentSemanticClass,
  ExtractionProviderName,
} from "@/lib/documents/types";

const providers: Record<ExtractionProviderName, DocumentExtractionProvider> = {
  docling: doclingProvider,
  openrouter_vision: openRouterVisionProvider,
};

const supportedFactTypes = [
  "po_number",
  "invoice_number",
  "shipment_reference",
  "delivery_date",
  "receiver_name",
  "store_name",
  "qty_expected",
  "qty_delivered",
  "qty_rejected",
  "amount_total",
  "other",
 ] as const;
type SupportedFactType = (typeof supportedFactTypes)[number];
const supportedFactTypeSet = new Set<SupportedFactType>(supportedFactTypes);

function requireDb() {
  if (!db) {
    throw new Error("DATABASE_URL is required for document extraction persistence.");
  }

  return db;
}

function getProvider(name: ExtractionProviderName) {
  return providers[name];
}

function normalizeConfidence(value?: number | null) {
  return value != null ? value.toFixed(4) : null;
}

function inferDocumentStatus(result: DocumentExtractionResult) {
  if (result.status === "failed") {
    return "failed" as const;
  }

  if (result.needsReview || result.status === "needs_review") {
    return "needs_review" as const;
  }

  return "completed" as const;
}

function coerceFactType(factType: string) {
  return supportedFactTypeSet.has(factType as SupportedFactType)
    ? (factType as SupportedFactType)
    : "other";
}

type StoredDocumentType = typeof documents.$inferSelect.documentType;
type ReclassificationResult = {
  documentType: StoredDocumentType;
  documentClass: DocumentSemanticClass;
  reason: string;
};

const broadDocumentTypes = new Set<StoredDocumentType>(["photo", "pdf", "other"]);

function collectExtractionText(result: DocumentExtractionResult) {
  const artifactText = result.artifacts
    .map((artifact) => artifact.textContent ?? "")
    .filter(Boolean)
    .join("\n");
  const factText = result.facts
    .map((fact) => [fact.factType, fact.valueText, fact.valueNumber, fact.valueDate].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("\n");

  return [artifactText, factText].filter(Boolean).join("\n").toLowerCase();
}

function inferDocumentReclassification(args: {
  currentDocumentType: StoredDocumentType;
  result: DocumentExtractionResult;
}): ReclassificationResult | null {
  if (!broadDocumentTypes.has(args.currentDocumentType)) {
    return null;
  }

  const factTypes = new Set(args.result.facts.map((fact) => fact.factType));
  const text = collectExtractionText(args.result);

  if (
    factTypes.has("po_number") ||
    /\b(orden de compra|purchase order|orden compra|po number|oc[-:\s]?\w+)/i.test(text)
  ) {
    return {
      documentType: "customer_po",
      documentClass: "purchase_order",
      reason: "Extraction found purchase-order structure in a broad document upload.",
    };
  }

  if (factTypes.has("invoice_number") || /\b(factura|invoice|cfdi|folio fiscal)\b/i.test(text)) {
    return {
      documentType: "carrier_invoice",
      documentClass: "invoice",
      reason: "Extraction found invoice structure in a broad document upload.",
    };
  }

  if (
    factTypes.has("receiver_name") ||
    factTypes.has("qty_delivered") ||
    factTypes.has("qty_rejected") ||
    /\b(proof of delivery|pod|recibido|recib[ií]|firma|rechazo)\b/i.test(text)
  ) {
    return {
      documentType: "pod",
      documentClass: "proof_of_delivery",
      reason: "Extraction found proof-of-delivery or receipt structure in a broad document upload.",
    };
  }

  return null;
}

async function createRun(args: {
  request: DocumentExtractionRequest;
  decision: DocumentRoutingDecision;
  provider: ExtractionProviderName;
  isFallbackRun?: boolean;
  fallbackFromRunId?: string | null;
  attempt?: number;
}) {
  const database = requireDb();
  const [run] = await database
    .insert(documentExtractionRuns)
    .values({
      tenantId: args.request.tenantId,
      documentId: args.request.documentId,
      provider: args.provider,
      status: "processing",
      trigger: args.request.trigger ?? "workflow",
      strategy:
        args.provider === "openrouter_vision" ? "vision_extract" : args.decision.strategy,
      inputClass: args.decision.inputClass,
      attempt: args.attempt ?? 1,
      isFallbackRun: args.isFallbackRun ?? false,
      shouldFallbackToVision: args.decision.shouldFallbackToVision,
      fallbackFromRunId: args.fallbackFromRunId ?? null,
      routingDecision: args.decision.reasons.join(" "),
      startedAt: new Date(),
      metadata: buildExtractionRunMetadata({
        request: args.request,
        decision: args.decision,
        provider: args.provider,
      }),
    })
    .returning();

  await database
    .update(documents)
    .set({
      extractionStatus: "processing",
      updatedAt: new Date(),
    })
    .where(
      and(eq(documents.id, args.request.documentId), eq(documents.tenantId, args.request.tenantId)),
    );

  return run;
}

async function persistResult(args: {
  request: DocumentExtractionRequest;
  runId: string;
  provider: ExtractionProviderName;
  result: DocumentExtractionResult;
}) {
  const database = requireDb();
  const documentStatus = inferDocumentStatus(args.result);
  const confidenceOverall = normalizeConfidence(args.result.overallConfidence ?? null);
  const [[storedDocument], [storedRun]] = await Promise.all([
    database
      .select({
        documentType: documents.documentType,
        metadata: documents.metadata,
      })
      .from(documents)
      .where(
        and(
          eq(documents.id, args.request.documentId),
          eq(documents.tenantId, args.request.tenantId),
        ),
      )
      .limit(1),
    database
      .select({
        id: documentExtractionRuns.id,
        metadata: documentExtractionRuns.metadata,
      })
      .from(documentExtractionRuns)
      .where(
        and(
          eq(documentExtractionRuns.id, args.runId),
          eq(documentExtractionRuns.tenantId, args.request.tenantId),
          eq(documentExtractionRuns.documentId, args.request.documentId),
        ),
      )
      .limit(1),
  ]);

  if (!storedRun) {
    throw new Error("Extraction run was not found for the tenant-owned document.");
  }

  const executionMetadata = mergeExtractionResultMetadata({
    existingMetadata: storedRun.metadata,
    provider: args.provider,
    result: args.result,
  });

  if (args.result.artifacts.length > 0) {
    await database.insert(documentArtifacts).values(
      args.result.artifacts.map((artifact) => ({
        tenantId: args.request.tenantId,
        documentId: args.request.documentId,
        extractionRunId: args.runId,
        artifactType: artifact.artifactType,
        storageType: artifact.storageType,
        mimeType: artifact.mimeType ?? null,
        language: artifact.language ?? args.request.language ?? "es-MX",
        fileUrl: artifact.fileUrl ?? null,
        textContent: artifact.textContent ?? null,
        jsonContent: artifact.jsonContent ?? null,
        byteSize: artifact.byteSize ?? null,
        pageFrom: artifact.pageFrom ?? null,
        pageTo: artifact.pageTo ?? null,
        metadata: artifact.metadata ?? null,
      })),
    );
  }

  const [latestRawArtifact] = await database
    .select({
      id: documentArtifacts.id,
    })
    .from(documentArtifacts)
    .where(
      and(
        eq(documentArtifacts.extractionRunId, args.runId),
        eq(documentArtifacts.artifactType, "provider_raw"),
      ),
    )
    .orderBy(desc(documentArtifacts.createdAt))
    .limit(1);

  if (args.result.facts.length > 0) {
    await database.insert(extractedFacts).values(
      args.result.facts.map((fact) => ({
        tenantId: args.request.tenantId,
        documentId: args.request.documentId,
        extractionRunId: args.runId,
        sourceArtifactId: latestRawArtifact?.id ?? null,
        factType: coerceFactType(fact.factType),
        valueText: fact.valueText ?? null,
        valueNumber: fact.valueNumber != null ? fact.valueNumber.toFixed(3) : null,
        valueDate: fact.valueDate ?? null,
        confidence: fact.confidence.toFixed(4),
        sourceProvider: args.provider,
        sourceModel: args.result.model ?? null,
        metadata: fact.reasoning
          ? {
              reasoning: fact.reasoning,
            }
          : null,
      })),
    );
  }

  await database
    .update(documentExtractionRuns)
    .set({
      model: args.result.model ?? null,
      status: documentStatus,
      confidenceOverall,
      errorCode: args.result.errorCode ?? null,
      errorMessage: args.result.errorMessage ?? null,
      metadata: executionMetadata,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documentExtractionRuns.id, args.runId),
        eq(documentExtractionRuns.tenantId, args.request.tenantId),
        eq(documentExtractionRuns.documentId, args.request.documentId),
      ),
    );

  const reclassification = storedDocument
    ? inferDocumentReclassification({
        currentDocumentType: storedDocument.documentType,
        result: args.result,
      })
    : null;
  const existingMetadata =
    storedDocument?.metadata && typeof storedDocument.metadata === "object"
      ? storedDocument.metadata
      : {};
  const updatedMetadata = reclassification
    ? {
        ...existingMetadata,
        inferredDocumentClass: reclassification.documentClass,
        semanticReclassification: {
          documentType: reclassification.documentType,
          documentClass: reclassification.documentClass,
          reason: reclassification.reason,
          sourceRunId: args.runId,
          updatedAt: new Date().toISOString(),
        },
      }
    : existingMetadata;

  await database
    .update(documents)
    .set({
      documentType: reclassification?.documentType,
      extractionStatus: documentStatus,
      ocrText:
        args.result.artifacts.find((artifact) => artifact.artifactType === "ocr_text")?.textContent ??
        null,
      metadata: updatedMetadata,
      updatedAt: new Date(),
    })
    .where(
      and(eq(documents.id, args.request.documentId), eq(documents.tenantId, args.request.tenantId)),
    );
}

async function markRunFailed(args: {
  request: DocumentExtractionRequest;
  runId: string;
  error: Error;
}) {
  const database = requireDb();

  await database
    .update(documentExtractionRuns)
    .set({
      status: "failed",
      errorCode: "provider_error",
      errorMessage: args.error.message,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documentExtractionRuns.id, args.runId),
        eq(documentExtractionRuns.tenantId, args.request.tenantId),
        eq(documentExtractionRuns.documentId, args.request.documentId),
      ),
    );

  await database
    .update(documents)
    .set({
      extractionStatus: "failed",
      updatedAt: new Date(),
    })
    .where(
      and(eq(documents.id, args.request.documentId), eq(documents.tenantId, args.request.tenantId)),
    );
}

function needsVisionFallback(result: DocumentExtractionResult, decision: DocumentRoutingDecision) {
  if (!decision.shouldFallbackToVision || !decision.fallbackProvider) {
    return false;
  }

  if (result.status === "failed") {
    return true;
  }

  const overallConfidence = result.overallConfidence ?? 0;

  return result.needsReview || overallConfidence < decision.reviewThreshold;
}

export function previewDocumentRouting(request: DocumentExtractionRequest) {
  return decideDocumentRouting(request);
}

export function getDocumentRoutingReadiness(decision: DocumentRoutingDecision) {
  const doclingBaseUrl = getDoclingBaseUrl();
  const openRouterApiKey = getOpenRouterApiKey();
  const missingPrimaryConfig: string[] = [];
  const missingFallbackConfig: string[] = [];

  if (decision.primaryProvider === "docling" && !doclingBaseUrl) {
    missingPrimaryConfig.push("DOCLING_BASE_URL");
  }

  if (decision.primaryProvider === "openrouter_vision" && !openRouterApiKey) {
    missingPrimaryConfig.push("OPENROUTER_API_KEY");
  }

  if (decision.fallbackProvider === "openrouter_vision" && !openRouterApiKey) {
    missingFallbackConfig.push("OPENROUTER_API_KEY");
  }

  const primaryReady = missingPrimaryConfig.length === 0;
  const fallbackReady = missingFallbackConfig.length === 0;
  const degradedToFallback = !primaryReady && Boolean(decision.fallbackProvider && fallbackReady);
  const effectivePrimaryProvider = degradedToFallback
    ? decision.fallbackProvider ?? null
    : primaryReady
      ? decision.primaryProvider
      : null;

  return {
    primaryReady,
    fallbackReady,
    degradedToFallback,
    effectivePrimaryProvider,
    canProcess: primaryReady || degradedToFallback,
    missingPrimaryConfig,
    missingFallbackConfig,
  };
}

function getEffectiveRoutingDecision(decision: DocumentRoutingDecision) {
  const readiness = getDocumentRoutingReadiness(decision);

  if (readiness.primaryReady) {
    return {
      decision,
      degradedToFallback: false,
    };
  }

  if (decision.fallbackProvider && readiness.fallbackReady) {
    return {
      decision: {
        ...decision,
        primaryProvider: decision.fallbackProvider,
        fallbackProvider: undefined,
        strategy: "vision_extract" as const,
        shouldFallbackToVision: false,
        reasons: [
          ...decision.reasons,
          "Primary extraction provider is not configured, so the vision fallback is handling this document for the MVP.",
        ],
      },
      degradedToFallback: true,
    };
  }

  const missingConfig = [...readiness.missingPrimaryConfig, ...readiness.missingFallbackConfig];

  throw new Error(
    `Document extraction is not configured. Missing: ${missingConfig.join(", ") || "provider configuration"}.`,
  );
}

export async function hydrateStoredDocumentExtractionRequest(
  request: DocumentExtractionRequest,
) {
  if (request.fileUrl || request.fileDataUrl) {
    return request;
  }

  const storedDocument = await getStoredDocumentContext({
    tenantId: request.tenantId,
    documentId: request.documentId,
  });

  if (!storedDocument) {
    throw new Error("Document not found for extraction.");
  }

  if (!storedDocument.signedReadUrl) {
    throw new Error("Document does not have a retrievable stored file.");
  }

  const metadata =
    storedDocument.metadata && typeof storedDocument.metadata === "object"
      ? (storedDocument.metadata as Record<string, unknown>)
      : null;
  const storedIntakeContext =
    metadata?.intakeContext && typeof metadata.intakeContext === "object"
      ? (metadata.intakeContext as DocumentExtractionRequest["intakeContext"])
      : null;
  const storedInferredDocumentClass =
    typeof metadata?.inferredDocumentClass === "string"
      ? (metadata.inferredDocumentClass as DocumentExtractionRequest["inferredDocumentClass"])
      : null;

  return {
    ...request,
    fileUrl: storedDocument.signedReadUrl,
    documentType: request.documentType ?? storedDocument.documentType ?? null,
    mimeType: request.mimeType ?? storedDocument.mimeType ?? null,
    originalFileName: request.originalFileName ?? storedDocument.originalFileName ?? null,
    language: request.language ?? storedDocument.language ?? "es-MX",
    sourceChannel:
      request.sourceChannel ??
      (storedDocument.sourceChannel as DocumentExtractionRequest["sourceChannel"] | undefined) ??
      "upload",
    intakeContext: request.intakeContext ?? storedIntakeContext ?? null,
    inferredDocumentClass: request.inferredDocumentClass ?? storedInferredDocumentClass ?? null,
  };
}

export async function runDocumentExtraction(request: DocumentExtractionRequest) {
  const hydratedBaseRequest =
    await hydrateStoredDocumentExtractionRequest(request);
  const inferredDocumentClass =
    hydratedBaseRequest.inferredDocumentClass ??
    inferDocumentClass({
      documentType: hydratedBaseRequest.documentType ?? null,
      mimeType: hydratedBaseRequest.mimeType ?? null,
      originalFileName: hydratedBaseRequest.originalFileName ?? null,
      sourceChannel: hydratedBaseRequest.sourceChannel,
      intakeContext: hydratedBaseRequest.intakeContext ?? null,
    }).documentClass;
  const hydratedRequest = {
    ...hydratedBaseRequest,
    inferredDocumentClass,
  } satisfies DocumentExtractionRequest;
  const routingDecision = decideDocumentRouting(hydratedRequest);
  const effectiveRouting = getEffectiveRoutingDecision(routingDecision);
  const decision = effectiveRouting.decision;
  const primaryProvider = getProvider(decision.primaryProvider);
  const primaryRun = await createRun({
    request: hydratedRequest,
    decision,
    provider: decision.primaryProvider,
    isFallbackRun: effectiveRouting.degradedToFallback,
  });

  try {
    const primaryResult = await primaryProvider.extract({ request: hydratedRequest, decision });
    await persistResult({
      request: hydratedRequest,
      runId: primaryRun.id,
      provider: decision.primaryProvider,
      result: primaryResult,
    });

    if (!needsVisionFallback(primaryResult, decision) || !decision.fallbackProvider) {
      return {
        routing: routingDecision,
        executedRouting: decision,
        runId: primaryRun.id,
        provider: decision.primaryProvider,
        result: primaryResult,
        degradedToFallback: effectiveRouting.degradedToFallback,
      };
    }

    const fallbackProvider = getProvider(decision.fallbackProvider);
    const fallbackRun = await createRun({
      request: {
        ...hydratedRequest,
        forceVisionFallback: true,
      },
      decision,
      provider: decision.fallbackProvider,
      isFallbackRun: true,
      fallbackFromRunId: primaryRun.id,
      attempt: 2,
    });

    try {
      const fallbackResult = await fallbackProvider.extract({
        request: hydratedRequest,
        decision: {
          ...decision,
          primaryProvider: decision.fallbackProvider,
          strategy: "vision_extract",
          shouldFallbackToVision: false,
        },
      });

      await persistResult({
        request: hydratedRequest,
        runId: fallbackRun.id,
        provider: decision.fallbackProvider,
        result: fallbackResult,
      });

      return {
        routing: routingDecision,
        executedRouting: decision,
        runId: fallbackRun.id,
        provider: decision.fallbackProvider,
        result: fallbackResult,
        fallbackFromRunId: primaryRun.id,
        degradedToFallback: effectiveRouting.degradedToFallback,
      };
    } catch (error) {
      await markRunFailed({
        request: hydratedRequest,
        runId: fallbackRun.id,
        error: error instanceof Error ? error : new Error("Vision fallback extraction failed."),
      });

      return {
        routing: routingDecision,
        executedRouting: decision,
        runId: primaryRun.id,
        provider: decision.primaryProvider,
        result: {
          ...primaryResult,
          status: "needs_review",
          needsReview: true,
          metadata: {
            ...(primaryResult.metadata ?? {}),
            fallbackError: error instanceof Error ? error.message : "Vision fallback extraction failed.",
          },
        },
        fallbackFromRunId: primaryRun.id,
        fallbackAttemptFailed: true,
        degradedToFallback: effectiveRouting.degradedToFallback,
      };
    }
  } catch (error) {
    await markRunFailed({
      request: hydratedRequest,
      runId: primaryRun.id,
      error: error instanceof Error ? error : new Error("Unknown extraction failure."),
    });

    throw error;
  }
}
