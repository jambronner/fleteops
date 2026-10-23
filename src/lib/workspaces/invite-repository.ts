import { and, asc, eq, gt, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { auditLogs, tenantMemberships, tenants, users, workspaceInvites } from "@/lib/db/schema";
import { env } from "@/lib/env";
import type {
  WorkspaceInviteFlowRepository,
  WorkspaceInviteRecord,
} from "@/lib/workspaces/invite-flow";

function inviteSelection() {
  return {
    id: workspaceInvites.id,
    tenantId: workspaceInvites.tenantId,
    email: workspaceInvites.email,
    role: workspaceInvites.role,
    status: workspaceInvites.status,
    invitedByUserId: workspaceInvites.invitedByUserId,
    acceptedByUserId: workspaceInvites.acceptedByUserId,
    expiresAt: workspaceInvites.expiresAt,
    acceptedAt: workspaceInvites.acceptedAt,
    metadata: workspaceInvites.metadata,
  };
}

function toInviteRecord(row: WorkspaceInviteRecord): WorkspaceInviteRecord {
  return row;
}

function activePendingInviteWhere(tenantId: string, email: string, now: Date) {
  return and(
    eq(workspaceInvites.tenantId, tenantId),
    eq(workspaceInvites.email, email),
    eq(workspaceInvites.status, "pending"),
    or(isNull(workspaceInvites.expiresAt), gt(workspaceInvites.expiresAt, now)),
  );
}

export function createDrizzleWorkspaceInviteRepository(): WorkspaceInviteFlowRepository {
  const database = db;

  if (!database) {
    throw new Error("Database is not configured.");
  }

  return {
    async findActiveMembershipByEmail(tenantId, email) {
      const [membership] = await database
        .select({
          userId: users.id,
        })
        .from(tenantMemberships)
        .innerJoin(users, eq(users.id, tenantMemberships.userId))
        .where(
          and(
            eq(tenantMemberships.tenantId, tenantId),
            eq(tenantMemberships.status, "active"),
            eq(users.email, email),
            eq(users.active, true),
          ),
        )
        .limit(1);

      return membership ?? null;
    },

    async findPendingInviteByEmail(tenantId, email, now) {
      const [invite] = await database
        .select(inviteSelection())
        .from(workspaceInvites)
        .where(activePendingInviteWhere(tenantId, email, now))
        .orderBy(asc(workspaceInvites.createdAt))
        .limit(1);

      return invite ? toInviteRecord(invite) : null;
    },

    async findPendingInviteById(tenantId, inviteId, now) {
      const [invite] = await database
        .select(inviteSelection())
        .from(workspaceInvites)
        .where(
          and(
            eq(workspaceInvites.tenantId, tenantId),
            eq(workspaceInvites.id, inviteId),
            eq(workspaceInvites.status, "pending"),
            or(isNull(workspaceInvites.expiresAt), gt(workspaceInvites.expiresAt, now)),
          ),
        )
        .limit(1);

      return invite ? toInviteRecord(invite) : null;
    },

    async createPendingInvite(input) {
      const [invite] = await database
        .insert(workspaceInvites)
        .values({
          tenantId: input.tenantId,
          email: input.email,
          role: input.role,
          status: "pending",
          invitedByUserId: input.invitedByUserId,
          expiresAt: input.expiresAt,
          metadata: input.metadata,
        })
        .returning(inviteSelection());

      if (!invite) {
        throw new Error("Workspace invite creation failed.");
      }

      return toInviteRecord(invite);
    },

    async updatePendingInvite(input) {
      const [invite] = await database
        .update(workspaceInvites)
        .set({
          role: input.role,
          invitedByUserId: input.invitedByUserId,
          expiresAt: input.expiresAt,
          metadata: input.metadata,
          updatedAt: input.updatedAt,
        })
        .where(eq(workspaceInvites.id, input.inviteId))
        .returning(inviteSelection());

      if (!invite) {
        throw new Error("Workspace invite update failed.");
      }

      return toInviteRecord(invite);
    },

    async markInviteEmailSent(input) {
      const [existing] = await database
        .select({
          metadata: workspaceInvites.metadata,
        })
        .from(workspaceInvites)
        .where(eq(workspaceInvites.id, input.inviteId))
        .limit(1);

      await database
        .update(workspaceInvites)
        .set({
          metadata: {
            ...(existing?.metadata ?? {}),
            last_sent_at: input.sentAt.toISOString(),
            supabase_auth_user_id: input.supabaseAuthUserId ?? null,
          },
          updatedAt: input.sentAt,
        })
        .where(eq(workspaceInvites.id, input.inviteId));
    },

    async findPendingInvitesByEmail(email, now) {
      const invites = await database
        .select(inviteSelection())
        .from(workspaceInvites)
        .where(
          and(
            eq(workspaceInvites.email, email),
            eq(workspaceInvites.status, "pending"),
            or(isNull(workspaceInvites.expiresAt), gt(workspaceInvites.expiresAt, now)),
          ),
        )
        .orderBy(asc(workspaceInvites.createdAt));

      return invites.map(toInviteRecord);
    },

    async upsertSupabaseUser(input) {
      const [existingBySubject] = await database
        .select({
          id: users.id,
        })
        .from(users)
        .where(and(eq(users.authProvider, "supabase"), eq(users.authSubject, input.authSubject)))
        .limit(1);

      if (existingBySubject) {
        const [updated] = await database
          .update(users)
          .set({
            email: input.email,
            fullName: input.fullName ?? input.email,
            ...(input.preferredLocale ? { preferredLocale: input.preferredLocale } : {}),
            active: true,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingBySubject.id))
          .returning({ id: users.id });

        return updated ?? existingBySubject;
      }

      const [existingByEmail] = await database
        .select({
          id: users.id,
        })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (existingByEmail) {
        const [updated] = await database
          .update(users)
          .set({
            authProvider: "supabase",
            authSubject: input.authSubject,
            email: input.email,
            fullName: input.fullName ?? input.email,
            ...(input.preferredLocale ? { preferredLocale: input.preferredLocale } : {}),
            active: true,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingByEmail.id))
          .returning({ id: users.id });

        return updated ?? existingByEmail;
      }

      const [created] = await database
        .insert(users)
        .values({
          authProvider: "supabase",
          authSubject: input.authSubject,
          email: input.email,
          fullName: input.fullName ?? input.email,
          preferredLocale: input.preferredLocale ?? env.DEFAULT_LOCALE,
          active: true,
          lastSeenAt: new Date(),
        })
        .returning({ id: users.id });

      if (!created) {
        throw new Error("User creation failed.");
      }

      return created;
    },

    async activateMembership(input) {
      await database
        .insert(tenantMemberships)
        .values({
          tenantId: input.tenantId,
          userId: input.userId,
          role: input.role,
          status: "active",
          joinedAt: input.now,
        })
        .onConflictDoUpdate({
          target: [tenantMemberships.tenantId, tenantMemberships.userId],
          set: {
            role: input.role,
            status: "active",
            joinedAt: input.now,
            updatedAt: input.now,
          },
        });
    },

    async markInviteAccepted(input) {
      await database
        .update(workspaceInvites)
        .set({
          status: "accepted",
          acceptedByUserId: input.acceptedByUserId,
          acceptedAt: input.acceptedAt,
          updatedAt: input.acceptedAt,
        })
        .where(eq(workspaceInvites.id, input.inviteId));
    },

    async findActiveMembershipsForUser(userId) {
      return database
        .select({
          tenantId: tenantMemberships.tenantId,
          role: tenantMemberships.role,
        })
        .from(tenantMemberships)
        .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
        .where(
          and(
            eq(tenantMemberships.userId, userId),
            eq(tenantMemberships.status, "active"),
            eq(tenants.active, true),
          ),
        );
    },

    async writeAuditLog(input) {
      await database.insert(auditLogs).values({
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorType: input.actorUserId ? "user" : "system",
        actorUserId: input.actorUserId ?? null,
        summary: input.summary,
        payload: input.payload,
      });
    },
  };
}
