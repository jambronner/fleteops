import type { NormalizedWhatsappMessage } from "@/lib/whatsapp/webhook";

type JsonRecord = Record<string, unknown>;

export type NormalizedEvolutionGroupParticipant = {
  participantKey: string;
  phoneNumber?: string;
  normalizedPhoneNumber?: string;
  displayName?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  action?: string;
};

export type NormalizedEvolutionGroupEvent = {
  sourceProvider: "evolution";
  eventName: string;
  instanceName: string;
  externalChannelId: string;
  externalConversationId: string;
  conversationDisplayName?: string;
  ownerKey?: string;
  participants: NormalizedEvolutionGroupParticipant[];
  raw: Record<string, unknown>;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asTimestampString(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return asString(value);
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readRecord(record: JsonRecord | null | undefined, key: string) {
  return record ? asRecord(record[key]) : null;
}

function readString(record: JsonRecord | null | undefined, key: string) {
  return record ? asString(record[key]) : undefined;
}

function readTimestampString(record: JsonRecord | null | undefined, key: string) {
  return record ? asTimestampString(record[key]) : undefined;
}

function readBoolean(record: JsonRecord | null | undefined, key: string) {
  return record ? asBoolean(record[key]) : undefined;
}

function firstString(...values: (string | undefined)[]) {
  return values.find((value) => value && value.length > 0);
}

function normalizeEventName(value?: string) {
  return value?.toLowerCase().replaceAll("_", ".").replaceAll("-", ".");
}

function isMessageEvent(eventName?: string) {
  if (!eventName) {
    return true;
  }

  return ["messages.upsert", "messages.set", "send.message"].includes(normalizeEventName(eventName) ?? "");
}

function isGroupEvent(eventName?: string) {
  return ["groups.upsert", "groups.update", "group.participants.update"].includes(
    normalizeEventName(eventName) ?? "",
  );
}

function findInstanceName(payload: JsonRecord, data: JsonRecord | null) {
  const instanceRecord = readRecord(payload, "instance") ?? readRecord(data, "instance");

  return firstString(
    readString(payload, "instance"),
    readString(payload, "instanceName"),
    readString(payload, "numberId"),
    readString(data, "instance"),
    readString(data, "instanceName"),
    readString(data, "numberId"),
    readString(instanceRecord, "instanceName"),
    readString(instanceRecord, "instanceId"),
  );
}

function extractCandidateMessages(payload: JsonRecord, data: JsonRecord | null) {
  const candidates: JsonRecord[] = [];
  const dataMessages = data?.messages;

  if (Array.isArray(dataMessages)) {
    candidates.push(...dataMessages.map(asRecord).filter((message): message is JsonRecord => Boolean(message)));
  } else if (data && (readRecord(data, "key") || readRecord(data, "message") || readString(data, "messageType"))) {
    candidates.push(data);
  } else if (readRecord(payload, "key") || readRecord(payload, "message") || readString(payload, "messageType")) {
    candidates.push(payload);
  }

  return candidates;
}

function readMessageText(message: JsonRecord, messageContent: JsonRecord | null) {
  const extendedText = readRecord(messageContent, "extendedTextMessage");
  const image = readRecord(messageContent, "imageMessage");
  const video = readRecord(messageContent, "videoMessage");
  const document = readRecord(messageContent, "documentMessage");

  return firstString(
    readString(message, "messageBody"),
    readString(message, "body"),
    readString(messageContent, "conversation"),
    readString(extendedText, "text"),
    readString(image, "caption"),
    readString(video, "caption"),
    readString(document, "caption"),
  );
}

function inferMessageType(message: JsonRecord, messageContent: JsonRecord | null) {
  const explicitType = firstString(readString(message, "messageType"), readString(message, "type"));

  if (explicitType) {
    return explicitType;
  }

  const firstContentKey = messageContent ? Object.keys(messageContent)[0] : null;
  return firstContentKey ?? "unknown";
}

function extractMedia(messageType: string, messageContent: JsonRecord | null) {
  const contentRecord = readRecord(messageContent, messageType);
  const fallbackRecord =
    readRecord(messageContent, "imageMessage") ??
    readRecord(messageContent, "videoMessage") ??
    readRecord(messageContent, "documentMessage") ??
    readRecord(messageContent, "audioMessage");

  const mediaRecord = contentRecord ?? fallbackRecord;

  if (!mediaRecord) {
    return undefined;
  }

  const normalizedType = messageType.toLowerCase();
  const kind = normalizedType.replace("message", "") || "media";
  const caption = readString(mediaRecord, "caption");

  return {
    kind,
    mimeType: readString(mediaRecord, "mimetype") ?? readString(mediaRecord, "mimeType"),
    fileName: readString(mediaRecord, "fileName") ?? readString(mediaRecord, "filename"),
    caption,
  };
}

function deriveParticipantKey(key: JsonRecord | null, remoteJid?: string) {
  return firstString(
    readString(key, "participant"),
    readString(key, "senderPn"),
    readString(key, "senderLid"),
    readString(key, "cleanedSenderPn"),
    remoteJid?.endsWith("@g.us") ? undefined : remoteJid,
  );
}

function normalizeParticipantPhone(value?: string) {
  if (!value) {
    return undefined;
  }

  if (value.toLowerCase().endsWith("@lid")) {
    return undefined;
  }

  const jidUser = value.split("@")[0] ?? value;
  const normalized = jidUser.replace(/[^\d]/g, "");
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeEvolutionGroupParticipant(
  value: unknown,
  action?: string,
): NormalizedEvolutionGroupParticipant | null {
  if (typeof value === "string") {
    const phone = normalizeParticipantPhone(value);
    return {
      participantKey: value,
      phoneNumber: phone,
      normalizedPhoneNumber: phone,
      action,
    };
  }

  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const participantKey = firstString(
    readString(record, "id"),
    readString(record, "jid"),
    readString(record, "participant"),
    readString(record, "phoneNumber"),
    readString(record, "number"),
  );

  if (!participantKey) {
    return null;
  }

  const phone =
    normalizeParticipantPhone(readString(record, "phoneNumber")) ??
    normalizeParticipantPhone(readString(record, "number")) ??
    normalizeParticipantPhone(participantKey);
  const adminValue = readString(record, "admin");

  return {
    participantKey,
    phoneNumber: phone,
    normalizedPhoneNumber: phone,
    displayName:
      readString(record, "name") ??
      readString(record, "pushName") ??
      readString(record, "notify") ??
      readString(record, "verifiedName"),
    isAdmin:
      readBoolean(record, "isAdmin") ??
      (adminValue ? ["admin", "superadmin", "super-admin"].includes(adminValue.toLowerCase()) : undefined),
    isSuperAdmin:
      readBoolean(record, "isSuperAdmin") ??
      (adminValue ? ["superadmin", "super-admin"].includes(adminValue.toLowerCase()) : undefined),
    action,
  };
}

function readParticipants(...records: (JsonRecord | null | undefined)[]) {
  const values: unknown[] = [];
  let action: string | undefined;

  for (const record of records) {
    if (!record) {
      continue;
    }

    action = action ?? readString(record, "action");
    const participants = record.participants ?? record.participant;

    if (Array.isArray(participants)) {
      values.push(...participants);
    } else if (participants) {
      values.push(participants);
    }
  }

  const normalizedParticipants = values
    .map((value) => normalizeEvolutionGroupParticipant(value, action))
    .filter((participant): participant is NormalizedEvolutionGroupParticipant => Boolean(participant));

  return normalizedParticipants;
}

function extractCandidateGroups(payload: JsonRecord, data: JsonRecord | null) {
  const candidates: JsonRecord[] = [];
  const dataItems = data?.groups ?? data?.groupMetadata ?? data?.chats;

  if (Array.isArray(dataItems)) {
    candidates.push(...dataItems.map(asRecord).filter((item): item is JsonRecord => Boolean(item)));
  } else if (asRecord(dataItems)) {
    candidates.push(asRecord(dataItems) as JsonRecord);
  } else if (Array.isArray(payload.data)) {
    candidates.push(...payload.data.map(asRecord).filter((item): item is JsonRecord => Boolean(item)));
  } else if (data) {
    candidates.push(data);
  } else {
    candidates.push(payload);
  }

  return candidates;
}

function buildExternalMessageId(args: {
  instanceName: string;
  messageId?: string;
  remoteJid?: string;
  timestamp?: string;
}) {
  if (args.messageId) {
    return `evolution:${args.instanceName}:${args.messageId}`;
  }

  if (args.remoteJid && args.timestamp) {
    return `evolution:${args.instanceName}:${args.remoteJid}:${args.timestamp}`;
  }

  return null;
}

export function buildEvolutionExternalChannelId(instanceName: string) {
  return `evolution:${instanceName}`;
}

export function normalizeEvolutionWebhookPayload(payload: unknown): NormalizedWhatsappMessage[] {
  const payloadRecord = asRecord(payload);

  if (!payloadRecord) {
    return [];
  }

  const eventName = readString(payloadRecord, "event");

  if (!isMessageEvent(eventName)) {
    return [];
  }

  const data = readRecord(payloadRecord, "data");
  const instanceName = findInstanceName(payloadRecord, data) ?? "unknown-instance";
  const externalChannelId = buildEvolutionExternalChannelId(instanceName);
  const candidates = extractCandidateMessages(payloadRecord, data);

  return candidates.flatMap((message) => {
    const key = readRecord(message, "key");
    const messageContent = readRecord(message, "message");
    const remoteJid = readString(key, "remoteJid") ?? readString(message, "remoteJid");
    const messageId = readString(key, "id") ?? readString(message, "id");
    const timestamp =
      readTimestampString(message, "messageTimestamp") ??
      readTimestampString(message, "timestamp") ??
      readTimestampString(payloadRecord, "timestamp");
    const externalMessageId = buildExternalMessageId({
      instanceName,
      messageId,
      remoteJid,
      timestamp,
    });

    if (!externalMessageId) {
      return [];
    }

    const fromMe = readBoolean(key, "fromMe") ?? false;

    if (fromMe) {
      return [];
    }

    const messageType = inferMessageType(message, messageContent);
    const textBody = readMessageText(message, messageContent);
    const media = extractMedia(messageType, messageContent);
    const participantKey = deriveParticipantKey(key, remoteJid);
    const groupName = firstString(
      readString(message, "groupName"),
      readString(message, "chatName"),
      readString(message, "subject"),
      readString(data, "groupName"),
      readString(data, "chatName"),
      readString(data, "subject"),
    );

    return [
      {
        sourceProvider: "evolution" as const,
        externalMessageId,
        externalChannelId,
        externalConversationId: remoteJid,
        externalParticipantKey: participantKey,
        conversationDisplayName: groupName ?? remoteJid,
        fromPhoneNumber: participantKey,
        profileName: readString(message, "pushName") ?? readString(data, "pushName"),
        participantName: readString(message, "pushName") ?? readString(data, "pushName"),
        groupName,
        fromMe,
        sentAt: timestamp,
        messageType,
        textBody,
        media,
        raw: {
          event: eventName ?? null,
          instanceName,
          data: message,
        },
      },
    ];
  });
}

export function normalizeEvolutionGroupWebhookPayload(payload: unknown): NormalizedEvolutionGroupEvent[] {
  const payloadRecord = asRecord(payload);

  if (!payloadRecord) {
    return [];
  }

  const eventName = readString(payloadRecord, "event");

  if (!isGroupEvent(eventName)) {
    return [];
  }

  const data = readRecord(payloadRecord, "data");
  const instanceName = findInstanceName(payloadRecord, data) ?? "unknown-instance";
  const externalChannelId = buildEvolutionExternalChannelId(instanceName);
  const candidates = extractCandidateGroups(payloadRecord, data);

  return candidates.flatMap((group) => {
    const externalConversationId = firstString(
      readString(group, "id"),
      readString(group, "groupJid"),
      readString(group, "remoteJid"),
      readString(group, "jid"),
      readString(data, "id"),
      readString(data, "groupJid"),
      readString(data, "remoteJid"),
      readString(data, "jid"),
    );

    if (!externalConversationId || !externalConversationId.endsWith("@g.us")) {
      return [];
    }

    const participants = readParticipants(group, data);

    return [
      {
        sourceProvider: "evolution" as const,
        eventName: eventName ?? "GROUPS_UPDATE",
        instanceName,
        externalChannelId,
        externalConversationId,
        conversationDisplayName:
          readString(group, "subject") ??
          readString(group, "name") ??
          readString(group, "groupName") ??
          readString(data, "subject") ??
          readString(data, "name") ??
          readString(data, "groupName"),
        ownerKey: readString(group, "owner") ?? readString(group, "subjectOwner") ?? readString(data, "owner"),
        participants,
        raw: {
          event: eventName ?? null,
          instanceName,
          data: group,
        },
      },
    ];
  });
}
