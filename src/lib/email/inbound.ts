import { z } from "zod";

export const normalizedInboundEmailAttachmentSchema = z.object({
  fileName: z.string(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  contentBase64: z.string(),
  contentId: z.string().optional().nullable(),
  disposition: z.enum(["attachment", "inline"]).nullable().optional(),
});

export const normalizedInboundEmailMessageSchema = z.object({
  provider: z.enum(["email_routing", "mailersend", "agentmail"]),
  externalMessageId: z.string(),
  inboxId: z.string(),
  recipientAddress: z.string().optional(),
  threadId: z.string().optional(),
  fromAddress: z.string().optional(),
  fromName: z.string().optional(),
  messageId: z.string().optional(),
  subject: z.string().optional(),
  textBody: z.string().optional(),
  htmlBody: z.string().optional(),
  sentAt: z.string().optional(),
  receivedAt: z.string().optional(),
  forwardedFromAddress: z.string().optional(),
  forwardedFromName: z.string().optional(),
  forwardedSubject: z.string().optional(),
  forwardedSentAt: z.string().optional(),
  attachments: z.array(normalizedInboundEmailAttachmentSchema).default([]),
  attachmentNames: z.array(z.string()).default([]),
  raw: z.record(z.string(), z.unknown()),
});

export type NormalizedInboundEmailMessage = z.infer<typeof normalizedInboundEmailMessageSchema>;
export type NormalizedInboundEmailAttachment = z.infer<typeof normalizedInboundEmailAttachmentSchema>;
