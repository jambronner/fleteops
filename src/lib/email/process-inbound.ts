import { z } from "zod";
import { eq } from "drizzle-orm";

import { classifyInboundIntake } from "@/lib/ai/intake";
import { db } from "@/lib/db/client";
import { intakeEvents, reviewTasks } from "@/lib/db/schema";
import { DocumentIntakeLimitError, persistIncomingDocument } from "@/lib/documents/intake";
import { DocumentScanRejectedError } from "@/lib/shared-services/scan";
import { inferDocumentClass, mapSemanticClassToDocumentType } from "@/lib/documents/classification";
import { extractForwardedEmailOperationalBody } from "@/lib/email/forwarded";
import { normalizedInboundEmailMessageSchema } from "@/lib/email/inbound";
import { env, getEmailMaxAttachmentTotalBytes } from "@/lib/env";
import { maybeHandleRouteActionFromIntake } from "@/lib/intake/route-actions";
import { resolveInboundTenant } from "@/lib/intake/routing";

export const inboundEmailEventSchema = z.object({
  messages: z.array(normalizedInboundEmailMessageSchema),
});

export type InboundEmailEvent = z.infer<typeof inboundEmailEventSchema>;

function buildEmailThreadSnippet(message: InboundEmailEvent["messages"][number]) {
  const lines = [
    message.forwardedFromAddress || message.forwardedFromName
      ? `Forwarded from: ${[message.forwardedFromName, message.forwardedFromAddress].filter(Boolean).join(" ")}`
      : null,
    message.forwardedSubject ? `Forwarded subject: ${message.forwardedSubject}` : null,
    message.subject ? `Email subject: ${message.subject}` : null,
  ].filter((value): value is string => Boolean(value));

  return lines.length > 0 ? lines.join("\n") : null;
}

function formatMegabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function estimateAttachmentSizeBytes(attachment: InboundEmailEvent["messages"][number]["attachments"][number]) {
  if (typeof attachment.sizeBytes === "number") {
    return attachment.sizeBytes;
  }

  return Math.floor(Buffer.byteLength(attachment.contentBase64, "utf8") * 0.75);
}

function validateEmailAttachmentBatch(message: InboundEmailEvent["messages"][number]) {
  if (message.attachments.length > env.EMAIL_MAX_ATTACHMENTS_PER_MESSAGE) {
    return {
      code: "too_many_attachments",
      userMessage: `This email included ${message.attachments.length} attachments. The workspace accepts up to ${env.EMAIL_MAX_ATTACHMENTS_PER_MESSAGE} attachments per email right now.`,
      details: {
        attachmentCount: message.attachments.length,
        maxAttachments: env.EMAIL_MAX_ATTACHMENTS_PER_MESSAGE,
      },
    };
  }

  const totalBytes = message.attachments.reduce(
    (sum, attachment) => sum + estimateAttachmentSizeBytes(attachment),
    0,
  );
  const maxTotalBytes = getEmailMaxAttachmentTotalBytes();

  if (totalBytes > maxTotalBytes) {
    return {
      code: "email_attachments_too_large",
      userMessage: `This email included ${formatMegabytes(totalBytes)} of attachments, which is above the ${formatMegabytes(maxTotalBytes)} email intake limit.`,
      details: {
        totalBytes,
        maxTotalBytes,
      },
    };
  }

  return null;
}

async function createAttachmentRejectionReviewTask(args: {
  tenantId: string;
  intakeEventId: string;
  message: InboundEmailEvent["messages"][number];
  attachment?: InboundEmailEvent["messages"][number]["attachments"][number];
  code: string;
  userMessage: string;
  details: Record<string, unknown>;
}) {
  if (!db) {
    return;
  }

  await db.update(intakeEvents)
    .set({
      status: "needs_review",
      updatedAt: new Date(),
    })
    .where(eq(intakeEvents.id, args.intakeEventId));

  await db.insert(reviewTasks).values({
    tenantId: args.tenantId,
    subjectType: "intake_event",
    subjectId: args.intakeEventId,
    status: "open",
    priority: args.code === "workspace_storage_quota_exceeded" ? "high" : "normal",
    title: "Evidence file could not be imported",
    details: args.userMessage,
    metadata: {
      reasonCode: args.code,
      sourceChannel: "email",
      attachment: args.attachment
        ? {
            fileName: args.attachment.fileName,
            mimeType: args.attachment.mimeType ?? null,
            sizeBytes: estimateAttachmentSizeBytes(args.attachment),
          }
        : null,
      email: {
        subject: args.message.subject ?? null,
        fromAddress: args.message.fromAddress ?? null,
        fromName: args.message.fromName ?? null,
        recipientAddress: args.message.recipientAddress ?? null,
        messageId: args.message.messageId ?? args.message.externalMessageId,
        forwardedFromAddress: args.message.forwardedFromAddress ?? null,
        forwardedSubject: args.message.forwardedSubject ?? null,
      },
      details: args.details,
      notification: {
        autoEmailSent: false,
        recommendedChannel: "email",
        policy: "internal_review_first",
        rationale:
          "Outbound failure notices should be tenant-configurable before the app emails external senders automatically.",
      },
    },
  });
}

