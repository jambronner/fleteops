import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { documentArtifacts, documentExtractionRuns, documents, extractedFacts } from "@/lib/db/schema";
import { buildReusedExtractionMetadata } from "@/lib/documents/extraction-provenance";
import { getDocumentRoutingReadiness, previewDocumentRouting, runDocumentExtraction } from "@/lib/documents/service";
import type { DocumentExtractionRequest, DocumentIntakeContext, DocumentSemanticClass } from "@/lib/documents/types";
import { env, getDocumentMaxFileSizeBytes, getTenantStorageQuotaBytes } from "@/lib/env";
import { assertDocumentContentSafe } from "@/lib/shared-services/scan";
import { getStorageDriver } from "@/lib/storage";
import { buildContentAddressedDocumentObjectKey, buildStoredObjectRoutePath } from "@/lib/storage/object-keys";
import type { StorageDriverName, StoredObjectRef } from "@/lib/storage/types";
import { inngest } from "@/inngest/client";

type PersistDocumentArgs = {
  tenantId: string;
  documentType: typeof documents.$inferInsert.documentType;
  sourceChannel: DocumentExtractionRequest["sourceChannel"];
  trigger: DocumentExtractionRequest["trigger"];
  originalFileName: string;
  mimeType?: string | null;
  bytes: Uint8Array;
  language?: string | null;
  issuingOrgId?: string | null;
  receivingOrgId?: string | null;
  autoExtract?: boolean;
  metadata?: Record<string, unknown>;
  intakeContext?: DocumentIntakeContext | null;
  inferredDocumentClass?: DocumentSemanticClass | null;
};

function requireDb() {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  return db;
}

