import assert from "node:assert/strict";
import { test } from "node:test";

import type { AppRole } from "@/lib/auth/roles";

import {
  removeWorkspaceMember,
  revokeWorkspaceInvite,
  WorkspaceMemberManagementError,
  type WorkspaceMemberManagementInvite,
  type WorkspaceMemberManagementMembership,
  type WorkspaceMemberManagementRepository,
} from "./member-management";

class InMemoryWorkspaceMemberManagementRepository implements WorkspaceMemberManagementRepository {
  readonly audits: Array<{ action: string; entityId: string; payload?: Record<string, unknown> }> = [];
  readonly invites = new Map<string, WorkspaceMemberManagementInvite>();
  readonly memberships = new Map<string, WorkspaceMemberManagementMembership>();

  async findPendingInviteById(tenantId: string, inviteId: string) {
    const invite = this.invites.get(inviteId);

    if (invite?.tenantId === tenantId && invite.status === "pending") {
      return invite;
    }

    return null;
  }

  async revokePendingInvite(input: {
    tenantId: string;
    inviteId: string;
    revokedAt: Date;
    metadata: Record<string, unknown>;
  }) {
    const invite = this.invites.get(input.inviteId);
    assert.ok(invite);
    invite.status = "revoked";
    invite.expiresAt = input.revokedAt;
    invite.metadata = input.metadata;
  }

  async findWorkspaceMembership(tenantId: string, userId: string) {
    return this.memberships.get(`${tenantId}:${userId}`) ?? null;
  }

  async countActiveAdmins(tenantId: string) {
    return [...this.memberships.values()].filter(
      (membership) => membership.tenantId === tenantId && membership.status === "active" && membership.role === "admin",
    ).length;
  }

  async revokeWorkspaceMembership(input: { tenantId: string; userId: string; revokedAt: Date }) {
    const membership = this.memberships.get(`${input.tenantId}:${input.userId}`);
    assert.ok(membership);
    membership.status = "revoked";
  }

  async writeAuditLog(input: {
    entityId: string;
    action: string;
    payload?: Record<string, unknown>;
  }) {
    this.audits.push({
      action: input.action,
      entityId: input.entityId,
      payload: input.payload,
    });
  }
}

function membership(input: {
  userId: string;
  email: string;
  role: AppRole;
  status?: "active" | "suspended" | "revoked" | "invited";
}): WorkspaceMemberManagementMembership {
  return {
    tenantId: "tenant-a",
    userId: input.userId,
    email: input.email,
    fullName: null,
    role: input.role,
    status: input.status ?? "active",
  };
}

test("revokeWorkspaceInvite revokes a pending invite without deleting the auth user", async () => {
  const repository = new InMemoryWorkspaceMemberManagementRepository();
  const now = new Date("2026-05-16T12:00:00.000Z");
  repository.invites.set("invite-1", {
    id: "invite-1",
    tenantId: "tenant-a",
    email: "pending@example.com",
    role: "viewer",
    status: "pending",
    expiresAt: new Date("2026-05-30T12:00:00.000Z"),
    metadata: { last_sent_at: "2026-05-16T11:00:00.000Z" },
  });

  await revokeWorkspaceInvite({
    actor: { tenantId: "tenant-a", userId: "admin-a" },
    inviteId: "invite-1",
    now,
    repository,
  });

  const invite = repository.invites.get("invite-1");
  assert.equal(invite?.status, "revoked");
  assert.equal(invite?.expiresAt, now);
  assert.equal(invite?.metadata?.revoked_by_user_id, "admin-a");
  assert.deepEqual(repository.audits.map((audit) => audit.action), ["workspace_invite.revoked"]);
});

test("removeWorkspaceMember revokes member access and keeps another active admin", async () => {
  const repository = new InMemoryWorkspaceMemberManagementRepository();
  repository.memberships.set("tenant-a:admin-a", membership({ userId: "admin-a", email: "admin@example.com", role: "admin" }));
  repository.memberships.set("tenant-a:admin-b", membership({ userId: "admin-b", email: "other-admin@example.com", role: "admin" }));
  repository.memberships.set("tenant-a:viewer-a", membership({ userId: "viewer-a", email: "viewer@example.com", role: "viewer" }));

  await removeWorkspaceMember({
    actor: { tenantId: "tenant-a", userId: "admin-a" },
    memberUserId: "viewer-a",
    now: new Date("2026-05-16T12:00:00.000Z"),
    repository,
  });

  assert.equal(repository.memberships.get("tenant-a:viewer-a")?.status, "revoked");
  assert.deepEqual(repository.audits.map((audit) => audit.action), ["workspace_member.revoked"]);
});

test("removeWorkspaceMember prevents self-removal and last-admin removal", async () => {
  const repository = new InMemoryWorkspaceMemberManagementRepository();
  repository.memberships.set("tenant-a:admin-a", membership({ userId: "admin-a", email: "admin@example.com", role: "admin" }));

  await assert.rejects(
    removeWorkspaceMember({
      actor: { tenantId: "tenant-a", userId: "admin-a" },
      memberUserId: "admin-a",
      now: new Date("2026-05-16T12:00:00.000Z"),
      repository,
    }),
    (error) => error instanceof WorkspaceMemberManagementError && error.code === "cannot_remove_self",
  );

  repository.memberships.get("tenant-a:admin-a")!.status = "suspended";
  repository.memberships.set("tenant-a:admin-b", membership({ userId: "admin-b", email: "other-admin@example.com", role: "admin" }));

  await assert.rejects(
    removeWorkspaceMember({
      actor: { tenantId: "tenant-a", userId: "admin-a" },
      memberUserId: "admin-b",
      now: new Date("2026-05-16T12:00:00.000Z"),
      repository,
    }),
    (error) => error instanceof WorkspaceMemberManagementError && error.code === "last_admin",
  );
});
