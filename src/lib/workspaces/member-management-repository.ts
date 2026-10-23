import { and, count, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { auditLogs, tenantMemberships, users, workspaceInvites } from "@/lib/db/schema";
import type { WorkspaceMemberManagementRepository } from "@/lib/workspaces/member-management";

export function createDrizzleWorkspaceMemberManagementRepository(): WorkspaceMemberManagementRepository {
  const database = db;

  if (!database) {
    throw new Error("Database is not configured.");
  }

  return {
    async findPendingInviteById(tenantId, inviteId) {
      const [invite] = await database
        .select({
          id: workspaceInvites.id,
          tenantId: workspaceInvites.tenantId,
          email: workspaceInvites.email,
          role: workspaceInvites.role,
          status: workspaceInvites.status,
          expiresAt: workspaceInvites.expiresAt,
          metadata: workspaceInvites.metadata,
        })
        .from(workspaceInvites)
        .where(
          and(
            eq(workspaceInvites.tenantId, tenantId),
            eq(workspaceInvites.id, inviteId),
            eq(workspaceInvites.status, "pending"),
          ),
        )
        .limit(1);

      return invite ?? null;
    },

    async revokePendingInvite(input) {
      await database
        .update(workspaceInvites)
        .set({
          status: "revoked",
          expiresAt: input.revokedAt,
          metadata: input.metadata,
          updatedAt: input.revokedAt,
        })
        .where(
          and(
            eq(workspaceInvites.tenantId, input.tenantId),
            eq(workspaceInvites.id, input.inviteId),
            eq(workspaceInvites.status, "pending"),
          ),
        );
    },

    async findWorkspaceMembership(tenantId, userId) {
      const [membership] = await database
        .select({
          tenantId: tenantMemberships.tenantId,
          userId: tenantMemberships.userId,
          email: users.email,
          fullName: users.fullName,
          role: tenantMemberships.role,
          status: tenantMemberships.status,
        })
        .from(tenantMemberships)
        .innerJoin(users, eq(users.id, tenantMemberships.userId))
        .where(
          and(
            eq(tenantMemberships.tenantId, tenantId),
            eq(tenantMemberships.userId, userId),
            inArray(tenantMemberships.status, ["active", "suspended"]),
          ),
        )
        .limit(1);

      return membership ?? null;
    },

    async countActiveAdmins(tenantId) {
      const [row] = await database
        .select({ value: count() })
        .from(tenantMemberships)
        .where(
          and(
            eq(tenantMemberships.tenantId, tenantId),
            eq(tenantMemberships.status, "active"),
            eq(tenantMemberships.role, "admin"),
          ),
        );

      return row?.value ?? 0;
    },

    async revokeWorkspaceMembership(input) {
      await database
        .update(tenantMemberships)
        .set({
          status: "revoked",
          updatedAt: input.revokedAt,
        })
        .where(
          and(
            eq(tenantMemberships.tenantId, input.tenantId),
            eq(tenantMemberships.userId, input.userId),
            inArray(tenantMemberships.status, ["active", "suspended"]),
          ),
        );
    },

    async writeAuditLog(input) {
      await database.insert(auditLogs).values({
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorType: "user",
        actorUserId: input.actorUserId,
        summary: input.summary,
        payload: input.payload,
      });
    },
  };
}
