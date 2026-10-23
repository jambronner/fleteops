import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { hasPermission } from "@/lib/auth/roles";
import type { AppSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { inboundChannels } from "@/lib/db/schema";

const whatsappIntakePhoneError = "Enter a WhatsApp intake number with country code.";

type InboundChannelRecord = typeof inboundChannels.$inferSelect;

export type WhatsappIntakeChannel = {
  id: string;
  label: string | null;
  externalChannelId: string;
  instanceName: string | null;
  phoneNumber: string | null;
  status: InboundChannelRecord["status"];
  updatedAt: string;
};

export type WhatsappIntakeNumberUpdate = {
  channelId: string;
  phoneNumber: string;
};

const phoneNumberSchema = z.string().transform((value, context) => {
  try {
    return formatWhatsappIntakePhoneNumberForStorage(value);
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : whatsappIntakePhoneError,
    });

    return z.NEVER;
  }
});

const updatePayloadSchema = z.object({
  channelId: z.string().uuid(),
  phoneNumber: phoneNumberSchema,
});

function requireDb() {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  return db;
}

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function resolveWhatsappIntakeInstanceName(
  channel: Pick<InboundChannelRecord, "externalChannelId" | "metadata">,
) {
  if (channel.externalChannelId.startsWith("evolution:")) {
    return channel.externalChannelId.slice("evolution:".length);
  }

  return readMetadataString(channel.metadata, "instanceName");
}

function mapWhatsappIntakeChannel(
  channel: Pick<
    InboundChannelRecord,
    "id" | "label" | "externalChannelId" | "metadata" | "phoneNumber" | "status" | "updatedAt"
  >,
): WhatsappIntakeChannel {
  return {
    id: channel.id,
    label: channel.label,
    externalChannelId: channel.externalChannelId,
    instanceName: resolveWhatsappIntakeInstanceName(channel),
    phoneNumber: channel.phoneNumber,
    status: channel.status,
    updatedAt: channel.updatedAt.toISOString(),
  };
}

export function canManageWhatsappIntakeSettings(session: AppSession) {
  return hasPermission(session.permissions, "workspace.manage");
}

export function formatWhatsappIntakePhoneNumberForStorage(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length < 8 || digits.length > 15) {
    throw new Error(whatsappIntakePhoneError);
  }

  return `+${digits}`;
}

export function parseWhatsappIntakeNumberUpdatePayload(
  payload: unknown,
): WhatsappIntakeNumberUpdate {
  return updatePayloadSchema.parse(payload);
}

export async function getWhatsappIntakeChannels(tenantId: string): Promise<WhatsappIntakeChannel[]> {
  const database = requireDb();

  const channels = await database
    .select({
      id: inboundChannels.id,
      label: inboundChannels.label,
      externalChannelId: inboundChannels.externalChannelId,
      metadata: inboundChannels.metadata,
      phoneNumber: inboundChannels.phoneNumber,
      status: inboundChannels.status,
      updatedAt: inboundChannels.updatedAt,
    })
    .from(inboundChannels)
    .where(
      and(
        eq(inboundChannels.tenantId, tenantId),
        eq(inboundChannels.provider, "whatsapp"),
        eq(inboundChannels.channelKind, "whatsapp_number"),
      ),
    )
    .orderBy(asc(inboundChannels.status), asc(inboundChannels.label), asc(inboundChannels.externalChannelId));

  return channels.map(mapWhatsappIntakeChannel);
}

function getChannelPriority(channel: WhatsappIntakeChannel) {
  const statusPriority = channel.status === "active" ? 100 : channel.status === "pending" ? 50 : 0;
  const phonePriority = channel.phoneNumber?.trim() ? 25 : 0;

  return statusPriority + phonePriority;
}

function getUpdatedAtTimestamp(channel: WhatsappIntakeChannel) {
  const timestamp = Date.parse(channel.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function pickPrimaryWhatsappIntakeChannel(channels: WhatsappIntakeChannel[]) {
  return (
    [...channels].sort((left, right) => {
      const priorityDelta = getChannelPriority(right) - getChannelPriority(left);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return getUpdatedAtTimestamp(right) - getUpdatedAtTimestamp(left);
    })[0] ?? null
  );
}

export type EmailIntakeChannel = {
  id: string;
  label: string | null;
  address: string | null;
  status: string;
};

export async function getPrimaryEmailIntakeChannel(tenantId: string): Promise<EmailIntakeChannel | null> {
  const database = requireDb();

  const channels = await database
    .select({
      id: inboundChannels.id,
      label: inboundChannels.label,
      address: inboundChannels.address,
      status: inboundChannels.status,
      updatedAt: inboundChannels.updatedAt,
    })
    .from(inboundChannels)
    .where(
      and(
        eq(inboundChannels.tenantId, tenantId),
        eq(inboundChannels.channelKind, "email_inbox"),
      ),
    )
    .orderBy(asc(inboundChannels.status), asc(inboundChannels.label));

  const prioritized = [...channels].sort((left, right) => {
    const score = (channel: (typeof channels)[number]) =>
      (channel.status === "active" ? 100 : channel.status === "pending" ? 50 : 0) +
      (channel.address?.trim() ? 25 : 0);

    return score(right) - score(left);
  });

  const channel = prioritized[0];

  if (!channel) {
    return null;
  }

  return {
    id: channel.id,
    label: channel.label,
    address: channel.address,
    status: channel.status,
  };
}

export async function getPrimaryWhatsappIntakeChannel(tenantId: string) {
  return pickPrimaryWhatsappIntakeChannel(await getWhatsappIntakeChannels(tenantId));
}

export async function updateWhatsappIntakeChannelPhoneNumber(
  session: AppSession,
  payload: WhatsappIntakeNumberUpdate,
) {
  const database = requireDb();
  const phoneNumber = formatWhatsappIntakePhoneNumberForStorage(payload.phoneNumber);

  const [existingChannel] = await database
    .select({
      id: inboundChannels.id,
    })
    .from(inboundChannels)
    .where(
      and(
        eq(inboundChannels.id, payload.channelId),
        eq(inboundChannels.tenantId, session.tenant.id),
        eq(inboundChannels.provider, "whatsapp"),
        eq(inboundChannels.channelKind, "whatsapp_number"),
      ),
    )
    .limit(1);

  if (!existingChannel) {
    throw new Error("WhatsApp intake channel not found in this workspace.");
  }

  const [updatedChannel] = await database
    .update(inboundChannels)
    .set({
      phoneNumber,
      updatedAt: new Date(),
    })
    .where(eq(inboundChannels.id, existingChannel.id))
    .returning({
      id: inboundChannels.id,
      label: inboundChannels.label,
      externalChannelId: inboundChannels.externalChannelId,
      metadata: inboundChannels.metadata,
      phoneNumber: inboundChannels.phoneNumber,
      status: inboundChannels.status,
      updatedAt: inboundChannels.updatedAt,
    });

  return mapWhatsappIntakeChannel(updatedChannel);
}
