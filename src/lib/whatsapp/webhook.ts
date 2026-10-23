import { z } from "zod";

const messageSchema = z.object({
  id: z.string(),
  from: z.string().optional(),
  timestamp: z.string().optional(),
  type: z.string(),
  text: z
    .object({
      body: z.string(),
    })
    .optional(),
});

const changeValueSchema = z.object({
  metadata: z
    .object({
      display_phone_number: z.string().optional(),
      phone_number_id: z.string().optional(),
    })
    .optional(),
  contacts: z
    .array(
      z.object({
        wa_id: z.string().optional(),
        profile: z
          .object({
            name: z.string().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  messages: z.array(messageSchema).optional(),
});

const webhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string().optional(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: changeValueSchema,
        }),
      ),
    }),
  ),
});

export type NormalizedWhatsappMessage = {
  sourceProvider?: "meta_cloud" | "evolution";
  externalMessageId: string;
  externalChannelId?: string;
  externalConversationId?: string;
  externalParticipantKey?: string;
  conversationDisplayName?: string;
  fromPhoneNumber?: string;
  displayPhoneNumber?: string;
  phoneNumberId?: string;
  profileName?: string;
  participantName?: string;
  groupName?: string;
  fromMe?: boolean;
  sentAt?: string;
  messageType: string;
  textBody?: string;
  media?: {
    kind: string;
    mimeType?: string;
    fileName?: string;
    caption?: string;
  };
  raw: Record<string, unknown>;
};

export function normalizeWhatsappWebhookPayload(payload: unknown): NormalizedWhatsappMessage[] {
  const parsedPayload = webhookPayloadSchema.parse(payload);
  const normalizedMessages: NormalizedWhatsappMessage[] = [];

  for (const entry of parsedPayload.entry) {
    for (const change of entry.changes) {
      const displayPhoneNumber = change.value.metadata?.display_phone_number;
      const phoneNumberId = change.value.metadata?.phone_number_id;
      const profileName = change.value.contacts?.[0]?.profile?.name;

      for (const message of change.value.messages ?? []) {
        normalizedMessages.push({
          sourceProvider: "meta_cloud",
          externalMessageId: message.id,
          fromPhoneNumber: message.from,
          displayPhoneNumber,
          phoneNumberId,
          profileName,
          sentAt: message.timestamp,
          messageType: message.type,
          textBody: message.text?.body,
          raw: message as Record<string, unknown>,
        });
      }
    }
  }

  return normalizedMessages;
}
