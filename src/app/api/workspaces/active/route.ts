import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  activeTenantCookieName,
  createSessionCookieValue,
  getLocaleCookieOptions,
  getOptionalSession,
  getSessionCookieOptions,
  localeCookieName,
  sessionCookieName,
} from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { tenantMemberships, tenants } from "@/lib/db/schema";

export const runtime = "nodejs";

const selectWorkspaceSchema = z.object({
  tenantId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const payload = selectWorkspaceSchema.parse(await request.json());

  const [membership] = await db
    .select({
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantLocale: tenants.defaultLocale,
    })
    .from(tenantMemberships)
    .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
    .where(
      and(
        eq(tenantMemberships.userId, session.user.id),
        eq(tenantMemberships.tenantId, payload.tenantId),
        eq(tenantMemberships.status, "active"),
        eq(tenants.active, true),
      ),
    )
    .limit(1);

  if (!membership) {
    return NextResponse.json({ ok: false, error: "Workspace membership not found." }, { status: 404 });
  }

  const response = NextResponse.json({
    ok: true,
    workspace: {
      id: membership.tenantId,
      name: membership.tenantName,
    },
  });

  response.cookies.set(activeTenantCookieName, membership.tenantId, getLocaleCookieOptions());
  response.cookies.set(localeCookieName, session.user.preferredLocale || membership.tenantLocale, getLocaleCookieOptions());
  response.cookies.set(
    sessionCookieName,
    createSessionCookieValue({ userId: session.user.id, tenantId: membership.tenantId }),
    getSessionCookieOptions(),
  );

  return response;
}
