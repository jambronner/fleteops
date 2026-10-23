import { and, desc, eq, inArray, or } from "drizzle-orm";

import type { AppSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import {
  externalParticipantPhoneNumbers,
  externalParticipants,
  inboundChannels,
  inboundConversations,
  intakeEvents,
  organizations,
} from "@/lib/db/schema";
import { fetchEvolutionGroupParticipants } from "@/lib/evolution/client";
import type {
  NormalizedEvolutionGroupEvent,
  NormalizedEvolutionGroupParticipant,
} from "@/lib/evolution/webhook";
import { getDirectoryContactLabel } from "@/lib/partners/display";
import { normalizePhoneNumber } from "@/lib/partners/phone";
import { readHeldWhatsappMessage, shouldReplayHeldWhatsappEvent } from "@/lib/whatsapp/held-intake";

type InboundConversationStatus = typeof inboundConversations.$inferSelect.status;
type WhatsappSourceParticipantIdentity = Omit<WhatsappSourceParticipant, "contact">;

export type WhatsappSourceParticipant = {
  participantKey: string;
  phoneNumber: string | null;
  normalizedPhoneNumber: string | null;
  displayName: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  contact: {
    id: string;
    label: string;
    role: string;
    organizationName: string | null;
    phoneRecordId: string;
    active: boolean;
  } | null;
};

export type WhatsappHeldMessagePreview = {
  id: string;
  textBody: string | null;
  senderName: string | null;
  senderKey: string | null;
  messageType: string;
  mediaKind: string | null;
  mediaCaption: string | null;
  receivedAt: string;
};

export type WhatsappHeldMessageSummary = {
  count: number;
  messages: WhatsappHeldMessagePreview[];
};

export type WhatsappSourceRecord = {
  id: string;
  externalConversationId: string;
  displayName: string | null;
  status: InboundConversationStatus;
  isGroup: boolean;
  lastSeenAt: string;
  participantCount: number;
  mappedParticipantCount: number;
  participants: WhatsappSourceParticipant[];
  heldMessageCount: number;
  heldMessages: WhatsappHeldMessagePreview[];
};

export type WhatsappSourceMetrics = {
  totalSources: number;
  unclaimedSources: number;
  activeSources: number;
  groupSources: number;
  mappedParticipants: number;
  observedParticipants: number;
};

export type WhatsappSourceReviewSnapshot = {
  sources: WhatsappSourceRecord[];
  directorySources: WhatsappSourceRecord[];
  metrics: WhatsappSourceMetrics;
  reviewMetrics: WhatsappSourceMetrics;
  directoryMetrics: WhatsappSourceMetrics;
};

function requireDb() {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  return db;
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeWhatsappIdentifierPhone(value?: string | null) {
  if (!value) {
    return null;
  }

  const raw = value.split("@")[0] ?? value;
  const normalized = normalizePhoneNumber(raw);
  return normalized.length > 0 ? normalized : null;
}

export function whatsappPhoneNumberCandidates(value?: string | null) {
  const normalized = normalizeWhatsappIdentifierPhone(value);

  if (!normalized) {
    return [];
  }

  const candidates = new Set([normalized]);

  if (/^52\d{10}$/.test(normalized)) {
    candidates.add(`521${normalized.slice(2)}`);
  } else if (/^521\d{10}$/.test(normalized)) {
    candidates.add(`52${normalized.slice(3)}`);
  }

  return [...candidates];
}

function participantPhoneCandidates(participant: WhatsappSourceParticipantIdentity) {
  return [
    ...whatsappPhoneNumberCandidates(participant.normalizedPhoneNumber),
    ...whatsappPhoneNumberCandidates(participant.phoneNumber),
    ...whatsappPhoneNumberCandidates(participant.participantKey),
  ];
}

function hasCandidateOverlap(left: string[], right: Set<string>) {
  return left.some((candidate) => right.has(candidate));
}

function participantFromRecord(value: unknown): WhatsappSourceParticipantIdentity | null {
  const record = metadataRecord(value);
  const participantKey =
    typeof record.participantKey === "string"
      ? record.participantKey
      : typeof record.id === "string"
        ? record.id
        : null;

  if (!participantKey) {
    return null;
  }

  const normalizedPhoneNumber =
    typeof record.normalizedPhoneNumber === "string"
      ? record.normalizedPhoneNumber
      : normalizeWhatsappIdentifierPhone(participantKey);

  return {
    participantKey,
    phoneNumber:
      typeof record.phoneNumber === "string"
        ? record.phoneNumber
        : normalizedPhoneNumber,
    normalizedPhoneNumber,
    displayName: typeof record.displayName === "string" ? record.displayName : null,
    isAdmin: record.isAdmin === true,
    isSuperAdmin: record.isSuperAdmin === true,
    firstSeenAt: typeof record.firstSeenAt === "string" ? record.firstSeenAt : null,
    lastSeenAt: typeof record.lastSeenAt === "string" ? record.lastSeenAt : null,
  };
}

export function whatsappSenderPhoneCandidates(args: {
  externalParticipantKey?: string | null;
  conversationMetadata?: Record<string, unknown> | null;
}) {
  const candidates = new Set(whatsappPhoneNumberCandidates(args.externalParticipantKey));
  const metadata = metadataRecord(args.conversationMetadata);
  const metadataParticipants = Array.isArray(metadata.participants) ? metadata.participants : [];
  const matchedParticipant = metadataParticipants
    .map(participantFromRecord)
    .find((participant) => participant?.participantKey === args.externalParticipantKey);

  if (matchedParticipant) {
    for (const phoneCandidate of participantPhoneCandidates(matchedParticipant)) {
      candidates.add(phoneCandidate);
    }
  }

  return [...candidates];
}

export function whatsappSenderMatchesPhone(args: {
  externalParticipantKey?: string | null;
  conversationMetadata?: Record<string, unknown> | null;
  phoneNumber?: string | null;
}) {
  const trustedCandidates = new Set(whatsappPhoneNumberCandidates(args.phoneNumber));

  if (trustedCandidates.size === 0) {
    return false;
  }

  return hasCandidateOverlap(
    whatsappSenderPhoneCandidates({
      externalParticipantKey: args.externalParticipantKey,
      conversationMetadata: args.conversationMetadata,
    }),
    trustedCandidates,
  );
}

export function filterWhatsappSourceReviewParticipants(args: {
  participants: WhatsappSourceParticipantIdentity[];
  listenerPhoneNumber?: string | null;
}) {
  const listenerCandidates = new Set(whatsappPhoneNumberCandidates(args.listenerPhoneNumber));

  if (listenerCandidates.size === 0) {
    return args.participants;
  }

  return args.participants.filter(
    (participant) => !hasCandidateOverlap(participantPhoneCandidates(participant), listenerCandidates),
  );
}

function resolveWhatsappOwnerPhoneNumber(args: {
  ownerKey?: string | null;
  participants: WhatsappSourceParticipantIdentity[];
}) {
  if (!args.ownerKey) {
    return null;
  }

  const ownerParticipant = args.participants.find((participant) => participant.participantKey === args.ownerKey);

  return (
    ownerParticipant?.normalizedPhoneNumber ??
    ownerParticipant?.phoneNumber ??
    normalizeWhatsappIdentifierPhone(args.ownerKey)
  );
}

export function shouldAutoTrustWhatsappGroupFromOwner(args: {
  status: InboundConversationStatus;
  ownerKey?: string | null;
  participants: WhatsappSourceParticipantIdentity[];
  trustedPhoneNumbers: Set<string>;
}) {
  const ownerPhoneNumber = resolveWhatsappOwnerPhoneNumber({
    ownerKey: args.ownerKey,
    participants: args.participants,
  });
  const ownerCandidates = whatsappPhoneNumberCandidates(ownerPhoneNumber);

  return {
    shouldTrust:
      args.status === "unclaimed" &&
      ownerCandidates.length > 0 &&
      hasCandidateOverlap(ownerCandidates, args.trustedPhoneNumbers),
    ownerPhoneNumber,
  };
}

function mergeParticipants(args: {
  existing: unknown;
  incoming: NormalizedEvolutionGroupParticipant[];
  observedAt: string;
}) {
  const participants = new Map<string, Record<string, unknown>>();

  if (Array.isArray(args.existing)) {
    for (const participant of args.existing) {
      const parsed = participantFromRecord(participant);
      if (!parsed) continue;
      participants.set(parsed.participantKey, {
        ...metadataRecord(participant),
        ...parsed,
      });
    }
  }

  for (const participant of args.incoming) {
    const existing = participants.get(participant.participantKey) ?? {};
    const normalizedPhoneNumber =
      participant.normalizedPhoneNumber ??
      normalizeWhatsappIdentifierPhone(participant.participantKey);

    participants.set(participant.participantKey, {
      ...existing,
      participantKey: participant.participantKey,
      phoneNumber: participant.phoneNumber ?? normalizedPhoneNumber ?? null,
      normalizedPhoneNumber,
      displayName: participant.displayName ?? existing.displayName ?? null,
      isAdmin: participant.isAdmin ?? existing.isAdmin ?? false,
      isSuperAdmin: participant.isSuperAdmin ?? existing.isSuperAdmin ?? false,
      firstSeenAt: existing.firstSeenAt ?? args.observedAt,
      lastSeenAt: args.observedAt,
      lastAction: participant.action ?? existing.lastAction ?? null,
    });
  }

  return [...participants.values()].sort((left, right) =>
    String(left.phoneNumber ?? left.participantKey).localeCompare(String(right.phoneNumber ?? right.participantKey)),
  );
}

function dedupeIncomingParticipants(groups: NormalizedEvolutionGroupParticipant[][]) {
  const participants = new Map<string, NormalizedEvolutionGroupParticipant>();

  for (const group of groups) {
    for (const participant of group) {
      const existing = participants.get(participant.participantKey);
      participants.set(participant.participantKey, {
        ...(existing ?? {}),
        ...participant,
        displayName: participant.displayName ?? existing?.displayName,
        isAdmin: participant.isAdmin ?? existing?.isAdmin,
        isSuperAdmin: participant.isSuperAdmin ?? existing?.isSuperAdmin,
        action: participant.action ?? existing?.action,
      });
    }
  }

  return [...participants.values()];
}

const DEFAULT_HELD_MESSAGE_LIMIT = 10;

export function buildWhatsappHeldMessagePreviews(args: {
  events: Array<{
    id: string;
    provider: string;
    status: string;
    conversationId: string | null;
    messageText: string | null;
    externalParticipantKey: string | null;
    receivedAt: Date | string;
    metadata: unknown;
  }>;
  limitPerSource?: number;
}) {
  const limit = args.limitPerSource ?? DEFAULT_HELD_MESSAGE_LIMIT;
  const summaries = new Map<string, WhatsappHeldMessageSummary>();
  const heldEvents = args.events
    .filter((event) => event.conversationId && shouldReplayHeldWhatsappEvent(event))
    .sort(
      (left, right) => new Date(right.receivedAt).valueOf() - new Date(left.receivedAt).valueOf(),
    );

  for (const event of heldEvents) {
    const conversationId = event.conversationId as string;
    const metadata = metadataRecord(event.metadata);
    const media = metadataRecord(metadata.media);
    const heldSnapshot = readHeldWhatsappMessage(event.metadata);
    const summary = summaries.get(conversationId) ?? { count: 0, messages: [] };

    summary.count += 1;

    if (summary.messages.length < limit) {
      summary.messages.push({
        id: event.id,
        textBody: event.messageText ?? heldSnapshot?.textBody ?? null,
        senderName:
          typeof metadata.senderName === "string"
            ? metadata.senderName
            : heldSnapshot?.senderName ?? null,
        senderKey: event.externalParticipantKey ?? heldSnapshot?.externalParticipantKey ?? null,
        messageType: typeof metadata.messageType === "string" ? metadata.messageType : "text",
        mediaKind: typeof media.kind === "string" ? media.kind : null,
        mediaCaption: typeof media.caption === "string" ? media.caption : null,
        receivedAt: new Date(event.receivedAt).toISOString(),
      });
    }

    summaries.set(conversationId, summary);
  }

  return summaries;
}

export function attachWhatsappHeldMessages(
  sources: WhatsappSourceRecord[],
  heldMessagesBySource: Map<string, WhatsappHeldMessageSummary>,
): WhatsappSourceRecord[] {
  return sources.map((source) => {
    const summary = heldMessagesBySource.get(source.id);

    return {
      ...source,
      heldMessageCount: summary?.count ?? 0,
      heldMessages: summary?.messages ?? [],
    };
  });
}

function buildWhatsappSourceMetrics(sources: WhatsappSourceRecord[]): WhatsappSourceMetrics {
  return {
    totalSources: sources.length,
    unclaimedSources: sources.filter((source) => source.status === "unclaimed").length,
    activeSources: sources.filter((source) => source.status === "active").length,
    groupSources: sources.filter((source) => source.isGroup).length,
    mappedParticipants: sources.reduce((sum, source) => sum + source.mappedParticipantCount, 0),
    observedParticipants: sources.reduce((sum, source) => sum + source.participantCount, 0),
  };
}

export function buildWhatsappSourceReviewSnapshot(
  sources: WhatsappSourceRecord[],
): WhatsappSourceReviewSnapshot {
  const reviewSources = sources.filter((source) => source.status === "unclaimed");
  const directorySources = sources.filter((source) => source.status !== "unclaimed");

  return {
    sources: reviewSources,
    directorySources,
    metrics: buildWhatsappSourceMetrics(sources),
    reviewMetrics: buildWhatsappSourceMetrics(reviewSources),
    directoryMetrics: buildWhatsappSourceMetrics(directorySources),
  };
}

function participantsFromConversation(conversation: {
  externalConversationId: string;
  externalParticipantKey: string | null;
  metadata: Record<string, unknown> | null;
  listenerPhoneNumber?: string | null;
}) {
  const metadata = metadataRecord(conversation.metadata);
  const metadataParticipants = Array.isArray(metadata.participants) ? metadata.participants : [];
  const parsedParticipants = metadataParticipants
    .map(participantFromRecord)
    .filter((participant): participant is WhatsappSourceParticipantIdentity => Boolean(participant));

  if (parsedParticipants.length > 0) {
    return filterWhatsappSourceReviewParticipants({
      participants: parsedParticipants,
      listenerPhoneNumber: conversation.listenerPhoneNumber,
    });
  }

  if (!conversation.externalConversationId.endsWith("@g.us")) {
    const participantKey = conversation.externalParticipantKey ?? conversation.externalConversationId;
    const normalizedPhoneNumber = normalizeWhatsappIdentifierPhone(participantKey);

    return [
      {
        participantKey,
        phoneNumber: normalizedPhoneNumber,
        normalizedPhoneNumber,
        displayName: null,
        isAdmin: false,
        isSuperAdmin: false,
        firstSeenAt: null,
        lastSeenAt: null,
      },
    ];
  }

  return [];
}

async function findTrustedWhatsappPhoneNumbers(args: {
  database: ReturnType<typeof requireDb>;
  tenantId: string | null;
  phoneCandidates: string[];
}) {
  if (!args.tenantId || args.phoneCandidates.length === 0) {
    return new Set<string>();
  }

  const rows = await args.database
    .select({
      normalizedPhoneNumber: externalParticipantPhoneNumbers.normalizedPhoneNumber,
    })
    .from(externalParticipantPhoneNumbers)
    .where(
      and(
        eq(externalParticipantPhoneNumbers.tenantId, args.tenantId),
        inArray(externalParticipantPhoneNumbers.normalizedPhoneNumber, args.phoneCandidates),
        eq(externalParticipantPhoneNumbers.active, true),
      ),
    );

  return new Set(rows.map((row) => row.normalizedPhoneNumber));
}

export async function processEvolutionGroupEvents(args: {
  events: NormalizedEvolutionGroupEvent[];
}) {
  const database = requireDb();
  let persisted = 0;

  for (const event of args.events) {
    const [channel] = await database
      .select()
      .from(inboundChannels)
      .where(
        and(
          eq(inboundChannels.provider, "whatsapp"),
          eq(inboundChannels.externalChannelId, event.externalChannelId),
        ),
      )
      .limit(1);

    if (!channel) {
      continue;
    }

    const [existing] = await database
      .select()
      .from(inboundConversations)
      .where(
        and(
          eq(inboundConversations.channelId, channel.id),
          eq(inboundConversations.externalConversationId, event.externalConversationId),
        ),
      )
      .limit(1);

    const observedAt = new Date().toISOString();
    const participantLookup = await fetchEvolutionGroupParticipants({
      instanceName: event.instanceName,
      groupJid: event.externalConversationId,
    });
    const incomingParticipants = dedupeIncomingParticipants([
      event.participants,
      participantLookup.participants,
    ]);
    const existingMetadata = metadataRecord(existing?.metadata);
    const ownerKey =
      event.ownerKey ??
      (typeof existingMetadata.ownerKey === "string" ? existingMetadata.ownerKey : null);
    const nextParticipants = mergeParticipants({
      existing: existingMetadata.participants,
      incoming: incomingParticipants,
      observedAt,
    });
    const parsedNextParticipants = nextParticipants
      .map(participantFromRecord)
      .filter((participant): participant is WhatsappSourceParticipantIdentity => Boolean(participant));
    const ownerPhoneNumber = resolveWhatsappOwnerPhoneNumber({
      ownerKey,
      participants: parsedNextParticipants,
    });
    const trustedOwnerPhoneNumbers = await findTrustedWhatsappPhoneNumbers({
      database,
      tenantId: channel.tenantId,
      phoneCandidates: whatsappPhoneNumberCandidates(ownerPhoneNumber),
    });
    const autoTrustDecision = shouldAutoTrustWhatsappGroupFromOwner({
      status: existing?.status ?? "unclaimed",
      ownerKey,
      participants: parsedNextParticipants,
      trustedPhoneNumbers: trustedOwnerPhoneNumbers,
    });
    const nextStatus = autoTrustDecision.shouldTrust ? "active" : (existing?.status ?? "unclaimed");
    const nextMetadata = {
      ...existingMetadata,
      sourceProvider: event.sourceProvider,
      sourceKind: "whatsapp_group",
      ownerKey,
      lastGroupEvent: event.eventName,
      lastObservedAt: observedAt,
      ...(participantLookup.attempted
        ? {
            lastParticipantLookup: {
              ok: participantLookup.ok,
              fetchedAt: participantLookup.fetchedAt,
              participantCount: participantLookup.participantCount,
              error: participantLookup.error ?? null,
            },
          }
        : {}),
      ...(autoTrustDecision.shouldTrust
        ? {
            trustAutomation: {
              status: "auto_trusted",
              reason: "trusted_group_owner",
              trustedAt: observedAt,
              ownerKey,
              ownerPhoneNumber: autoTrustDecision.ownerPhoneNumber,
            },
          }
        : {}),
      rawGroupPayload: event.raw,
      participants: nextParticipants,
    };

    if (existing) {
      await database
        .update(inboundConversations)
        .set({
          tenantId: existing.tenantId ?? channel.tenantId,
          displayName: event.conversationDisplayName ?? existing.displayName,
          externalParticipantKey: event.ownerKey ?? existing.externalParticipantKey,
          status: nextStatus,
          claimedAt: autoTrustDecision.shouldTrust ? existing.claimedAt ?? new Date() : existing.claimedAt,
          metadata: nextMetadata,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(inboundConversations.id, existing.id));
    } else {
      await database.insert(inboundConversations).values({
        channelId: channel.id,
        tenantId: channel.tenantId,
        externalConversationId: event.externalConversationId,
        externalParticipantKey: event.ownerKey,
        displayName: event.conversationDisplayName ?? event.externalConversationId,
        status: nextStatus,
        claimedAt: autoTrustDecision.shouldTrust ? new Date() : undefined,
        metadata: nextMetadata,
      });
    }

    persisted += 1;
  }

  return {
    persisted,
  };
}

export async function getWhatsappSourceReviewSnapshot(
  tenantId: string,
  options?: { includeHeldMessages?: boolean },
): Promise<WhatsappSourceReviewSnapshot> {
  const database = requireDb();
  const rows = await database
    .select({
      id: inboundConversations.id,
      externalConversationId: inboundConversations.externalConversationId,
      externalParticipantKey: inboundConversations.externalParticipantKey,
      displayName: inboundConversations.displayName,
      status: inboundConversations.status,
      lastSeenAt: inboundConversations.lastSeenAt,
      metadata: inboundConversations.metadata,
      listenerPhoneNumber: inboundChannels.phoneNumber,
    })
    .from(inboundConversations)
    .innerJoin(inboundChannels, eq(inboundChannels.id, inboundConversations.channelId))
    .where(
      and(
        eq(inboundChannels.provider, "whatsapp"),
        or(eq(inboundChannels.tenantId, tenantId), eq(inboundConversations.tenantId, tenantId)),
      ),
    )
    .orderBy(desc(inboundConversations.lastSeenAt));

  const participantMap = new Map<string, WhatsappSourceParticipantIdentity[]>();
  const normalizedPhones = new Set<string>();

  for (const row of rows) {
    const participants = participantsFromConversation(row);
    participantMap.set(row.id, participants);
    for (const participant of participants) {
      for (const phoneCandidate of participantPhoneCandidates(participant)) {
        normalizedPhones.add(phoneCandidate);
      }
    }
  }

  const phoneMatches = normalizedPhones.size
    ? await database
        .select({
          phoneRecordId: externalParticipantPhoneNumbers.id,
          normalizedPhoneNumber: externalParticipantPhoneNumbers.normalizedPhoneNumber,
          active: externalParticipantPhoneNumbers.active,
          contactId: externalParticipants.id,
          fullName: externalParticipants.fullName,
          displayName: externalParticipants.displayName,
          role: externalParticipants.role,
          organizationDisplayName: organizations.displayName,
          organizationLegalName: organizations.legalName,
          fallbackOrganizationName: externalParticipants.organizationName,
        })
        .from(externalParticipantPhoneNumbers)
        .innerJoin(externalParticipants, eq(externalParticipants.id, externalParticipantPhoneNumbers.externalParticipantId))
        .leftJoin(organizations, eq(organizations.id, externalParticipants.organizationId))
        .where(
          and(
            eq(externalParticipantPhoneNumbers.tenantId, tenantId),
            inArray(externalParticipantPhoneNumbers.normalizedPhoneNumber, [...normalizedPhones]),
            eq(externalParticipantPhoneNumbers.active, true),
          ),
        )
    : [];

  const matchesByPhone = new Map<string, (typeof phoneMatches)[number]>();
  for (const match of phoneMatches) {
    for (const phoneCandidate of whatsappPhoneNumberCandidates(match.normalizedPhoneNumber)) {
      if (!matchesByPhone.has(phoneCandidate) || match.active) {
        matchesByPhone.set(phoneCandidate, match);
      }
    }
  }

  const sources: WhatsappSourceRecord[] = rows.map((row) => {
    const participants = (participantMap.get(row.id) ?? []).map((participant) => {
      const match = participantPhoneCandidates(participant)
        .map((phoneCandidate) => matchesByPhone.get(phoneCandidate))
        .find(Boolean);

      return {
        ...participant,
        contact: match
          ? {
              id: match.contactId,
              label:
                getDirectoryContactLabel({
                  fullName: match.fullName,
                  displayName: match.displayName,
                }) ?? participant.phoneNumber ?? match.contactId,
              role: match.role,
              organizationName:
                match.organizationDisplayName ?? match.organizationLegalName ?? match.fallbackOrganizationName ?? null,
              phoneRecordId: match.phoneRecordId,
              active: match.active,
            }
          : null,
      };
    });

    const mappedParticipantCount = participants.filter((participant) => participant.contact?.active).length;

    return {
      id: row.id,
      externalConversationId: row.externalConversationId,
      displayName: row.displayName,
      status: row.status,
      isGroup: row.externalConversationId.endsWith("@g.us"),
      lastSeenAt: row.lastSeenAt.toISOString(),
      participantCount: participants.length,
      mappedParticipantCount,
      participants,
      heldMessageCount: 0,
      heldMessages: [],
    };
  });

  const unclaimedSourceIds = sources
    .filter((source) => source.status === "unclaimed")
    .map((source) => source.id);

  if (!options?.includeHeldMessages || unclaimedSourceIds.length === 0) {
    return buildWhatsappSourceReviewSnapshot(sources);
  }

  const heldEventRows = await database
    .select({
      id: intakeEvents.id,
      provider: intakeEvents.provider,
      status: intakeEvents.status,
      conversationId: intakeEvents.conversationId,
      messageText: intakeEvents.messageText,
      externalParticipantKey: intakeEvents.externalParticipantKey,
      receivedAt: intakeEvents.receivedAt,
      metadata: intakeEvents.metadata,
    })
    .from(intakeEvents)
    .where(
      and(
        eq(intakeEvents.provider, "whatsapp"),
        eq(intakeEvents.status, "received"),
        inArray(intakeEvents.conversationId, unclaimedSourceIds),
      ),
    );

  return buildWhatsappSourceReviewSnapshot(
    attachWhatsappHeldMessages(sources, buildWhatsappHeldMessagePreviews({ events: heldEventRows })),
  );
}

export async function updateWhatsappSourceStatus(args: {
  session: AppSession;
  sourceId: string;
  status: InboundConversationStatus;
}) {
  const database = requireDb();
  const [source] = await database
    .select({
      id: inboundConversations.id,
      channelTenantId: inboundChannels.tenantId,
      conversationTenantId: inboundConversations.tenantId,
    })
    .from(inboundConversations)
    .innerJoin(inboundChannels, eq(inboundChannels.id, inboundConversations.channelId))
    .where(
      and(
        eq(inboundConversations.id, args.sourceId),
        eq(inboundChannels.provider, "whatsapp"),
        or(
          eq(inboundChannels.tenantId, args.session.tenant.id),
          eq(inboundConversations.tenantId, args.session.tenant.id),
        ),
      ),
    )
    .limit(1);

  if (!source) {
    throw new Error("WhatsApp source not found in this workspace.");
  }

  await database
    .update(inboundConversations)
    .set({
      tenantId: args.session.tenant.id,
      status: args.status,
      claimedByUserId: args.status === "active" ? args.session.user.id : null,
      claimedAt: args.status === "active" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(inboundConversations.id, args.sourceId));
}

export async function hasTrustedWhatsappSender(args: {
  tenantId: string | null;
  conversationStatus: string;
  externalConversationId?: string | null;
  externalParticipantKey?: string | null;
}) {
  if (!args.tenantId || args.conversationStatus !== "active") {
    return false;
  }

  if (!args.externalConversationId?.endsWith("@g.us")) {
    return true;
  }

  const database = requireDb();
  const [conversation] = await database
    .select({
      metadata: inboundConversations.metadata,
    })
    .from(inboundConversations)
    .innerJoin(inboundChannels, eq(inboundChannels.id, inboundConversations.channelId))
    .where(
      and(
        eq(inboundChannels.provider, "whatsapp"),
        eq(inboundConversations.externalConversationId, args.externalConversationId),
        eq(inboundConversations.status, "active"),
        or(eq(inboundChannels.tenantId, args.tenantId), eq(inboundConversations.tenantId, args.tenantId)),
      ),
    )
    .limit(1);
  const normalizedPhones = whatsappSenderPhoneCandidates({
    externalParticipantKey: args.externalParticipantKey,
    conversationMetadata: conversation?.metadata ?? null,
  });

  if (normalizedPhones.length === 0) {
    return false;
  }

  const [match] = await database
    .select({ id: externalParticipantPhoneNumbers.id })
    .from(externalParticipantPhoneNumbers)
    .where(
      and(
        eq(externalParticipantPhoneNumbers.tenantId, args.tenantId),
        inArray(externalParticipantPhoneNumbers.normalizedPhoneNumber, normalizedPhones),
        eq(externalParticipantPhoneNumbers.active, true),
      ),
    )
    .limit(1);

  return Boolean(match);
}
