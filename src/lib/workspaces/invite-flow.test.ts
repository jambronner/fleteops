import assert from "node:assert/strict";
import { test } from "node:test";

import type { AppRole } from "@/lib/auth/roles";

import {
  acceptWorkspaceInvitesForSupabaseUser,
  buildWorkspaceInviteRedirectUrl,
  createWorkspaceInvite,
  normalizeWorkspaceInviteEmail,
  resendWorkspaceInvite,
  WorkspaceInviteFlowError,
  type WorkspaceInviteFlowRepository,
} from "./invite-flow";

type InviteRecord = {
  id: string;
  tenantId: string;
  email: string;
  role: AppRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedByUserId: string | null;
  acceptedByUserId: string | null;
  expiresAt: Date | null;
  acceptedAt: Date | null;
  metadata: Record<string, unknown> | null;
};

type AppUserRecord = {
  id: string;
  authProvider: string;
  authSubject: string;
  email: string;
  fullName: string;
  preferredLocale: string;
};

class InMemoryWorkspaceInviteRepository implements WorkspaceInviteFlowRepository {
  readonly events: string[] = [];
  readonly invites = new Map<string, InviteRecord>();
  readonly users = new Map<string, AppUserRecord>();
  readonly memberships = new Map<string, { tenantId: string; userId: string; role: AppRole; status: "active" | "suspended" | "revoked" }>();
  private inviteSequence = 0;
  private userSequence = 0;

  async findActiveMembershipByEmail(tenantId: string, email: string) {
    for (const user of this.users.values()) {
      if (user.email !== email) {
        continue;
      }

      const membership = this.memberships.get(`${tenantId}:${user.id}`);
      if (membership?.status === "active") {
        return { userId: user.id };
      }
    }

    return null;
  }

  async findPendingInviteByEmail(tenantId: string, email: string, now: Date) {
    for (const invite of this.invites.values()) {
      if (
        invite.tenantId === tenantId &&
        invite.email === email &&
        invite.status === "pending" &&
        (!invite.expiresAt || invite.expiresAt > now)
      ) {
        return invite;
      }
    }

    return null;
  }

  async findPendingInviteById(tenantId: string, inviteId: string, now: Date) {
    const invite = this.invites.get(inviteId);

    if (
      invite?.tenantId === tenantId &&
      invite.status === "pending" &&
      (!invite.expiresAt || invite.expiresAt > now)
    ) {
      return invite;
    }

    return null;
  }

  async createPendingInvite(input: {
    tenantId: string;
    email: string;
    role: AppRole;
    invitedByUserId: string;
    expiresAt: Date;
    metadata?: Record<string, unknown>;
  }) {
    this.events.push("create-pending-invite");
    const invite: InviteRecord = {
      id: `invite-${++this.inviteSequence}`,
      tenantId: input.tenantId,
      email: input.email,
      role: input.role,
      status: "pending",
      invitedByUserId: input.invitedByUserId,
      acceptedByUserId: null,
      expiresAt: input.expiresAt,
      acceptedAt: null,
      metadata: input.metadata ?? null,
    };
    this.invites.set(invite.id, invite);
    return invite;
  }

  async updatePendingInvite(input: {
    inviteId: string;
    role: AppRole;
    invitedByUserId: string;
    expiresAt: Date;
    updatedAt: Date;
    metadata?: Record<string, unknown>;
  }) {
    this.events.push("update-pending-invite");
    const invite = this.invites.get(input.inviteId);
    assert.ok(invite);
    invite.role = input.role;
    invite.invitedByUserId = input.invitedByUserId;
    invite.expiresAt = input.expiresAt;
    invite.metadata = { ...(invite.metadata ?? {}), ...(input.metadata ?? {}) };
    return invite;
  }

  async markInviteEmailSent(input: { inviteId: string; sentAt: Date; supabaseAuthUserId?: string | null }) {
    this.events.push("mark-email-sent");
    const invite = this.invites.get(input.inviteId);
    assert.ok(invite);
    invite.metadata = {
      ...(invite.metadata ?? {}),
      last_sent_at: input.sentAt.toISOString(),
      supabase_auth_user_id: input.supabaseAuthUserId ?? null,
    };
  }

  async findPendingInvitesByEmail(email: string, now: Date) {
    return [...this.invites.values()].filter(
      (invite) => invite.email === email && invite.status === "pending" && (!invite.expiresAt || invite.expiresAt > now),
    );
  }

