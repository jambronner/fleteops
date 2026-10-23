import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { documents, intakeEvents, reviewTasks } from "@/lib/db/schema";
import {
  inferDocumentClass,
  mapSemanticClassToDocumentType,
} from "@/lib/documents/classification";
import { DocumentIntakeLimitError, persistIncomingDocument } from "@/lib/documents/intake";
import { fetchEvolutionMediaBase64 } from "@/lib/evolution/client";
import { DocumentScanRejectedError } from "@/lib/shared-services/scan";

/**
 * Turns a WhatsApp media message (photo, PDF, voice note) into a stored
 * document with extraction, exactly like an email attachment. Without this
 * step, WhatsApp media only exists as intake-event metadata and never counts
 * as delivery evidence.
 */

export type WhatsappMediaSource = {
  instanceName: string | null;
  messageKeyId: string | null;
};

type MediaMessage = {
  sourceProvider: string;
  externalMessageId: string;
  externalConversationId: string | null;
  conversationDisplayName: string | null;
  senderName: string | null;
  externalParticipantKey: string | null;
  textBody: string | null;
  messageType: string;
  sentAt: string | null;
  media: {
    kind: string;
    mimeType?: string;
    fileName?: string;
    caption?: string;
  };
  raw: Record<string, unknown>;
};

export type WhatsappMediaIntakeOutcome = {
  status: "created" | "skipped_duplicate" | "failed";
  documentId?: string;
  extractionQueued?: boolean;
  reason?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Recovers the Evolution instance and message key needed for the media
 * download. Prefers the raw webhook payload; falls back to parsing the
 * synthetic external id `evolution:<instance>:<messageKeyId>`.
 */
export function resolveWhatsappMediaSource(message: {
  externalMessageId: string;
  raw: Record<string, unknown>;
}): WhatsappMediaSource {
  const rawInstance = message.raw.instanceName;
  const data = asRecord(message.raw.data);
  const key = asRecord(data?.key);
  const rawKeyId = typeof key?.id === "string" && key.id.trim() ? key.id.trim() : null;
  const instanceFromRaw =
    typeof rawInstance === "string" && rawInstance.trim() ? rawInstance.trim() : null;

  if (instanceFromRaw && rawKeyId) {
    return { instanceName: instanceFromRaw, messageKeyId: rawKeyId };
  }

  const parts = message.externalMessageId.split(":");

  if (parts.length === 3 && parts[0] === "evolution" && parts[1] && parts[2]) {
    return {
      instanceName: instanceFromRaw ?? parts[1],
      messageKeyId: rawKeyId ?? parts[2],
    };
  }

  return { instanceName: instanceFromRaw, messageKeyId: rawKeyId };
}

function buildFallbackFileName(message: MediaMessage, mimeType: string | null) {
  const extensionByMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
  };
  const normalizedMime = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  const extension = extensionByMime[normalizedMime] ?? "bin";
  const stamp = (message.sentAt ?? "").replace(/[^0-9]/g, "").slice(0, 14) || "media";

  return `whatsapp-${message.media.kind || "media"}-${stamp}.${extension}`;
}

async function findExistingWhatsappMediaDocument(args: {
  tenantId: string;
  externalMessageId: string;
}) {
  if (!db) {
    return null;
  }

  const [existing] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, args.tenantId),
        sql`${documents.metadata}#>>'{provenance,externalMessageId}' = ${args.externalMessageId}`,
      ),
    )
    .limit(1);

  return existing ?? null;
}

async function createMediaFailureReviewTask(args: {
  tenantId: string;
  intakeEventId: string;
  message: MediaMessage;
  code: string;
  userMessage: string;
  details: Record<string, unknown>;
}) {
  if (!db) {
    return;
  }

  await db
    .update(intakeEvents)
    .set({ status: "needs_review", updatedAt: new Date() })
    .where(eq(intakeEvents.id, args.intakeEventId));

  await db.insert(reviewTasks).values({
    tenantId: args.tenantId,
    subjectType: "intake_event",
    subjectId: args.intakeEventId,
    status: "open",
    priority: args.code === "workspace_storage_quota_exceeded" ? "high" : "normal",
    title: "WhatsApp evidence could not be imported",
    details: args.userMessage,
    metadata: {
      reasonCode: args.code,
      sourceChannel: "whatsapp",
      media: {
        kind: args.message.media.kind,
        mimeType: args.message.media.mimeType ?? null,
        fileName: args.message.media.fileName ?? null,
      },
      whatsapp: {
        externalMessageId: args.message.externalMessageId,
        externalConversationId: args.message.externalConversationId,
        conversationDisplayName: args.message.conversationDisplayName,
        senderName: args.message.senderName,
      },
      details: args.details,
    },
  });
}

