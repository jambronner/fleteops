import { createHmac, timingSafeEqual } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { rolePermissions, type AppRole } from "@/lib/auth/roles";
import { db } from "@/lib/db/client";
import { tenantMemberships, tenants, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { isSupabaseAuthEnabled } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { acceptWorkspaceInvitesForSupabaseUser } from "@/lib/workspaces/invite-flow";
import { createDrizzleWorkspaceInviteRepository } from "@/lib/workspaces/invite-repository";

export const sessionCookieName = "fleteops_session";
export const localeCookieName = "fleteops_locale";
export const activeTenantCookieName = "fleteops_active_tenant";

type SessionTokenPayload = {
  userId: string;
  tenantId: string;
  issuedAt: number;
};

const sessionMaxAgeSeconds = env.SESSION_MAX_AGE_DAYS * 24 * 60 * 60;
const secureCookies =
  process.env.NODE_ENV === "production" || env.NEXT_PUBLIC_APP_URL.startsWith("https://");

export type AppSession = {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: AppRole;
    preferredLocale: string;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    locale: string;
    timezone: string;
  };
  permissions: string[];
};

export type AvailableWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: AppRole;
};

type SessionLookupRow = {
  userId: string;
  email: string;
  fullName: string | null;
  preferredLocale: string;
  role: AppRole;
  membershipStatus: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantLocale: string;
  tenantTimezone: string;
  userActive: boolean;
  tenantActive: boolean;
};

export function resolveSessionSigningSecret(input: {
  authSecret?: string;
  productionRuntime: boolean;
}) {
  if (input.authSecret?.trim()) {
    return input.authSecret.trim();
  }

  if (input.productionRuntime) {
    throw new Error(
      "AUTH_SECRET is required to sign application sessions in production.",
    );
  }

  return "local-dev-session-secret";
}

function getSessionSigningSecret() {
  return resolveSessionSigningSecret({
    authSecret: env.AUTH_SECRET,
    productionRuntime:
      process.env.NODE_ENV === "production" ||
      env.NEXT_PUBLIC_APP_URL.startsWith("https://"),
  });
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: secureCookies,
    path: "/",
    maxAge: sessionMaxAgeSeconds,
  };
}

export function getLocaleCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: secureCookies,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}

function signPayload(value: string) {
  return createHmac("sha256", getSessionSigningSecret()).update(value).digest("base64url");
}

function encodeSessionToken(payload: SessionTokenPayload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(body);

  return `${body}.${signature}`;
}

