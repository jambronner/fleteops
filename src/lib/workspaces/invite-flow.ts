import type { AppRole } from "@/lib/auth/roles";

export const workspaceInviteSetupPath = "/auth/setup";
export const workspaceNoAccessPath = "/auth/no-access";
export const workspaceInviteTtlDays = 14;

export type WorkspaceInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type WorkspaceInviteRecord = {
  id: string;
  tenantId: string;
  email: string;
  role: AppRole;
  status: WorkspaceInviteStatus;
  invitedByUserId: string | null;
  acceptedByUserId: string | null;
  expiresAt: Date | null;
  acceptedAt: Date | null;
  metadata: Record<string, unknown> | null;
};

export type ActiveWorkspaceMembership = {
  tenantId: string;
  role: AppRole;
};

export type WorkspaceInviteFlowRepository = {
  findActiveMembershipByEmail(tenantId: string, email: string): Promise<{ userId: string } | null>;
  findPendingInviteByEmail(tenantId: string, email: string, now: Date): Promise<WorkspaceInviteRecord | null>;
  findPendingInviteById(tenantId: string, inviteId: string, now: Date): Promise<WorkspaceInviteRecord | null>;
  createPendingInvite(input: {
    tenantId: string;
    email: string;
    role: AppRole;
    invitedByUserId: string;
    expiresAt: Date;
    metadata?: Record<string, unknown>;
  }): Promise<WorkspaceInviteRecord>;
  updatePendingInvite(input: {
    inviteId: string;
    role: AppRole;
    invitedByUserId: string;
    expiresAt: Date;
    updatedAt: Date;
    metadata?: Record<string, unknown>;
  }): Promise<WorkspaceInviteRecord>;
  markInviteEmailSent(input: {
    inviteId: string;
    sentAt: Date;
    supabaseAuthUserId?: string | null;
  }): Promise<void>;
  findPendingInvitesByEmail(email: string, now: Date): Promise<WorkspaceInviteRecord[]>;
  upsertSupabaseUser(input: {
    authSubject: string;
    email: string;
    fullName?: string | null;
    preferredLocale?: string | null;
  }): Promise<{ id: string }>;
  activateMembership(input: {
    tenantId: string;
    userId: string;
    role: AppRole;
    now: Date;
  }): Promise<void>;
  markInviteAccepted(input: {
    inviteId: string;
    acceptedByUserId: string;
    acceptedAt: Date;
  }): Promise<void>;
  findActiveMembershipsForUser(userId: string): Promise<ActiveWorkspaceMembership[]>;
  writeAuditLog(input: {
    tenantId: string;
    entityType: string;
    entityId: string;
    action: string;
    actorUserId?: string | null;
    summary: string;
    payload?: Record<string, unknown>;
  }): Promise<void>;
};

type WorkspaceInviteEmailDelivery = {
  deliveryKind: "invite" | "magic_link";
  supabaseAuthUserId?: string | null;
};

export type WorkspaceInviteAuthClient = {
  sendInviteAccessEmail(
    email: string,
    options: {
      redirectTo: string;
      data: Record<string, string>;
      hasSupabaseAuthUser: boolean;
    },
  ): Promise<WorkspaceInviteEmailDelivery>;
};

export type WorkspaceInviteResendAuthClient = WorkspaceInviteAuthClient;

export class WorkspaceInviteFlowError extends Error {
  constructor(
    message: string,
    readonly code: "already_member" | "invalid_email" | "invite_not_found" | "invite_send_failed" | "invite_rate_limited",
  ) {
    super(message);
  }
}

export function normalizeWorkspaceInviteEmail(email: string) {
  const normalized = email.trim().toLowerCase();

  if (!normalized || !normalized.includes("@")) {
    throw new WorkspaceInviteFlowError("A valid email address is required.", "invalid_email");
  }

  return normalized;
}

export function buildWorkspaceInviteRedirectUrl(appUrl: string, nextPath = workspaceInviteSetupPath) {
  const redirectTo = new URL("/auth/callback", appUrl);
  redirectTo.searchParams.set("next", nextPath);
  return redirectTo;
}

function inviteExpiryFrom(now: Date) {
  return new Date(now.getTime() + workspaceInviteTtlDays * 24 * 60 * 60 * 1000);
}

function inviteSendError(error: unknown, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const errorCode =
    error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
  const signature = `${errorCode} ${message}`;

  if (/over_email_send_rate_limit|rate limit/i.test(signature)) {
    return new WorkspaceInviteFlowError(message, "invite_rate_limited");
  }

  return new WorkspaceInviteFlowError(message, "invite_send_failed");
}

