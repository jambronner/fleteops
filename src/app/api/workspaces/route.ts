import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { db } from "@/lib/db/client";
import { tenants } from "@/lib/db/schema";

const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(128)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  defaultLocale: z.string().default("es-MX"),
  timezone: z.string().default("America/Mexico_City"),
});

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  const session = await getOptionalSession();

  if (!session || !hasPermission(session.permissions, "workspace.manage")) {
    return NextResponse.json({ ok: false, error: "Workspace admin access is required." }, { status: 403 });
  }

  const payload = createWorkspaceSchema.parse(await request.json());

  try {
    const [workspace] = await db
      .insert(tenants)
      .values({
        name: payload.name,
        slug: payload.slug,
        defaultLocale: payload.defaultLocale,
        timezone: payload.timezone,
        status: "trial",
        active: true,
      })
      .returning({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        defaultLocale: tenants.defaultLocale,
        timezone: tenants.timezone,
        status: tenants.status,
      });

    return NextResponse.json({ ok: true, workspace }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workspace creation failed.";
    const status = message.includes("tenants_slug_idx") ? 409 : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