function decodeSessionToken(value: string): SessionTokenPayload | null {
  const [body, signature] = value.split(".");

  if (!body || !signature) {
    return null;
  }

  const expectedSignature = Buffer.from(signPayload(body), "utf8");
  const providedSignature = Buffer.from(signature, "utf8");

  if (expectedSignature.length !== providedSignature.length) {
    return null;
  }

  if (!timingSafeEqual(expectedSignature, providedSignature)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionTokenPayload;

    if (!parsed.userId || !parsed.tenantId || !Number.isFinite(parsed.issuedAt)) {
      return null;
    }

    if (Date.now() - parsed.issuedAt > sessionMaxAgeSeconds * 1000) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function createSessionCookieValue(args: { userId: string; tenantId: string }) {
  return encodeSessionToken({
    userId: args.userId,
    tenantId: args.tenantId,
    issuedAt: Date.now(),
  });
}

const getSessionByCookieValue = cache(async (rawSession: string): Promise<AppSession | null> => {
  if (!db) {
    return null;
  }

  const token = decodeSessionToken(rawSession);

  if (!token) {
    return null;
  }

  const [sessionRow] = await db
    .select({
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      preferredLocale: users.preferredLocale,
      role: tenantMemberships.role,
      membershipStatus: tenantMemberships.status,
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      tenantLocale: tenants.defaultLocale,
      tenantTimezone: tenants.timezone,
      userActive: users.active,
      tenantActive: tenants.active,
    })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
    .where(
      and(
        eq(tenantMemberships.userId, token.userId),
        eq(tenantMemberships.tenantId, token.tenantId),
      ),
    )
    .limit(1);

  if (
    !sessionRow ||
    !sessionRow.userActive ||
    !sessionRow.tenantActive ||
    sessionRow.membershipStatus !== "active"
  ) {
    return null;
  }

  const role = sessionRow.role as AppRole;
  const effectiveLocale = sessionRow.preferredLocale || sessionRow.tenantLocale;

  return {
    user: {
      id: sessionRow.userId,
      email: sessionRow.email,
      fullName: sessionRow.fullName ?? sessionRow.email,
      role,
      preferredLocale: effectiveLocale,
    },
    tenant: {
      id: sessionRow.tenantId,
      name: sessionRow.tenantName,
      slug: sessionRow.tenantSlug,
      locale: effectiveLocale,
      timezone: sessionRow.tenantTimezone,
    },
    permissions: rolePermissions[role],
  };
});

async function resolveSessionFromMembershipRows(rows: SessionLookupRow[]): Promise<AppSession | null> {
  if (rows.length === 0) {
    return null;
  }

  const cookieStore = await cookies();
  const preferredTenantId = cookieStore.get(activeTenantCookieName)?.value;
  const sessionRow =
    rows.find((row) => row.tenantId === preferredTenantId) ??
    rows.find((row) => row.membershipStatus === "active") ??
    rows[0];

  if (
    !sessionRow ||
    !sessionRow.userActive ||
    !sessionRow.tenantActive ||
    sessionRow.membershipStatus !== "active"
  ) {
    return null;
  }

  const role = sessionRow.role as AppRole;
  const effectiveLocale = sessionRow.preferredLocale || sessionRow.tenantLocale;

  return {
    user: {
      id: sessionRow.userId,
      email: sessionRow.email,
      fullName: sessionRow.fullName ?? sessionRow.email,
      role,
      preferredLocale: effectiveLocale,
    },
    tenant: {
      id: sessionRow.tenantId,
      name: sessionRow.tenantName,
      slug: sessionRow.tenantSlug,
      locale: effectiveLocale,
      timezone: sessionRow.tenantTimezone,
    },
    permissions: rolePermissions[role],
  };
}

async function getSupabaseBackedSession(): Promise<AppSession | null> {
  if (!db || !isSupabaseAuthEnabled()) {
    return null;
  }

  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return null;
  }

  const appUser = await acceptWorkspaceInvitesForSupabaseUser({
    supabaseUser: {
      id: user.id,
    email: user.email,
    fullName:
      (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
      (typeof user.user_metadata?.name === "string" && user.user_metadata.name) ||
      null,
    preferredLocale:
      (typeof user.user_metadata?.preferred_locale === "string" && user.user_metadata.preferred_locale) ||
      (typeof user.user_metadata?.locale === "string" && user.user_metadata.locale) ||
      null,
    },
    now: new Date(),
    repository: createDrizzleWorkspaceInviteRepository(),
  });

  if (!appUser) {
    return null;
  }

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      preferredLocale: users.preferredLocale,
      role: tenantMemberships.role,
      membershipStatus: tenantMemberships.status,
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      tenantLocale: tenants.defaultLocale,
      tenantTimezone: tenants.timezone,
      userActive: users.active,
      tenantActive: tenants.active,
    })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
    .where(eq(tenantMemberships.userId, appUser.userId));

  return resolveSessionFromMembershipRows(rows);
}

/**
 * Picks which workspace a freshly minted session cookie should point at.
 * Honors the operator's last active workspace when they still belong to it.
 */
export function selectSessionTenantId(args: {
  memberships: Array<{ tenantId: string }>;
  preferredTenantId?: string | null;
}): string | null {
  const preferred = args.preferredTenantId?.trim();

  if (preferred && args.memberships.some((membership) => membership.tenantId === preferred)) {
    return preferred;
  }

  return args.memberships[0]?.tenantId ?? null;
}

export const getOptionalSession = cache(async (): Promise<AppSession | null> => {
  // Read cookies before any short-circuit. A build-time render has no database,
  // and returning early without touching a dynamic API let Next prerender the
  // signed-out redirect and serve that cached payload to signed-in operators.
  const cookieStore = await cookies();

  if (!db) {
    return null;
  }

  // The signed application cookie is authoritative. Server components cannot
  // persist refreshed Supabase tokens, so resolving identity from Supabase on
  // every render rotates the refresh token without saving it and logs the
  // operator out mid-navigation.
  const rawSession = cookieStore.get(sessionCookieName)?.value;

  if (rawSession) {
    const cookieSession = await getSessionByCookieValue(rawSession);

    if (cookieSession) {
      return cookieSession;
    }
  }

  if (isSupabaseAuthEnabled()) {
    return getSupabaseBackedSession();
  }

  return null;
});

export async function getSession(): Promise<AppSession> {
  const session = await getOptionalSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function getSessionForTenant(tenantId?: string | null) {
  const session = await getOptionalSession();

  if (!session) {
    return null;
  }

  if (tenantId && session.tenant.id !== tenantId) {
    return null;
  }

  return session;
}

export async function getAvailableWorkspacesForSession(session: AppSession): Promise<AvailableWorkspace[]> {
  if (!db) {
    return [];
  }

  return db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      role: tenantMemberships.role,
    })
    .from(tenantMemberships)
    .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
    .where(
      and(
        eq(tenantMemberships.userId, session.user.id),
        eq(tenantMemberships.status, "active"),
        eq(tenants.active, true),
      ),
    )
    .orderBy(asc(tenants.name));
}
