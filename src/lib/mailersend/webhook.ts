import PostalMime, { type Address } from "postal-mime";
import { z } from "zod";

import { extractForwardedEmailMetadata } from "@/lib/email/forwarded";
import type { NormalizedInboundEmailMessage } from "@/lib/email/inbound";

const attachmentSchema = z.object({
  filename: z.string().optional(),
  content_type: z.string().optional(),
  size: z.number().optional(),
});

const mailersendInboundPayloadSchema = z.object({
  type: z.string(),
  inbound_id: z.string().optional(),
  url: z.string().optional(),
  created_at: z.string().optional(),
  data: z
    .object({
      object: z.string().optional(),
      id: z.string(),
      recipients: z
        .object({
          to: z
            .object({
              raw: z.string().optional(),
            })
            .optional(),
          rcptTo: z.array(z.object({ email: z.string().optional() })).optional(),
        })
        .optional(),
      from: z
        .object({
          email: z.string().optional(),
        })
        .optional(),
      sender: z
        .object({
          email: z.string().optional(),
        })
        .optional(),
      subject: z.string().optional(),
      text: z.string().optional(),
      html: z.string().optional(),
      raw: z.string().optional(),
      attachments: z.array(attachmentSchema).optional(),
      headers: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});

function resolveRecipientAddress(payload: z.infer<typeof mailersendInboundPayloadSchema>) {
  return payload.data?.recipients?.rcptTo?.[0]?.email ?? payload.data?.recipients?.to?.raw ?? undefined;
}

function extractMailboxName(value?: Address | null) {
  if (!value) {
    return undefined;
  }

  if ("address" in value) {
    return value.name?.trim() || undefined;
  }

  return value.group.find((mailbox) => mailbox.name?.trim())?.name?.trim() || undefined;
}

function encodeAttachmentContent(content: ArrayBuffer | Uint8Array | string, encoding?: "base64" | "utf8") {
  if (typeof content === "string") {
    return encoding === "base64" ? content : Buffer.from(content, "utf8").toString("base64");
  }

  return Buffer.from(content instanceof Uint8Array ? content : new Uint8Array(content)).toString("base64");
}

export async function normalizeMailersendWebhookPayload(payload: unknown): Promise<NormalizedInboundEmailMessage[]> {
  const parsedPayload = mailersendInboundPayloadSchema.parse(payload);

  if (parsedPayload.type !== "inbound.message" || !parsedPayload.data) {
    return [];
  }

  const parsedRawEmail = parsedPayload.data.raw ? await PostalMime.parse(parsedPayload.data.raw) : null;
  const forwarded = extractForwardedEmailMetadata({
    subject: parsedRawEmail?.subject ?? parsedPayload.data.subject,
    textBody: parsedRawEmail?.text ?? parsedPayload.data.text,
  });
  const attachments =
    parsedRawEmail?.attachments
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
      })) ?? [];
  const attachmentNames =
    attachments.length > 0
      ? attachments.map((attachment) => attachment.fileName)
      : (parsedPayload.data.attachments ?? [])
          .map((attachment) => attachment.filename?.trim())
          .filter((value): value is string => Boolean(value));

  return [
    {
      provider: "mailersend",
      externalMessageId: parsedPayload.data.id,
      inboxId: parsedPayload.inbound_id ?? resolveRecipientAddress(parsedPayload) ?? "mailersend-unbound-inbox",
      recipientAddress: resolveRecipientAddress(parsedPayload),
      threadId: parsedRawEmail?.inReplyTo ?? parsedPayload.data.headers?.["Message-ID"],
      fromAddress: parsedPayload.data.sender?.email ?? parsedPayload.data.from?.email,
      fromName: extractMailboxName(parsedRawEmail?.from),
      messageId: parsedRawEmail?.messageId ?? parsedPayload.data.headers?.["Message-ID"],
      subject: parsedPayload.data.subject,
      textBody: parsedRawEmail?.text ?? parsedPayload.data.text,
      htmlBody: parsedRawEmail?.html ?? parsedPayload.data.html,
      sentAt: parsedRawEmail?.date ?? undefined,
      receivedAt: parsedPayload.created_at,
      forwardedFromAddress: forwarded?.fromAddress ?? undefined,
      forwardedFromName: forwarded?.fromName ?? undefined,
      forwardedSubject: forwarded?.subject ?? undefined,
      forwardedSentAt: forwarded?.sentAt ?? undefined,
      attachments,
      attachmentNames,
      raw: parsedPayload as Record<string, unknown>,
    },
  ];
}