  async upsertSupabaseUser(input: {
    authSubject: string;
    email: string;
    fullName?: string | null;
    preferredLocale?: string | null;
  }) {
    this.events.push("upsert-supabase-user");
    const bySubject = [...this.users.values()].find(
      (user) => user.authProvider === "supabase" && user.authSubject === input.authSubject,
    );
    const byEmail = [...this.users.values()].find((user) => user.email === input.email);
    const existing = bySubject ?? byEmail;

    if (existing) {
      existing.authProvider = "supabase";
      existing.authSubject = input.authSubject;
      existing.email = input.email;
      existing.fullName = input.fullName ?? input.email;
      existing.preferredLocale = input.preferredLocale ?? existing.preferredLocale;
      return { id: existing.id };
    }

    const created: AppUserRecord = {
      id: `user-${++this.userSequence}`,
      authProvider: "supabase",
      authSubject: input.authSubject,
      email: input.email,
      fullName: input.fullName ?? input.email,
      preferredLocale: input.preferredLocale ?? "es-MX",
    };
    this.users.set(created.id, created);
    return { id: created.id };
  }

  async activateMembership(input: { tenantId: string; userId: string; role: AppRole; now: Date }) {
    this.events.push("activate-membership");
    this.memberships.set(`${input.tenantId}:${input.userId}`, {
      tenantId: input.tenantId,
      userId: input.userId,
      role: input.role,
      status: "active",
    });
  }

  async markInviteAccepted(input: { inviteId: string; acceptedByUserId: string; acceptedAt: Date }) {
    this.events.push("mark-invite-accepted");
    const invite = this.invites.get(input.inviteId);
    assert.ok(invite);
    invite.status = "accepted";
    invite.acceptedByUserId = input.acceptedByUserId;
    invite.acceptedAt = input.acceptedAt;
  }

  async findActiveMembershipsForUser(userId: string) {
    return [...this.memberships.values()]
      .filter((membership) => membership.userId === userId && membership.status === "active")
      .map((membership) => ({ tenantId: membership.tenantId, role: membership.role }));
  }

  async writeAuditLog() {
    this.events.push("write-audit-log");
  }
}

test("normalizeWorkspaceInviteEmail trims and lowercases invite addresses", () => {
  assert.equal(normalizeWorkspaceInviteEmail("  New.Member@Example.COM "), "new.member@example.com");
});

test("buildWorkspaceInviteRedirectUrl routes invite acceptance through the auth callback and setup page", () => {
  assert.equal(
    buildWorkspaceInviteRedirectUrl("https://app.example.com").toString(),
    "https://app.example.com/auth/callback?next=%2Fauth%2Fsetup",
  );
});

test("createWorkspaceInvite stores the pending invite before sending the Supabase email", async () => {
  const repository = new InMemoryWorkspaceInviteRepository();
  const now = new Date("2026-05-12T12:00:00.000Z");

  const result = await createWorkspaceInvite({
    actor: {
      tenantId: "tenant-a",
      userId: "admin-a",
    },
    input: {
      email: " Operator@Example.COM ",
      role: "operator",
    },
    appUrl: "https://app.example.com",
    now,
    repository,
    auth: {
      async sendInviteAccessEmail(email, options) {
        assert.equal(repository.events[0], "create-pending-invite");
        assert.equal(email, "operator@example.com");
        assert.equal(options.redirectTo, "https://app.example.com/auth/callback?next=%2Fauth%2Fsetup");
        assert.equal(options.hasSupabaseAuthUser, false);
        assert.deepEqual(options.data, {
          tenant_id: "tenant-a",
          invited_role: "operator",
        });
        return { deliveryKind: "invite", supabaseAuthUserId: "supabase-user-1" };
      },
    },
  });

  assert.equal(result.deliveryKind, "invite");
  assert.equal(result.invite.email, "operator@example.com");
  assert.equal(result.invite.role, "operator");
  assert.deepEqual(repository.events, [
    "create-pending-invite",
    "mark-email-sent",
    "write-audit-log",
  ]);
  assert.equal(repository.invites.get(result.invite.id)?.metadata?.supabase_auth_user_id, "supabase-user-1");
});