export async function persistWhatsappMediaDocument(args: {
  tenantId: string;
  intakeEventId: string;
  message: MediaMessage;
  classification: { classification: string; needsReview: boolean };
}): Promise<WhatsappMediaIntakeOutcome> {
  const { tenantId, intakeEventId, message } = args;

  const existing = await findExistingWhatsappMediaDocument({
    tenantId,
    externalMessageId: message.externalMessageId,
  });

  if (existing) {
    return { status: "skipped_duplicate", documentId: existing.id };
  }

  const source = resolveWhatsappMediaSource(message);

  if (!source.instanceName || !source.messageKeyId) {
    await createMediaFailureReviewTask({
      tenantId,
      intakeEventId,
      message,
      code: "media_source_unresolved",
      userMessage:
        "A WhatsApp media message arrived, but its download reference could not be resolved. Ask the sender to re-share the file or upload it manually.",
      details: { source },
    });

    return { status: "failed", reason: "media_source_unresolved" };
  }

  const download = await fetchEvolutionMediaBase64({
    instanceName: source.instanceName,
    messageKeyId: source.messageKeyId,
  });

  if (!download.ok || !download.base64) {
    await createMediaFailureReviewTask({
      tenantId,
      intakeEventId,
      message,
      code: "media_download_failed",
      userMessage:
        "A WhatsApp media message arrived, but the file could not be downloaded from the WhatsApp listener. Retry from the intake queue or upload it manually.",
      details: { error: download.error ?? null, attempted: download.attempted },
    });

    return { status: "failed", reason: download.error ?? "media_download_failed" };
  }

  const bytes = new Uint8Array(Buffer.from(download.base64, "base64"));
  const mimeType = message.media.mimeType ?? download.mimeType ?? null;
  const originalFileName =
    message.media.fileName ?? download.fileName ?? buildFallbackFileName(message, mimeType);
  const intakeContext = {
    textBody: message.textBody,
    messageCaption: message.media.caption ?? null,
    senderName: message.senderName,
    senderAddress: message.externalParticipantKey,
    attachmentNames: [originalFileName],
  };
  const inferredDocumentClass = inferDocumentClass({
    documentType: null,
    mimeType,
    originalFileName,
    sourceChannel: "whatsapp",
    intakeContext,
  }).documentClass;

  try {
    const storedDocument = await persistIncomingDocument({
      tenantId,
      documentType: mapSemanticClassToDocumentType({
        semanticClass: inferredDocumentClass,
        mimeType,
      }),
      sourceChannel: "whatsapp",
      trigger: "whatsapp_ingest",
      originalFileName,
      mimeType,
      bytes,
      language: "es-MX",
      intakeContext,
      inferredDocumentClass,
      metadata: {
        provenance: {
          sourceChannel: "whatsapp",
          provider: message.sourceProvider,
          intakeEventId,
          externalMessageId: message.externalMessageId,
          threadId: message.externalConversationId,
          conversationDisplayName: message.conversationDisplayName,
          senderLabel: message.senderName,
          senderAddress: message.externalParticipantKey,
          sentAt: message.sentAt,
        },
        whatsapp: {
          classification: args.classification.classification,
          needsReview: args.classification.needsReview,
          media: {
            kind: message.media.kind,
            mimeType: message.media.mimeType ?? null,
            fileName: message.media.fileName ?? null,
            caption: message.media.caption ?? null,
          },
        },
      },
    });

    return {
      status: "created",
      documentId: storedDocument.documentId,
      extractionQueued: storedDocument.extractionQueued,
    };
  } catch (error) {
    if (error instanceof DocumentIntakeLimitError) {
      await createMediaFailureReviewTask({
        tenantId,
        intakeEventId,
        message,
        code: error.code,
        userMessage: error.userMessage,
        details: error.details,
      });

      return { status: "failed", reason: error.code };
    }

    if (error instanceof DocumentScanRejectedError) {
      await createMediaFailureReviewTask({
        tenantId,
        intakeEventId,
        message,
        code: error.code,
        userMessage: error.userMessage,
        details: { requestId: error.requestId, signature: error.signature },
      });

      return { status: "failed", reason: error.code };
    }

    throw error;
  }
}
