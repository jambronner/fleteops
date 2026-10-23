import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { hasPermission } from "@/lib/auth/roles";
import { getOptionalSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { organizations, rateCards } from "@/lib/db/schema";

export const runtime = "nodejs";

const createSchema = z.object({
  direction: z.enum(["customer", "carrier"]),
  counterpartyOrgId: z.string().uuid().nullable().optional(),
  minStops: z.number().int().min(1).nullable().optional(),
  maxStops: z.number().int().min(1).nullable().optional(),
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function GET() {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!hasPermission(session.permissions, "finance.read")) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(rateCards)
    .where(eq(rateCards.tenantId, session.tenant.id))
    .orderBy(rateCards.direction, rateCards.minStops);

  return NextResponse.json({ ok: true, rateCards: rows });
}

export async function POST(request: NextRequest) {
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
    const payload = createSchema.parse(await request.json());

    if (payload.minStops != null && payload.maxStops != null && payload.maxStops < payload.minStops) {
      return NextResponse.json(
        { ok: false, error: "maxStops must be greater than or equal to minStops." },
        { status: 400 },
      );
    }

    if (payload.counterpartyOrgId) {
      const [organization] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(
          and(
            eq(organizations.id, payload.counterpartyOrgId),
            eq(organizations.tenantId, session.tenant.id),
          ),
        )
        .limit(1);

      if (!organization) {
        return NextResponse.json(
          { ok: false, error: "Counterparty organization not found in this workspace." },
          { status: 404 },
        );
      }
    }

    const [created] = await db
      .insert(rateCards)
      .values({
        tenantId: session.tenant.id,
        direction: payload.direction,
        counterpartyOrgId: payload.counterpartyOrgId ?? null,
        matchType: "stop_count",
        minStops: payload.minStops ?? null,
        maxStops: payload.maxStops ?? null,
        amount: payload.amount.toFixed(2),
        currency: (payload.currency ?? "MXN").toUpperCase(),
        active: true,
        validFrom: payload.validFrom ?? null,
        validTo: payload.validTo ?? null,
        notes: payload.notes ?? null,
      })
      .returning();

    return NextResponse.json({ ok: true, rateCard: created });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ ok: false, error: "Invalid rate card request." }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Unable to create the rate card.";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