export async function createWorkspaceInvite(args: {
  actor: {
    tenantId: string;
    userId: string;
  };
  input: {
    email: string;
    role: AppRole;
  };
  appUrl: string;
  now: Date;
  repository: WorkspaceInviteFlowRepository;
  auth: WorkspaceInviteAuthClient;
}) {
  const email = normalizeWorkspaceInviteEmail(args.input.email);
  const existingMember = await args.repository.findActiveMembershipByEmail(args.actor.tenantId, email);

  if (existingMember) {
    throw new WorkspaceInviteFlowError(`${email} is already an active member.`, "already_member");
  }

  const expiresAt = inviteExpiryFrom(args.now);
  const redirectTo = buildWorkspaceInviteRedirectUrl(args.appUrl).toString();
  const metadata = {
    invite_redirect_to: redirectTo,
    invited_via: "workspace_member_admin",
  };

  const existingInvite = await args.repository.findPendingInviteByEmail(args.actor.tenantId, email, args.now);
  const invite = existingInvite
    ? await args.repository.updatePendingInvite({
        inviteId: existingInvite.id,
        role: args.input.role,
        invitedByUserId: args.actor.userId,
        expiresAt,
        updatedAt: args.now,
        metadata,
      })
    : await args.repository.createPendingInvite({
        tenantId: args.actor.tenantId,
        email,
        role: args.input.role,
        invitedByUserId: args.actor.userId,
        expiresAt,
        metadata,
      });

  let inviteResult: WorkspaceInviteEmailDelivery;

  try {
    inviteResult = await args.auth.sendInviteAccessEmail(email, {
      redirectTo,
      hasSupabaseAuthUser: false,
      data: {
        tenant_id: args.actor.tenantId,
        invited_role: args.input.role,
      },
    });
  } catch (error) {
    throw inviteSendError(error, "Unable to send invite email.");
  }

  await args.repository.markInviteEmailSent({
    inviteId: invite.id,
    sentAt: args.now,
    supabaseAuthUserId: inviteResult.supabaseAuthUserId ?? null,
  });

  await args.repository.writeAuditLog({
    tenantId: args.actor.tenantId,
    entityType: "workspace_invite",
    entityId: invite.id,
    action: existingInvite ? "workspace_invite.resent" : "workspace_invite.created",
    actorUserId: args.actor.userId,
    summary: `${email} invited as ${args.input.role}.`,
    payload: {
      email,
      role: args.input.role,
      delivery_kind: inviteResult.deliveryKind,
      expires_at: expiresAt.toISOString(),
    },
  });

  return {
    deliveryKind: inviteResult.deliveryKind,
    invite: {
      ...invite,
      email,
      role: args.input.role,
      expiresAt,
    },
  };
}

export async function resendWorkspaceInvite(args: {
  actor: {
    tenantId: string;
    userId: string;
  };
  inviteId: string;
  appUrl: string;
  now: Date;
  repository: WorkspaceInviteFlowRepository;
  auth: WorkspaceInviteResendAuthClient;
}) {
  const invite = await args.repository.findPendingInviteById(args.actor.tenantId, args.inviteId, args.now);

  if (!invite) {
    throw new WorkspaceInviteFlowError("Pending invite was not found.", "invite_not_found");
  }

  const expiresAt = inviteExpiryFrom(args.now);
  const redirectTo = buildWorkspaceInviteRedirectUrl(args.appUrl).toString();
  const supabaseAuthUserId =
    typeof invite.metadata?.supabase_auth_user_id === "string" ? invite.metadata.supabase_auth_user_id : null;
  const metadata = {
    ...(invite.metadata ?? {}),
    invite_redirect_to: redirectTo,
    invited_via: "workspace_member_admin",
    last_resend_requested_at: args.now.toISOString(),
  };
  const refreshedInvite = await args.repository.updatePendingInvite({
    inviteId: invite.id,
    role: invite.role,
    invitedByUserId: args.actor.userId,
    expiresAt,
    updatedAt: args.now,
    metadata,
  });

  let result: { deliveryKind: "invite" | "magic_link"; supabaseAuthUserId?: string | null };

  try {
    result = await args.auth.sendInviteAccessEmail(invite.email, {
      redirectTo,
      hasSupabaseAuthUser: Boolean(supabaseAuthUserId),
      data: {
        tenant_id: args.actor.tenantId,
        invited_role: invite.role,
      },
    });
  } catch (error) {
    throw inviteSendError(error, "Unable to resend invite email.");
  }

  await args.repository.markInviteEmailSent({
    inviteId: invite.id,
    sentAt: args.now,
    supabaseAuthUserId: result.supabaseAuthUserId ?? supabaseAuthUserId,
  });

  await args.repository.writeAuditLog({
    tenantId: args.actor.tenantId,
    entityType: "workspace_invite",
    entityId: invite.id,
    action: "workspace_invite.resent",
    actorUserId: args.actor.userId,
    summary: `${invite.email} invite resent as ${invite.role}.`,
    payload: {
      email: invite.email,
      role: invite.role,
      delivery_kind: result.deliveryKind,
      expires_at: expiresAt.toISOString(),
    },
  });

  return {
    deliveryKind: result.deliveryKind,
    invite: {
      ...refreshedInvite,
      expiresAt,
    },
  };
}

export async function acceptWorkspaceInvitesForSupabaseUser(args: {
  supabaseUser: {
    id: string;
    email: string;
    fullName?: string | null;
    preferredLocale?: string | null;
  };
  now: Date;
  repository: WorkspaceInviteFlowRepository;
}) {
  const email = normalizeWorkspaceInviteEmail(args.supabaseUser.email);
  const appUser = await args.repository.upsertSupabaseUser({
    authSubject: args.supabaseUser.id,
    email,
    fullName: args.supabaseUser.fullName ?? null,
    preferredLocale: args.supabaseUser.preferredLocale ?? null,
  });
  const pendingInvites = await args.repository.findPendingInvitesByEmail(email, args.now);
  const acceptedInviteIds: string[] = [];

  for (const invite of pendingInvites) {
    await args.repository.activateMembership({
      tenantId: invite.tenantId,
      userId: appUser.id,
      role: invite.role,
      now: args.now,
    });
    await args.repository.markInviteAccepted({
      inviteId: invite.id,
      acceptedByUserId: appUser.id,
      acceptedAt: args.now,
    });
    await args.repository.writeAuditLog({
      tenantId: invite.tenantId,
      entityType: "workspace_invite",
      entityId: invite.id,
      action: "workspace_invite.accepted",
      actorUserId: appUser.id,
      summary: `${email} accepted workspace invite.`,
      payload: {
        email,
        role: invite.role,
      },
    });
    acceptedInviteIds.push(invite.id);
  }

  const activeMemberships = await args.repository.findActiveMembershipsForUser(appUser.id);

  return {
    userId: appUser.id,
    acceptedInviteIds,
    activeMemberships,
  };
}
