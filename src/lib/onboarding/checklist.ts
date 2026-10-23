import { and, eq, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { documentLinks, inboundChannels, shipments, tenantMemberships, users } from "@/lib/db/schema";

export type OnboardingStepId = "channel" | "route" | "evidence" | "team";

export type OnboardingChecklist = {
  steps: Array<{ id: OnboardingStepId; done: boolean }>;
  completed: number;
  total: number;
};

type InboundChannelRecord = typeof inboundChannels.$inferSelect;

export type ChannelEligibilityPair = Readonly<
  Pick<InboundChannelRecord, "provider" | "channelKind">
>;

export type ChannelEligibilityQueryPlan = Readonly<{
  status: InboundChannelRecord["status"];
  limit: number;
  pairs: readonly ChannelEligibilityPair[];
}>;

function recursivelyFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);

    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      recursivelyFreeze(nestedValue);
    }
  }

  return value;
}

export const CHANNEL_ELIGIBILITY_QUERY_PLAN: ChannelEligibilityQueryPlan = recursivelyFreeze({
  status: "active" as const,
  limit: 1 as const,
  pairs: [
    { provider: "email_routing" as const, channelKind: "email_inbox" as const },
    { provider: "mailersend" as const, channelKind: "email_inbox" as const },
    { provider: "agentmail" as const, channelKind: "email_inbox" as const },
    { provider: "whatsapp" as const, channelKind: "whatsapp_number" as const },
  ],
});

export type ChannelEligibilityRow = Pick<
  InboundChannelRecord,
  "tenantId" | "provider" | "channelKind" | "status"
>;

type ChannelEligibilityDatabase = Pick<NonNullable<typeof db>, "select">;

export function isChannelRowEligible(
  row: ChannelEligibilityRow,
  tenantId: string,
  selectedPlan: ChannelEligibilityQueryPlan = CHANNEL_ELIGIBILITY_QUERY_PLAN,
): boolean {
  return (
    row.tenantId === tenantId &&
    row.status === selectedPlan.status &&
    selectedPlan.pairs.some(
      (pair) => pair.provider === row.provider && pair.channelKind === row.channelKind,
    )
  );
}

export function buildEligibleChannelQuery(
  database: ChannelEligibilityDatabase,
  tenantId: string,
  selectedPlan: ChannelEligibilityQueryPlan = CHANNEL_ELIGIBILITY_QUERY_PLAN,
) {
  const pairingFilters = selectedPlan.pairs.map((pair) =>
    and(
      eq(inboundChannels.provider, pair.provider),
      eq(inboundChannels.channelKind, pair.channelKind),
    ),
  );

  return database
    .select({ id: inboundChannels.id })
    .from(inboundChannels)
    .where(
      and(
        eq(inboundChannels.tenantId, tenantId),
        eq(inboundChannels.status, selectedPlan.status),
        pairingFilters.length > 0 ? or(...pairingFilters) : sql`false`,
      ),
    )
    .limit(selectedPlan.limit);
}

const DISMISSED_METADATA_KEY = "onboardingChecklistDismissed";

function requireDb() {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  return db;
}

/**
 * Returns the first-run checklist for a workspace, or null when it should not
 * render: every step done, or this user dismissed it for this tenant.
 */
export async function getOnboardingChecklist(
  tenantId: string,
  userId: string,
): Promise<OnboardingChecklist | null> {
  const database = requireDb();

  const [channelRows, shipmentRows, evidenceRows, memberCountRows, userRows] = await Promise.all([
    buildEligibleChannelQuery(database, tenantId),
    database
      .select({ id: shipments.id })
      .from(shipments)
      .where(eq(shipments.tenantId, tenantId))
      .limit(1),
    database
      .select({ id: documentLinks.id })
      .from(documentLinks)
      .where(and(eq(documentLinks.tenantId, tenantId), eq(documentLinks.targetType, "shipment")))
      .limit(1),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.status, "active"))),
    database.select({ metadata: users.metadata }).from(users).where(eq(users.id, userId)).limit(1),
  ]);

  const dismissedMap = (userRows[0]?.metadata?.[DISMISSED_METADATA_KEY] ?? {}) as Record<string, boolean>;

  if (dismissedMap[tenantId]) {
    return null;
  }

  const steps: OnboardingChecklist["steps"] = [
    { id: "channel", done: channelRows.length > 0 },
    { id: "route", done: shipmentRows.length > 0 },
    { id: "evidence", done: evidenceRows.length > 0 },
    { id: "team", done: (memberCountRows[0]?.count ?? 0) >= 2 },
  ];
  const completed = steps.filter((step) => step.done).length;

  if (completed === steps.length) {
    return null;
  }

  return { steps, completed, total: steps.length };
}

export async function dismissOnboardingChecklist(tenantId: string, userId: string) {
  const database = requireDb();
  const [row] = await database
    .select({ metadata: users.metadata })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const currentMetadata = row?.metadata ?? {};
  const dismissedMap = (currentMetadata[DISMISSED_METADATA_KEY] ?? {}) as Record<string, boolean>;

  await database
    .update(users)
    .set({
      metadata: {
        ...currentMetadata,
        [DISMISSED_METADATA_KEY]: { ...dismissedMap, [tenantId]: true },
      },
    })
    .where(eq(users.id, userId));
}
