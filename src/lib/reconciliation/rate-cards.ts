import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { rateCards } from "@/lib/db/schema";

export type RateCardDirection = "customer" | "carrier";

export type RateCardRecord = {
  id: string;
  direction: RateCardDirection;
  counterpartyOrgId: string | null;
  matchType: string;
  minStops: number | null;
  maxStops: number | null;
  amount: number;
  currency: string;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
};

export type ResolvedRateCardAmount = {
  rateCardId: string;
  amount: number;
  currency: string;
};

function withinStopTier(card: RateCardRecord, stopCount: number) {
  if (card.minStops != null && stopCount < card.minStops) {
    return false;
  }

  if (card.maxStops != null && stopCount > card.maxStops) {
    return false;
  }

  return true;
}

function withinValidityWindow(card: RateCardRecord, serviceDate: string | null | undefined) {
  if (!serviceDate) {
    // A route without a known service date still deserves an expected amount;
    // the validity window only filters when the date is known.
    return true;
  }

  if (card.validFrom && serviceDate < card.validFrom) {
    return false;
  }

  if (card.validTo && serviceDate > card.validTo) {
    return false;
  }

  return true;
}

function tierWidth(card: RateCardRecord) {
  if (card.minStops == null && card.maxStops == null) {
    return Number.POSITIVE_INFINITY;
  }

  return (card.maxStops ?? Number.MAX_SAFE_INTEGER) - (card.minStops ?? 0);
}

/**
 * Resolves the agreed amount for one route from the tenant's rate cards.
 * Preference order: a card bound to the counterparty organization outranks a
 * direction-wide default (null counterpartyOrgId); among candidates the
 * narrower stop tier wins, then the most recent validFrom. Returns null when
 * no card matches — an absent agreement must never invent an expected amount.
 */
export function resolveRateCardAmount(args: {
  rateCards: RateCardRecord[];
  direction: RateCardDirection;
  counterpartyOrgId?: string | null;
  stopCount?: number | null;
  serviceDate?: string | null;
}): ResolvedRateCardAmount | null {
  if (args.stopCount == null || args.stopCount <= 0) {
    return null;
  }

  const stopCount = args.stopCount;
  const candidates = args.rateCards.filter(
    (card) =>
      card.active &&
      card.direction === args.direction &&
      card.matchType === "stop_count" &&
      (card.counterpartyOrgId == null ||
        (args.counterpartyOrgId != null && card.counterpartyOrgId === args.counterpartyOrgId)) &&
      withinStopTier(card, stopCount) &&
      withinValidityWindow(card, args.serviceDate),
  );

  if (candidates.length === 0) {
    return null;
  }

  const [best] = [...candidates].sort((a, b) => {
    const aSpecific = a.counterpartyOrgId != null ? 0 : 1;
    const bSpecific = b.counterpartyOrgId != null ? 0 : 1;

    if (aSpecific !== bSpecific) {
      return aSpecific - bSpecific;
    }

    const widthDelta = tierWidth(a) - tierWidth(b);

    if (widthDelta !== 0) {
      return widthDelta;
    }

    return (b.validFrom ?? "").localeCompare(a.validFrom ?? "");
  });

  return {
    rateCardId: best.id,
    amount: best.amount,
    currency: best.currency,
  };
}

function parseAmount(value: string | null): number | null {
  if (value == null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getRateCardsForTenant(tenantId: string): Promise<RateCardRecord[]> {
  if (!db) {
    return [];
  }

  const rows = await db
    .select({
      id: rateCards.id,
      direction: rateCards.direction,
      counterpartyOrgId: rateCards.counterpartyOrgId,
      matchType: rateCards.matchType,
      minStops: rateCards.minStops,
      maxStops: rateCards.maxStops,
      amount: rateCards.amount,
      currency: rateCards.currency,
      active: rateCards.active,
      validFrom: rateCards.validFrom,
      validTo: rateCards.validTo,
    })
    .from(rateCards)
    .where(and(eq(rateCards.tenantId, tenantId), eq(rateCards.active, true)));

  return rows.flatMap((row) => {
    const amount = parseAmount(row.amount);

    if (amount == null) {
      return [];
    }

    return [
      {
        id: row.id,
        direction: row.direction,
        counterpartyOrgId: row.counterpartyOrgId,
        matchType: row.matchType,
        minStops: row.minStops,
        maxStops: row.maxStops,
        amount,
        currency: row.currency,
        active: row.active,
        validFrom: row.validFrom,
        validTo: row.validTo,
      },
    ];
  });
}
