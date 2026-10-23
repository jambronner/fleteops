import type { AppRole } from "@/lib/auth/roles";

export type WorkspaceMemberManagementInvite = {
  id: string;
  tenantId: string;
  email: string;
  role: AppRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: Date | null;
  metadata: Record<string, unknown> | null;
};

export type WorkspaceMemberManagementMembership = {
  tenantId: string;
  userId: string;
  email: string;
  fullName: string | null;
  role: AppRole;
  status: "active" | "suspended" | "revoked" | "invited";
};

export type WorkspaceMemberManagementRepository = {
  findPendingInviteById(tenantId: string, inviteId: string): Promise<WorkspaceMemberManagementInvite | null>;
  revokePendingInvite(input: {
    tenantId: string;
    inviteId: string;
    revokedAt: Date;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  findWorkspaceMembership(
    tenantId: string,
    userId: string,
  ): Promise<WorkspaceMemberManagementMembership | null>;
  countActiveAdmins(tenantId: string): Promise<number>;
  revokeWorkspaceMembership(input: {
    tenantId: string;
    userId: string;
    revokedAt: Date;
  }): Promise<void>;
  writeAuditLog(input: {
    tenantId: string;
    entityType: string;
    entityId: string;
    action: string;
    actorUserId: string;
    summary: string;
    payload?: Record<string, unknown>;
  }): Promise<void>;
};

export class WorkspaceMemberManagementError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invite_not_found"
      | "member_not_found"
      | "cannot_remove_self"
      | "last_admin",
  ) {
    super(message);
  }
}

export async function revokeWorkspaceInvite(args: {
  actor: {
    tenantId: string;
    userId: string;
  };
  inviteId: string;
  now: Date;
  repository: WorkspaceMemberManagementRepository;
}) {
  const invite = await args.repository.findPendingInviteById(args.actor.tenantId, args.inviteId);

  if (!invite) {
    throw new WorkspaceMemberManagementError("Pending invite was not found.", "invite_not_found");
  }

  await args.repository.revokePendingInvite({
    tenantId: args.actor.tenantId,
    inviteId: invite.id,
    revokedAt: args.now,
    metadata: {
      ...(invite.metadata ?? {}),
      revoked_at: args.now.toISOString(),
      revoked_by_user_id: args.actor.userId,
      revoke_reason: "workspace_admin_removed",
    },
  });

  await args.repository.writeAuditLog({
    tenantId: args.actor.tenantId,
    entityType: "workspace_invite",
    entityId: invite.id,
    action: "workspace_invite.revoked",
    actorUserId: args.actor.userId,
    summary: `${invite.email} pending invite revoked.`,
    payload: {
      email: invite.email,
      role: invite.role,
      revoked_at: args.now.toISOString(),
    },
  });

  return invite;
}

export async function removeWorkspaceMember(args: {
  actor: {
    tenantId: string;
    userId: string;
  };
  memberUserId: string;
  now: Date;
  repository: WorkspaceMemberManagementRepository;
}) {
  if (args.memberUserId === args.actor.userId) {
    throw new WorkspaceMemberManagementError("Admins cannot remove their own workspace access.", "cannot_remove_self");
  }

  const membership = await args.repository.findWorkspaceMembership(args.actor.tenantId, args.memberUserId);

  if (!membership) {
    throw new WorkspaceMemberManagementError("Workspace member was not found.", "member_not_found");
  }

  if (membership.status === "active" && membership.role === "admin") {
    const activeAdminCount = await args.repository.countActiveAdmins(args.actor.tenantId);

    if (activeAdminCount <= 1) {
      throw new WorkspaceMemberManagementError("At least one active admin is required.", "last_admin");
    }
  }

  await args.repository.revokeWorkspaceMembership({
    tenantId: args.actor.tenantId,
    userId: membership.userId,
    revokedAt: args.now,
  });

  await args.repository.writeAuditLog({
    tenantId: args.actor.tenantId,
    entityType: "workspace_member",
    entityId: membership.userId,
    action: "workspace_member.revoked",
    actorUserId: args.actor.userId,
    summary: `${membership.email} workspace access removed.`,
    payload: {
      email: membership.email,
      role: membership.role,
      previous_status: membership.status,
      revoked_at: args.now.toISOString(),
    },
  });

  return membership;
}
