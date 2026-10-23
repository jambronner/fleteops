import { createHash } from "node:crypto";

import PostalMime, { type Address } from "postal-mime";
import { z } from "zod";

import { extractForwardedEmailMetadata } from "@/lib/email/forwarded";
import type { NormalizedInboundEmailMessage } from "@/lib/email/inbound";

const inboundEmailRoutingPayloadSchema = z.object({
  source: z.literal("cloudflare_email_worker"),
  message: z.object({
    inboxId: z.string().min(1),
    recipientAddress: z.string().min(1).optional(),
    envelopeFrom: z.string().min(1).optional(),
    envelopeTo: z.string().min(1).optional(),
    rawEmail: z.string().min(1),
    rawSize: z.number().int().nonnegative().optional(),
    receivedAt: z.string().datetime().optional(),
  }),
});

function normalizeEmailAddress(value?: string | null) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || undefined;
}

function extractMailboxAddress(value?: Address | Address[] | null) {
  if (!value) {
    return undefined;
  }

  const entries = Array.isArray(value) ? value : [value];

  for (const entry of entries) {
    if ("address" in entry && entry.address) {
      return normalizeEmailAddress(entry.address);
    }

    if ("group" in entry && entry.group) {
      for (const mailbox of entry.group) {
        if (mailbox.address) {
          return normalizeEmailAddress(mailbox.address);
        }
      }
    }
  }

  return undefined;
}

function extractMailboxName(value?: Address | Address[] | null) {
  if (!value) {
    return undefined;
  }

  const entries = Array.isArray(value) ? value : [value];

  for (const entry of entries) {
    if ("name" in entry && entry.name?.trim()) {
      return entry.name.trim();
    }

    if ("group" in entry && entry.group) {
      for (const mailbox of entry.group) {
        if (mailbox.name?.trim()) {
          return mailbox.name.trim();
        }
      }
    }
  }

  return undefined;
}

function pickThreadId(args: {
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
}) {
  const inReplyTo = args.inReplyTo?.trim();

  if (inReplyTo) {
    return inReplyTo;
  }

  const referenceChain = args.references
    ?.split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (referenceChain && referenceChain.length > 0) {
    return referenceChain[referenceChain.length - 1];
  }

  const messageId = args.messageId?.trim();
  return messageId || undefined;
}

function buildExternalMessageId(rawEmail: string, messageId?: string) {
  const stableMessageId = messageId?.trim();

  if (stableMessageId) {
    return stableMessageId;
  }

  return createHash("sha256").update(rawEmail).digest("hex");
}

function encodeAttachmentContent(content: ArrayBuffer | Uint8Array | string, encoding?: "base64" | "utf8") {
  if (typeof content === "string") {
    return encoding === "base64" ? content : Buffer.from(content, "utf8").toString("base64");
  }

  return Buffer.from(content instanceof Uint8Array ? content : new Uint8Array(content)).toString("base64");
}

export async function normalizeEmailRoutingPayload(payload: unknown): Promise<NormalizedInboundEmailMessage[]> {
  const parsedPayload = inboundEmailRoutingPayloadSchema.parse(payload);
  const parsedEmail = await PostalMime.parse(parsedPayload.message.rawEmail);

  const recipientAddress =
    normalizeEmailAddress(parsedPayload.message.recipientAddress) ??
    normalizeEmailAddress(parsedPayload.message.envelopeTo) ??
    extractMailboxAddress(parsedEmail.to);
  const fromAddress =
    extractMailboxAddress(parsedEmail.from) ??
    extractMailboxAddress(parsedEmail.sender) ??
    normalizeEmailAddress(parsedPayload.message.envelopeFrom);
  const threadId = pickThreadId({
    messageId: parsedEmail.messageId,
    inReplyTo: parsedEmail.inReplyTo,
    references: parsedEmail.references,
  });
  const forwarded = extractForwardedEmailMetadata({
    subject: parsedEmail.subject,
    textBody: parsedEmail.text,
  });

  return [
    {
      provider: "email_routing",
      externalMessageId: buildExternalMessageId(parsedPayload.message.rawEmail, parsedEmail.messageId),
      inboxId: normalizeEmailAddress(parsedPayload.message.inboxId) ?? "email-routing-unbound-inbox",
      recipientAddress,
      threadId,
      fromAddress,
      fromName: extractMailboxName(parsedEmail.from) ?? extractMailboxName(parsedEmail.sender),
      messageId: parsedEmail.messageId?.trim() || undefined,
      subject: parsedEmail.subject,
      textBody: parsedEmail.text ?? undefined,
      htmlBody: parsedEmail.html ?? undefined,
      sentAt: parsedEmail.date ?? undefined,
      receivedAt: parsedPayload.message.receivedAt ?? undefined,
      forwardedFromAddress: forwarded?.fromAddress ?? undefined,
      forwardedFromName: forwarded?.fromName ?? undefined,
      forwardedSubject: forwarded?.subject ?? undefined,
      forwardedSentAt: forwarded?.sentAt ?? undefined,
      attachments: parsedEmail.attachments
        .filter((attachment) => Boolean(attachment.filename))
        .map((attachment) => ({
          fileName: attachment.filename?.trim() || "attachment",
          mimeType: attachment.mimeType || undefined,
          sizeBytes:
            typeof attachment.content === "string"
              ? Buffer.byteLength(attachment.content)
              : attachment.content instanceof Uint8Array
                ? attachment.content.byteLength
                : attachment.content.byteLength,
          contentBase64: encodeAttachmentContent(attachment.content, attachment.encoding),
          contentId: attachment.contentId ?? null,
          disposition: attachment.disposition,
        })),
      attachmentNames: parsedEmail.attachments
        .map((attachment) => attachment.filename?.trim())
        .filter((value): value is string => Boolean(value)),
      raw: {
        source: parsedPayload.source,
        envelopeFrom: parsedPayload.message.envelopeFrom ?? null,
        envelopeTo: parsedPayload.message.envelopeTo ?? null,
        rawSize: parsedPayload.message.rawSize ?? parsedPayload.message.rawEmail.length,
        receivedAt: parsedPayload.message.receivedAt ?? null,
        messageId: parsedEmail.messageId ?? null,
        sentAt: parsedEmail.date ?? null,
        forwarded,
        headers: parsedEmail.headers.map((header) => ({
          key: header.key,
          value: header.value,
        })),
      },
    },
  ];
}