export async function processInboundEmailMessages(payload: InboundEmailEvent) {
  const classifiedMessages = await Promise.all(
    payload.messages.map(async (message) => {
      const externalConversationId = message.threadId ?? message.fromAddress ?? message.externalMessageId;
      const operationalTextBody =
        extractForwardedEmailOperationalBody(message.textBody) ?? message.textBody ?? message.htmlBody;

      const routing = await resolveInboundTenant({
        provider: message.provider,
        externalChannelId: message.inboxId,
        externalConversationId,
        externalParticipantKey: message.fromAddress,
        displayName: message.subject,
      });

      const classification = await classifyInboundIntake({
        locale: routing.tenantId ? "es-MX" : "en",
        subject: message.subject,
        textBody: operationalTextBody,
        attachmentNames: message.attachmentNames,
        senderAddress: message.fromAddress,
      });

      return {
        message,
        routing,
        classification,
        externalConversationId,
        operationalTextBody,
        threadSnippet: buildEmailThreadSnippet(message),
      };
    }),
  );

  if (!db || classifiedMessages.length === 0) {
    return {
      persisted: 0,
      needsClaim: classifiedMessages.filter((entry) => entry.routing.conversationStatus === "needs_claim").length,
      classified: classifiedMessages.length,
    };
  }

  const eventRows: (typeof intakeEvents.$inferInsert)[] = classifiedMessages.map((entry) => ({
    tenantId: entry.routing.tenantId,
    channelId: entry.routing.channel?.id ?? null,
    conversationId: entry.routing.conversation?.id ?? null,
    provider: entry.message.provider,
    status:
      entry.routing.conversationStatus === "needs_claim"
        ? "needs_review"
        : entry.classification.needsReview
          ? "needs_review"
          : "classified",
    classification: entry.classification.classification,
    externalEventId: entry.message.externalMessageId,
    externalConversationId: entry.externalConversationId,
    externalParticipantKey: entry.message.fromAddress ?? null,
    subject: entry.message.subject ?? null,
    messageText: entry.message.textBody ?? entry.message.htmlBody ?? null,
    routedAt: entry.routing.channel ? new Date() : null,
    classifiedAt: new Date(),
    rawPayload: entry.message.raw,
    metadata: {
      recipientAddress: entry.message.recipientAddress ?? null,
      fromName: entry.message.fromName ?? null,
      messageId: entry.message.messageId ?? null,
      sentAt: entry.message.sentAt ?? null,
      receivedAt: entry.message.receivedAt ?? null,
      forwarded: entry.message.forwardedFromAddress || entry.message.forwardedSubject || entry.message.forwardedFromName
        ? {
            fromAddress: entry.message.forwardedFromAddress ?? null,
            fromName: entry.message.forwardedFromName ?? null,
            subject: entry.message.forwardedSubject ?? null,
            sentAt: entry.message.forwardedSentAt ?? null,
          }
        : null,
      attachmentNames: entry.message.attachmentNames,
      routing: {
        tenantId: entry.routing.tenantId,
        channelId: entry.routing.channel?.id ?? null,
        conversationId: entry.routing.conversation?.id ?? null,
        conversationStatus: entry.routing.conversationStatus,
        externalConversationId: entry.externalConversationId,
      },
      classification: entry.classification,
    },
  }));

  const insertedEvents = await db
    .insert(intakeEvents)
    .values(eventRows)
    .onConflictDoNothing({
      target: [intakeEvents.provider, intakeEvents.externalEventId],
    })
    .returning({
      id: intakeEvents.id,
      externalEventId: intakeEvents.externalEventId,
    });

  const intakeEventIds = new Map(insertedEvents.map((event) => [event.externalEventId, event.id]));
  let evidenceCreated = 0;
  let evidenceQueued = 0;
  let routeDraftsCreated = 0;
  let routeDraftsUpdated = 0;
  let routeUpdatesApplied = 0;
  let routeActionsNeedingReview = 0;
  let evidenceRejected = 0;

  for (const entry of classifiedMessages) {
    const intakeEventId = intakeEventIds.get(entry.message.externalMessageId);

    if (
      !intakeEventId ||
      !entry.routing.tenantId ||
      (entry.classification.action === "create_route" && entry.message.attachments.length > 0)
    ) {
      continue;
    }

    const routeAction = await maybeHandleRouteActionFromIntake({
      tenantId: entry.routing.tenantId,
      intakeEventId,
      externalEventId: entry.message.externalMessageId,
      externalConversationId: entry.externalConversationId,
      sourceChannel: "email",
      subject: entry.message.subject ?? null,
      messageText: entry.operationalTextBody ?? null,
      senderName: entry.message.fromName ?? null,
      senderAddress: entry.message.fromAddress ?? null,
      receivedAt: entry.message.receivedAt ?? null,
      classification: entry.classification,
    });

    if (routeAction?.action === "created") {
      routeDraftsCreated += 1;
    } else if (routeAction?.action === "updated") {
      if (entry.classification.action === "update_route") {
        routeUpdatesApplied += 1;
      } else {
        routeDraftsUpdated += 1;
      }
    } else if (routeAction?.action === "needs_review") {
      routeActionsNeedingReview += 1;
    }
  }

  for (const entry of classifiedMessages) {
    if (
      !intakeEventIds.has(entry.message.externalMessageId) ||
      !entry.routing.tenantId ||
      entry.message.attachments.length === 0
    ) {
      continue;
    }

    const intakeEventId = intakeEventIds.get(entry.message.externalMessageId);

    if (!intakeEventId) {
      continue;
    }

    const batchLimitError = validateEmailAttachmentBatch(entry.message);

    if (batchLimitError) {
      await createAttachmentRejectionReviewTask({
        tenantId: entry.routing.tenantId,
        intakeEventId,
        message: entry.message,
        code: batchLimitError.code,
        userMessage: batchLimitError.userMessage,
        details: batchLimitError.details,
      });
      evidenceRejected += entry.message.attachments.length;
      continue;
    }

    const intakeContext = {
      subject: entry.message.subject ?? null,
      textBody: entry.operationalTextBody ?? null,
      senderName: entry.message.fromName ?? null,
      senderAddress: entry.message.fromAddress ?? null,
      attachmentNames: entry.message.attachmentNames,
      threadSnippet: entry.threadSnippet,
    };

    for (const attachment of entry.message.attachments) {
      const bytes = new Uint8Array(Buffer.from(attachment.contentBase64, "base64"));
      const inferredDocumentClass = inferDocumentClass({
        documentType: null,
        mimeType: attachment.mimeType ?? null,
        originalFileName: attachment.fileName,
        sourceChannel: "email",
        intakeContext,
      }).documentClass;

      try {
        const storedDocument = await persistIncomingDocument({
          tenantId: entry.routing.tenantId,
          documentType: mapSemanticClassToDocumentType({
            semanticClass: inferredDocumentClass,
            mimeType: attachment.mimeType ?? null,
          }),
          sourceChannel: "email",
          trigger: "email_ingest",
          originalFileName: attachment.fileName,
          mimeType: attachment.mimeType ?? null,
          bytes,
          language: "es-MX",
          intakeContext,
          inferredDocumentClass,
          metadata: {
            provenance: {
              sourceChannel: "email",
              provider: entry.message.provider,
              intakeEventId,
              inboxId: entry.message.inboxId,
              recipientAddress: entry.message.recipientAddress ?? null,
              threadId: entry.message.threadId ?? null,
              messageId: entry.message.messageId ?? entry.message.externalMessageId,
              fromAddress: entry.message.fromAddress ?? null,
              fromName: entry.message.fromName ?? null,
              subject: entry.message.subject ?? null,
              sentAt: entry.message.sentAt ?? null,
              receivedAt: entry.message.receivedAt ?? null,
              forwarded: entry.message.forwardedFromAddress || entry.message.forwardedSubject || entry.message.forwardedFromName
                ? {
                    fromAddress: entry.message.forwardedFromAddress ?? null,
                    fromName: entry.message.forwardedFromName ?? null,
                    subject: entry.message.forwardedSubject ?? null,
                    sentAt: entry.message.forwardedSentAt ?? null,
                  }
                : null,
            },
            email: {
              classification: entry.classification.classification,
              needsReview: entry.classification.needsReview,
              attachment: {
                fileName: attachment.fileName,
                mimeType: attachment.mimeType ?? null,
                sizeBytes: attachment.sizeBytes ?? null,
                contentId: attachment.contentId ?? null,
                disposition: attachment.disposition ?? null,
              },
            },
          },
        });

        evidenceCreated += 1;
        if (storedDocument.extractionQueued) {
          evidenceQueued += 1;
        }
      } catch (error) {
        if (error instanceof DocumentIntakeLimitError) {
          await createAttachmentRejectionReviewTask({
            tenantId: entry.routing.tenantId,
            intakeEventId,
            message: entry.message,
            attachment,
            code: error.code,
            userMessage: error.userMessage,
            details: error.details,
          });
          evidenceRejected += 1;
          continue;
        }

        // A scanned-unsafe attachment is quarantined as a review task, never
        // linked as evidence and never silently dropped.
        if (error instanceof DocumentScanRejectedError) {
          await createAttachmentRejectionReviewTask({
            tenantId: entry.routing.tenantId,
            intakeEventId,
            message: entry.message,
            attachment,
            code: error.code,
            userMessage: error.userMessage,
            details: { requestId: error.requestId, signature: error.signature },
          });
          evidenceRejected += 1;
          continue;
        }

        throw error;
      }
    }
  }

  return {
    persisted: insertedEvents.length,
    duplicatesSkipped: classifiedMessages.length - insertedEvents.length,
    needsClaim: classifiedMessages.filter((entry) => entry.routing.conversationStatus === "needs_claim").length,
    classified: classifiedMessages.length,
    routeDraftsCreated,
    routeDraftsUpdated,
    routeUpdatesApplied,
    routeActionsNeedingReview,
    evidenceCreated,
    evidenceQueued,
    evidenceRejected,
  };
}
