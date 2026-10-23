import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  createSessionCookieValue,
  getLocaleCookieOptions,
  getSessionCookieOptions,
  localeCookieName,
  sessionCookieName,
} from "@/lib/auth/session";
import { isLocalAuthAllowed } from "@/lib/auth/local-auth-guard";
import { getAppHomePathForHost } from "@/lib/app-routing";
import { db } from "@/lib/db/client";
import { tenantMemberships, tenants, users } from "@/lib/db/schema";

export const runtime = "nodejs";

const createWorkspaceSchema = z.object({
  mode: z.literal("create-workspace"),
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  workspaceName: z.string().min(2).max(120),
  workspaceSlug: z
    .string()
    .min(2)
    .max(128)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  role: z.enum(["admin", "operator", "finance", "viewer"]).default("admin"),
  locale: z.enum(["en", "es-MX"]).default("es-MX"),
});

const signInSchema = z.object({
  mode: z.literal("sign-in"),
  email: z.string().email(),
  workspaceSlug: z
    .string()
    .min(2)
    .max(128)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

function normalizeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  if (!db) {
    return NextResponse.redirect(new URL("/login?error=db", request.url));
  }

  if (!isLocalAuthAllowed()) {
    return NextResponse.redirect(new URL("/login?error=local-auth-disabled", request.url));
  }

  const formData = await request.formData();
  const mode = normalizeText(formData.get("mode"));

  try {
    const appHomePath = getAppHomePathForHost(request.headers.get("host"));

    if (mode === "create-workspace") {
      const payload = createWorkspaceSchema.parse({
        mode,
        fullName: normalizeText(formData.get("fullName")),
        email: normalizeText(formData.get("email")).toLowerCase(),
        workspaceName: normalizeText(formData.get("workspaceName")),
        workspaceSlug: normalizeText(formData.get("workspaceSlug")).toLowerCase(),
        role: normalizeText(formData.get("role")) || "admin",
        locale: normalizeText(formData.get("locale")) || "es-MX",
      });

      const [existingWorkspace] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, payload.workspaceSlug))
        .limit(1);

      if (existingWorkspace) {
        return NextResponse.redirect(new URL("/login?error=workspace-exists", request.url));
      }

      const [user] = await db
        .insert(users)
        .values({
          authProvider: "local_dev",
          authSubject: payload.email,
          email: payload.email,
          fullName: payload.fullName,
          preferredLocale: payload.locale,
          active: true,
        })
        .onConflictDoUpdate({
          target: users.email,
          set: {
            fullName: payload.fullName,
            preferredLocale: payload.locale,
            active: true,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: users.id,
          preferredLocale: users.preferredLocale,
        });

      const [workspace] = await db
        .insert(tenants)
        .values({
          name: payload.workspaceName,
          slug: payload.workspaceSlug,
          defaultLocale: "es-MX",
          timezone: "America/Mexico_City",
          status: "trial",
          active: true,
        })
        .returning({
          id: tenants.id,
          slug: tenants.slug,
        });

      await db
        .insert(tenantMemberships)
        .values({
          tenantId: workspace.id,
          userId: user.id,
          role: payload.role,
          status: "active",
          joinedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [tenantMemberships.tenantId, tenantMemberships.userId],
          set: {
            role: payload.role,
            status: "active",
            joinedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      const response = NextResponse.redirect(new URL(appHomePath, request.url));
      response.cookies.set(
        sessionCookieName,
        createSessionCookieValue({ userId: user.id, tenantId: workspace.id }),
        getSessionCookieOptions(),
      );
      response.cookies.set(localeCookieName, user.preferredLocale, getLocaleCookieOptions());

      return response;
    }

    const payload = signInSchema.parse({
      mode: "sign-in",
      email: normalizeText(formData.get("email")).toLowerCase(),
      workspaceSlug: normalizeText(formData.get("workspaceSlug")).toLowerCase(),
    });

    const [membership] = await db
      .select({
        userId: users.id,
        preferredLocale: users.preferredLocale,
        tenantId: tenants.id,
      })
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
      .where(
        and(
          eq(users.email, payload.email),
          eq(tenants.slug, payload.workspaceSlug),
          eq(tenantMemberships.status, "active"),
        ),
      )
      .limit(1);

    if (!membership) {
      return NextResponse.redirect(new URL("/login?error=not-found", request.url));
    }

    const response = NextResponse.redirect(new URL(appHomePath, request.url));
    response.cookies.set(
      sessionCookieName,
      createSessionCookieValue({ userId: membership.userId, tenantId: membership.tenantId }),
      getSessionCookieOptions(),
    );
    response.cookies.set(localeCookieName, membership.preferredLocale, getLocaleCookieOptions());

    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url));
  }
}