test("createWorkspaceInvite can deliver access with a magic link for existing Supabase users", async () => {
  const repository = new InMemoryWorkspaceInviteRepository();
  const now = new Date("2026-05-12T12:00:00.000Z");

  const result = await createWorkspaceInvite({
    actor: {
      tenantId: "tenant-a",
      userId: "admin-a",
    },
    input: {
      email: "existing-auth@example.com",
      role: "viewer",
    },
    appUrl: "https://app.example.com",
    now,
    repository,
    auth: {
      async sendInviteAccessEmail(email, options) {
        assert.equal(email, "existing-auth@example.com");
        assert.equal(options.hasSupabaseAuthUser, false);
        return { deliveryKind: "magic_link", supabaseAuthUserId: null };
      },
    },
  });

  assert.equal(result.deliveryKind, "magic_link");
  assert.equal(repository.invites.get(result.invite.id)?.metadata?.last_sent_at, now.toISOString());
});

test("createWorkspaceInvite reports Supabase email rate limits distinctly", async () => {
  const repository = new InMemoryWorkspaceInviteRepository();

  await assert.rejects(
    createWorkspaceInvite({
      actor: { tenantId: "tenant-a", userId: "admin-a" },
      input: { email: "rate-limited@example.com", role: "viewer" },
      appUrl: "https://app.example.com",
      now: new Date("2026-05-12T12:00:00.000Z"),
      repository,
      auth: {
        async sendInviteAccessEmail() {
          const error = new Error("email rate limit exceeded");
          Object.assign(error, { code: "over_email_send_rate_limit" });
          throw error;
        },
      },
    }),
    (error) => error instanceof WorkspaceInviteFlowError && error.code === "invite_rate_limited",
  );
});

test("workspace invite flow grants access only after the invited user signs in", async () => {
  const repository = new InMemoryWorkspaceInviteRepository();
  const now = new Date("2026-05-12T12:00:00.000Z");
  const invitedEmails: string[] = [];

  await createWorkspaceInvite({
    actor: { tenantId: "tenant-a", userId: "admin-a" },
    input: { email: " Dispatcher@Example.COM ", role: "operator" },
    appUrl: "https://app.example.com",
    now,
    repository,
    auth: {
      async sendInviteAccessEmail(email) {
        invitedEmails.push(email);
        return { deliveryKind: "invite", supabaseAuthUserId: "supabase-dispatcher" };
      },
    },
  });

  const beforeAcceptance = await acceptWorkspaceInvitesForSupabaseUser({
    supabaseUser: {
      id: "supabase-other",
      email: "other@example.com",
      fullName: "Other User",
      preferredLocale: "en",
    },
    now,
    repository,
  });

  const afterAcceptance = await acceptWorkspaceInvitesForSupabaseUser({
    supabaseUser: {
      id: "supabase-dispatcher",
      email: "dispatcher@example.com",
      fullName: "Demo Operator",
      preferredLocale: "en",
    },
    now,
    repository,
  });

  assert.deepEqual(invitedEmails, ["dispatcher@example.com"]);
  assert.deepEqual(beforeAcceptance.activeMemberships, []);
  assert.deepEqual(afterAcceptance.acceptedInviteIds, ["invite-1"]);
  assert.deepEqual(afterAcceptance.activeMemberships, [{ tenantId: "tenant-a", role: "operator" }]);
  assert.equal(repository.invites.get("invite-1")?.acceptedByUserId, afterAcceptance.userId);
  assert.equal(repository.memberships.get(`tenant-a:${afterAcceptance.userId}`)?.status, "active");
});

