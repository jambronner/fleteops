import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { hasPermission } from "@/lib/auth/roles";
import { getOptionalSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { rateCards } from "@/lib/db/schema";

export const runtime = "nodejs";

const updateSchema = z.object({
  minStops: z.number().int().min(1).nullable().optional(),
  maxStops: z.number().int().min(1).nullable().optional(),
  amount: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  active: z.boolean().optional(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ rateCardId: string }> },
) {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!hasPermission(session.permissions, "finance.write")) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }

  try {
    const { rateCardId } = await params;
    const parsedRateCardId = z.string().uuid().parse(rateCardId);
    const payload = updateSchema.parse(await request.json());

    const updates: Partial<typeof rateCards.$inferInsert> = {};

    if (payload.minStops !== undefined) updates.minStops = payload.minStops;
    if (payload.maxStops !== undefined) updates.maxStops = payload.maxStops;
    if (payload.amount !== undefined) updates.amount = payload.amount.toFixed(2);
    if (payload.currency !== undefined) updates.currency = payload.currency.toUpperCase();
    if (payload.active !== undefined) updates.active = payload.active;
    if (payload.validFrom !== undefined) updates.validFrom = payload.validFrom;
    if (payload.validTo !== undefined) updates.validTo = payload.validTo;
    if (payload.notes !== undefined) updates.notes = payload.notes;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "No fields to update." }, { status: 400 });
    }

    const [updated] = await db
      .update(rateCards)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(rateCards.id, parsedRateCardId), eq(rateCards.tenantId, session.tenant.id)))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "Rate card not found in this workspace." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, rateCard: updated });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ ok: false, error: "Invalid rate card request." }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Unable to update the rate card.";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