function buildInlineFileDataUrl(args: { mimeType?: string | null; bytes: Uint8Array }) {
  const mimeType = args.mimeType || "application/octet-stream";
  const base64 = Buffer.from(args.bytes).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

function buildSha256Digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export class DocumentIntakeLimitError extends Error {
  code: "file_too_large" | "workspace_storage_quota_exceeded";
  userMessage: string;
  details: Record<string, unknown>;
  statusCode: number;

  constructor(args: {
    code: DocumentIntakeLimitError["code"];
    message: string;
    userMessage: string;
    details: Record<string, unknown>;
    statusCode?: number;
  }) {
    super(args.message);
    this.name = "DocumentIntakeLimitError";
    this.code = args.code;
    this.userMessage = args.userMessage;
    this.details = args.details;
    this.statusCode = args.statusCode ?? 413;
  }
}

function formatMegabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function getStoredObjectSize(metadata: Record<string, unknown> | null | undefined) {
  const storage = metadata?.storage;

  if (!storage || typeof storage !== "object") {
    return null;
  }

  const size = (storage as Record<string, unknown>).size;

  if (typeof size === "number" && Number.isFinite(size)) {
    return size;
  }

  if (typeof size === "string") {
    const parsed = Number(size);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

async function getUniqueStoredBytesForTenant(tenantId: string) {
  const database = requireDb();
  const rows = await database
    .select({ metadata: documents.metadata })
    .from(documents)
    .where(eq(documents.tenantId, tenantId));
  const sizeByStorageKey = new Map<string, number>();

  for (const row of rows) {
    const storage = getStoredObjectRef(row.metadata ?? null);
    const size = getStoredObjectSize(row.metadata ?? null);

    if (!storage?.key || !size) {
      continue;
    }

    sizeByStorageKey.set(storage.key, Math.max(sizeByStorageKey.get(storage.key) ?? 0, size));
  }

  return [...sizeByStorageKey.values()].reduce((sum, size) => sum + size, 0);
}

async function assertDocumentWithinIntakeLimits(args: {
  tenantId: string;
  fileName: string;
  sizeBytes: number;
  willStoreNewObject: boolean;
}) {
  const maxFileSizeBytes = getDocumentMaxFileSizeBytes();

  if (args.sizeBytes > maxFileSizeBytes) {
    throw new DocumentIntakeLimitError({
      code: "file_too_large",
      message: `Document ${args.fileName} is too large for intake.`,
      userMessage: `The file "${args.fileName}" is ${formatMegabytes(args.sizeBytes)}, which is larger than the ${formatMegabytes(maxFileSizeBytes)} limit.`,
      details: {
        fileName: args.fileName,
        sizeBytes: args.sizeBytes,
        maxFileSizeBytes,
      },
    });
  }

  if (!args.willStoreNewObject) {
    return;
  }

  const quotaBytes = getTenantStorageQuotaBytes();
  const currentBytes = await getUniqueStoredBytesForTenant(args.tenantId);

  if (currentBytes + args.sizeBytes > quotaBytes) {
    throw new DocumentIntakeLimitError({
      code: "workspace_storage_quota_exceeded",
      message: `Workspace storage quota exceeded for document ${args.fileName}.`,
      userMessage: `This workspace has ${formatMegabytes(currentBytes)} stored and the file "${args.fileName}" would exceed the ${formatMegabytes(quotaBytes)} storage limit.`,
      details: {
        fileName: args.fileName,
        sizeBytes: args.sizeBytes,
        currentBytes,
        quotaBytes,
      },
    });
  }
}

function getStoredObjectRef(metadata: Record<string, unknown> | null | undefined) {
  const storage = metadata?.storage;

  if (!storage || typeof storage !== "object") {
    return null;
  }

  const maybeStorage = storage as Partial<StoredObjectRef> & Record<string, unknown>;

  if (
    (maybeStorage.driver !== "local" && maybeStorage.driver !== "s3") ||
    typeof maybeStorage.key !== "string"
  ) {
    return null;
  }

  return maybeStorage as StoredObjectRef & Record<string, unknown>;
}

async function findReusableStoredObject(args: {
  tenantId: string;
  sha256: string;
  driverName: StorageDriverName;
}) {
  const database = requireDb();
  const [existingDocument] = await database
    .select({
      id: documents.id,
      documentType: documents.documentType,
      extractionStatus: documents.extractionStatus,
      fileUrl: documents.fileUrl,
      ocrText: documents.ocrText,
      metadata: documents.metadata,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, args.tenantId),
        sql`${documents.metadata}#>>'{storage,sha256}' = ${args.sha256}`,
        sql`${documents.metadata}#>>'{storage,driver}' = ${args.driverName}`,
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(1);

  const storage = getStoredObjectRef(existingDocument?.metadata);

  if (!existingDocument || !storage) {
    return null;
  }

  return {
    documentId: existingDocument.id,
    documentType: existingDocument.documentType,
    extractionStatus: existingDocument.extractionStatus,
    fileUrl: existingDocument.fileUrl,
    ocrText: existingDocument.ocrText,
    storage,
  };
}

async function copyReusableExtraction(args: {
  tenantId: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  targetMetadata: Record<string, unknown>;
}) {
  const database = requireDb();
  const [sourceDocument] = await database
    .select({
      documentType: documents.documentType,
      extractionStatus: documents.extractionStatus,
      ocrText: documents.ocrText,
    })
    .from(documents)
    .where(and(eq(documents.id, args.sourceDocumentId), eq(documents.tenantId, args.tenantId)))
    .limit(1);

  if (
    !sourceDocument ||
    (sourceDocument.extractionStatus !== "completed" && sourceDocument.extractionStatus !== "needs_review")
  ) {
    return null;
  }

  const [sourceRun] = await database
    .select()
    .from(documentExtractionRuns)
    .where(
      and(
        eq(documentExtractionRuns.tenantId, args.tenantId),
        eq(documentExtractionRuns.documentId, args.sourceDocumentId),
        sql`${documentExtractionRuns.status} in ('completed', 'needs_review')`,
      ),
    )
    .orderBy(desc(documentExtractionRuns.createdAt))
    .limit(1);

  if (!sourceRun) {
    return null;
  }

  const copiedAt = new Date().toISOString();
  const [copiedRun] = await database
    .insert(documentExtractionRuns)
    .values({
      tenantId: args.tenantId,
      documentId: args.targetDocumentId,
      provider: sourceRun.provider,
      model: sourceRun.model,
      status: sourceRun.status,
      trigger: "workflow",
      strategy: sourceRun.strategy,
      inputClass: sourceRun.inputClass,
      attempt: 1,
      isFallbackRun: sourceRun.isFallbackRun,
      shouldFallbackToVision: false,
      confidenceOverall: sourceRun.confidenceOverall,
      routingDecision: sourceRun.routingDecision,
      errorCode: sourceRun.errorCode,
      errorMessage: sourceRun.errorMessage,
      startedAt: sourceRun.startedAt,
      completedAt: sourceRun.completedAt,
      metadata: buildReusedExtractionMetadata({
        sourceMetadata: sourceRun.metadata,
        sourceDocumentId: args.sourceDocumentId,
        sourceRunId: sourceRun.id,
        sourceFallbackFromRunId: sourceRun.fallbackFromRunId,
        copiedAt,
      }),
    })
    .returning({ id: documentExtractionRuns.id });

  const sourceArtifacts = await database
    .select()
    .from(documentArtifacts)
    .where(
      and(
        eq(documentArtifacts.tenantId, args.tenantId),
        eq(documentArtifacts.documentId, args.sourceDocumentId),
        eq(documentArtifacts.extractionRunId, sourceRun.id),
      ),
    )
    .orderBy(documentArtifacts.createdAt);

  const copiedArtifactIdBySource = new Map<string, string>();
  if (sourceArtifacts.length > 0) {
    const copiedArtifacts = await database.insert(documentArtifacts).values(
      sourceArtifacts.map((artifact) => ({
        tenantId: args.tenantId,
        documentId: args.targetDocumentId,
        extractionRunId: copiedRun.id,
        artifactType: artifact.artifactType,
        storageType: artifact.storageType,
        mimeType: artifact.mimeType,
        language: artifact.language,
        fileUrl: artifact.fileUrl,
        textContent: artifact.textContent,
        jsonContent: artifact.jsonContent,
        byteSize: artifact.byteSize,
        pageFrom: artifact.pageFrom,
        pageTo: artifact.pageTo,
        metadata: {
          ...(artifact.metadata ?? {}),
          copiedFromArtifactId: artifact.id,
        },
      })),
    ).returning({
      id: documentArtifacts.id,
      metadata: documentArtifacts.metadata,
    });

    for (const copiedArtifact of copiedArtifacts) {
      const copiedFromArtifactId =
        copiedArtifact.metadata &&
        typeof copiedArtifact.metadata.copiedFromArtifactId === "string"
          ? copiedArtifact.metadata.copiedFromArtifactId
          : null;

      if (copiedFromArtifactId) {
        copiedArtifactIdBySource.set(copiedFromArtifactId, copiedArtifact.id);
      }
    }
  }

  const sourceFacts = await database
    .select()
    .from(extractedFacts)
    .where(
      and(
        eq(extractedFacts.tenantId, args.tenantId),
        eq(extractedFacts.documentId, args.sourceDocumentId),
        eq(extractedFacts.extractionRunId, sourceRun.id),
      ),
    );

  if (sourceFacts.length > 0) {
    await database.insert(extractedFacts).values(
      sourceFacts.map((fact) => ({
        tenantId: args.tenantId,
        documentId: args.targetDocumentId,
        extractionRunId: copiedRun.id,
        sourceArtifactId: fact.sourceArtifactId
          ? copiedArtifactIdBySource.get(fact.sourceArtifactId) ?? null
          : null,
        factType: fact.factType,
        valueText: fact.valueText,
        valueNumber: fact.valueNumber,
        valueDate: fact.valueDate,
        confidence: fact.confidence,
        sourceProvider: fact.sourceProvider,
        sourceModel: fact.sourceModel,
        metadata: {
          ...(fact.metadata ?? {}),
          copiedFromFactId: fact.id,
          copiedFromDocumentId: args.sourceDocumentId,
          copiedFromArtifactId: fact.sourceArtifactId,
        },
      })),
    );
  }

  await database
    .update(documents)
    .set({
      documentType: sourceDocument.documentType,
      extractionStatus: sourceDocument.extractionStatus,
      ocrText: sourceDocument.ocrText,
      metadata: {
        ...args.targetMetadata,
        extractionReuse: {
          sourceDocumentId: args.sourceDocumentId,
          sourceRunId: sourceRun.id,
          copiedRunId: copiedRun.id,
          copiedAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, args.targetDocumentId), eq(documents.tenantId, args.tenantId)));

  return {
    sourceDocumentId: args.sourceDocumentId,
    sourceRunId: sourceRun.id,
    copiedRunId: copiedRun.id,
    status: sourceDocument.extractionStatus,
  };
}

async function markDocumentExtractionFailed(args: {
  documentId: string;
  errorMessage: string;
  metadata: Record<string, unknown>;
}) {
  const database = requireDb();

  await database
    .update(documents)
    .set({
      extractionStatus: "failed",
      metadata: {
        ...args.metadata,
        extraction: {
          status: "failed",
          errorMessage: args.errorMessage,
          failedAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(documents.id, args.documentId));
}

export async function persistIncomingDocument(args: PersistDocumentArgs) {
  const database = requireDb();
  const documentId = randomUUID();

  // Fail closed: nothing infected is ever stored or linked as evidence. No-op
  // unless a scan gateway is configured (or required) for this environment.
  const scanResult = await assertDocumentContentSafe({
    bytes: args.bytes,
    fileName: args.originalFileName,
    mimeType: args.mimeType,
  });

  const storageDriver = await getStorageDriver();
  const contentHash = buildSha256Digest(args.bytes);
  const reusableStoredObject = await findReusableStoredObject({
    tenantId: args.tenantId,
    sha256: contentHash,
    driverName: storageDriver.name,
  });

  await assertDocumentWithinIntakeLimits({
    tenantId: args.tenantId,
    fileName: args.originalFileName,
    sizeBytes: args.bytes.byteLength,
    willStoreNewObject: !reusableStoredObject,
  });

  const storedObject = reusableStoredObject
    ? reusableStoredObject.storage
    : await storageDriver.putObject({
        key: buildContentAddressedDocumentObjectKey({
          tenantId: args.tenantId,
          sha256: contentHash,
          originalFileName: args.originalFileName,
        }),
        body: args.bytes,
        contentType: args.mimeType ?? null,
        originalFileName: args.originalFileName,
      });
  const storageMetadata = {
    ...storedObject,
    sha256: contentHash,
    hashAlgorithm: "sha256",
    canonicalDocumentId:
      typeof (storedObject as Record<string, unknown>).canonicalDocumentId === "string"
        ? ((storedObject as Record<string, unknown>).canonicalDocumentId as string)
        : reusableStoredObject?.documentId ?? documentId,
    reusedStoredObject: Boolean(reusableStoredObject),
    reusedFromDocumentId: reusableStoredObject?.documentId ?? null,
    reusedAt: reusableStoredObject ? new Date().toISOString() : null,
  };
  const stableFilePath = buildStoredObjectRoutePath(storedObject.key);
  const documentMetadata = {
    ...(args.metadata ?? {}),
    storage: storageMetadata,
    intakeContext: args.intakeContext ?? null,
    inferredDocumentClass: args.inferredDocumentClass ?? null,
    scan: {
      outcome: scanResult.outcome,
      requestId: scanResult.requestId,
      scannedAt: new Date().toISOString(),
    },
  } satisfies Record<string, unknown>;

  await database.insert(documents).values({
    id: documentId,
    tenantId: args.tenantId,
    documentType: args.documentType,
    sourceChannel: (args.sourceChannel ?? "upload") as typeof documents.$inferInsert.sourceChannel,
    issuingOrgId: args.issuingOrgId ?? null,
    receivingOrgId: args.receivingOrgId ?? null,
    fileUrl: stableFilePath,
    originalFileName: args.originalFileName,
    mimeType: args.mimeType ?? null,
    language: args.language ?? "es-MX",
    extractionStatus: args.autoExtract === false ? "needs_review" : "pending",
    metadata: documentMetadata,
  });

  const signedReadUrl = await storageDriver.createSignedReadUrl({
    key: storedObject.key,
    fileName: args.originalFileName,
  });
  const extractionRequest = {
    tenantId: args.tenantId,
    documentId,
    documentType: args.documentType,
    mimeType: args.mimeType ?? null,
    originalFileName: args.originalFileName,
    language: args.language ?? "es-MX",
    sourceChannel: args.sourceChannel ?? "upload",
    trigger: args.trigger ?? "workflow",
    intakeContext: args.intakeContext ?? null,
    inferredDocumentClass: args.inferredDocumentClass ?? null,
  } satisfies DocumentExtractionRequest;
  const routing = previewDocumentRouting(extractionRequest);
  const readiness = getDocumentRoutingReadiness(routing);
  const shouldExtract = args.autoExtract !== false;
  const extractionQueued = shouldExtract && readiness.canProcess && Boolean(env.INNGEST_EVENT_KEY);
  const extractionProcessed = shouldExtract && readiness.canProcess && !env.INNGEST_EVENT_KEY;
  const reusedExtraction = reusableStoredObject && shouldExtract
    ? await copyReusableExtraction({
        tenantId: args.tenantId,
        sourceDocumentId: reusableStoredObject.documentId,
        targetDocumentId: documentId,
        targetMetadata: documentMetadata,
      })
    : null;
  let extraction: Awaited<ReturnType<typeof runDocumentExtraction>> | null = null;
  let extractionError: string | null = null;

  if (shouldExtract && !reusedExtraction && !readiness.canProcess) {
    extractionError = `Document extraction is not configured. Missing: ${
      [...readiness.missingPrimaryConfig, ...readiness.missingFallbackConfig].join(", ") || "provider configuration"
    }.`;

    await markDocumentExtractionFailed({
      documentId,
      errorMessage: extractionError,
      metadata: documentMetadata,
    });
  }

  if (extractionQueued && !reusedExtraction) {
    await inngest.send({
      name: "document/extraction.requested",
      data: extractionRequest,
    });
  }

  if (extractionProcessed && !reusedExtraction) {
    try {
      extraction = await runDocumentExtraction({
        ...extractionRequest,
        fileDataUrl: buildInlineFileDataUrl({
          mimeType: args.mimeType ?? null,
          bytes: args.bytes,
        }),
      });
    } catch (error) {
      extractionError = error instanceof Error ? error.message : "Document extraction failed.";
      await markDocumentExtractionFailed({
        documentId,
        errorMessage: extractionError,
        metadata: documentMetadata,
      });
    }
  }

  return {
    documentId,
    extractionQueued: Boolean(extractionQueued && !reusedExtraction),
    extractionReused: reusedExtraction,
    extractionProcessed: Boolean(extraction || reusedExtraction),
    extractionError,
    extraction,
    routing,
    readiness,
    signedReadUrl,
    reusedStoredObject: Boolean(reusableStoredObject),
    metadata: documentMetadata,
    file: {
      name: args.originalFileName,
      size: args.bytes.byteLength,
      mimeType: args.mimeType ?? null,
    },
  };
}