test("resendWorkspaceInvite sends a fresh access email for an existing pending invite", async () => {
  const repository = new InMemoryWorkspaceInviteRepository();
  const createdAt = new Date("2026-05-12T12:00:00.000Z");
  const resentAt = new Date("2026-05-13T15:30:00.000Z");
  const sent: Array<{
    email: string;
    hasSupabaseAuthUser: boolean;
    redirectTo: string;
  }> = [];

  await createWorkspaceInvite({
    actor: { tenantId: "tenant-a", userId: "admin-a" },
    input: { email: "operator@example.com", role: "operator" },
    appUrl: "https://app.example.com",
    now: createdAt,
    repository,
    auth: {
      async sendInviteAccessEmail() {
        return { deliveryKind: "invite", supabaseAuthUserId: "supabase-operator" };
      },
    },
  });

  const result = await resendWorkspaceInvite({
    actor: { tenantId: "tenant-a", userId: "admin-a" },
    inviteId: "invite-1",
    appUrl: "https://app.example.com",
    now: resentAt,
    repository,
    auth: {
      async sendInviteAccessEmail(email, options) {
        sent.push({
          email,
          hasSupabaseAuthUser: options.hasSupabaseAuthUser,
          redirectTo: options.redirectTo,
        });
        return { deliveryKind: "magic_link", supabaseAuthUserId: "supabase-operator" };
      },
    },
  });

  assert.deepEqual(sent, [
    {
      email: "operator@example.com",
      hasSupabaseAuthUser: true,
      redirectTo: "https://app.example.com/auth/callback?next=%2Fauth%2Fsetup",
    },
  ]);
  assert.equal(result.deliveryKind, "magic_link");
  assert.equal(result.invite.id, "invite-1");
  assert.equal(repository.invites.get("invite-1")?.metadata?.last_sent_at, resentAt.toISOString());
  assert.equal(repository.invites.get("invite-1")?.metadata?.last_resend_requested_at, resentAt.toISOString());
  assert.equal(repository.invites.get("invite-1")?.metadata?.supabase_auth_user_id, "supabase-operator");
  assert.deepEqual(repository.events.slice(-3), [
    "update-pending-invite",
    "mark-email-sent",
    "write-audit-log",
  ]);
});

test("acceptWorkspaceInvitesForSupabaseUser activates only matching pending invites", async () => {
  const repository = new InMemoryWorkspaceInviteRepository();
  const now = new Date("2026-05-12T12:00:00.000Z");

  await createWorkspaceInvite({
    actor: { tenantId: "tenant-a", userId: "admin-a" },
    input: { email: "member@example.com", role: "finance" },
    appUrl: "https://app.example.com",
    now,
    repository,
    auth: {
      async sendInviteAccessEmail() {
        return { deliveryKind: "invite", supabaseAuthUserId: "supabase-user-2" };
      },
    },
  });

  const result = await acceptWorkspaceInvitesForSupabaseUser({
    supabaseUser: {
      id: "supabase-user-2",
      email: "MEMBER@example.com",
      fullName: "Finance Member",
      preferredLocale: "en",
    },
    now,
    repository,
  });

  assert.equal(result.userId, "user-1");
  assert.deepEqual(result.acceptedInviteIds, ["invite-1"]);
  assert.deepEqual(result.activeMemberships, [{ tenantId: "tenant-a", role: "finance" }]);
  assert.equal(repository.invites.get("invite-1")?.status, "accepted");
  assert.equal(repository.memberships.get("tenant-a:user-1")?.status, "active");
});

test("acceptWorkspaceInvitesForSupabaseUser does not fabricate workspace access without membership or invite", async () => {
  const repository = new InMemoryWorkspaceInviteRepository();

  const result = await acceptWorkspaceInvitesForSupabaseUser({
    supabaseUser: {
      id: "supabase-user-3",
      email: "noaccess@example.com",
      fullName: null,
      preferredLocale: null,
    },
    now: new Date("2026-05-12T12:00:00.000Z"),
    repository,
  });

  assert.equal(result.userId, "user-1");
  assert.deepEqual(result.acceptedInviteIds, []);
  assert.deepEqual(result.activeMemberships, []);
});

test("createWorkspaceInvite rejects invitations for existing active members", async () => {
  const repository = new InMemoryWorkspaceInviteRepository();
  repository.users.set("user-existing", {
    id: "user-existing",
    authProvider: "supabase",
    authSubject: "supabase-existing",
    email: "existing@example.com",
    fullName: "Existing Member",
    preferredLocale: "en",
  });
  repository.memberships.set("tenant-a:user-existing", {
    tenantId: "tenant-a",
    userId: "user-existing",
    role: "viewer",
    status: "active",
  });

  await assert.rejects(
    createWorkspaceInvite({
      actor: { tenantId: "tenant-a", userId: "admin-a" },
      input: { email: "existing@example.com", role: "operator" },
      appUrl: "https://app.example.com",
      now: new Date("2026-05-12T12:00:00.000Z"),
      repository,
      auth: {
        async sendInviteAccessEmail() {
          throw new Error("should not send");
        },
      },
    }),
    /already an active member/,
  );
});
