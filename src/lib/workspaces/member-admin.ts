import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { tenantMemberships, users, workspaceInvites } from "@/lib/db/schema";

export async function getWorkspaceMemberAdminSnapshot(tenantId: string) {
  if (!db) {
    return {
      members: [],
      invites: [],
    };
  }

  const [members, invites] = await Promise.all([
    db
      .select({
        userId: users.id,
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
          inArray(tenantMemberships.status, ["active", "suspended"]),
        ),
      )
      .orderBy(asc(users.email)),
    db
      .select({
        id: workspaceInvites.id,
        email: workspaceInvites.email,
        role: workspaceInvites.role,
        status: workspaceInvites.status,
        expiresAt: workspaceInvites.expiresAt,
      })
      .from(workspaceInvites)
      .where(and(eq(workspaceInvites.tenantId, tenantId), eq(workspaceInvites.status, "pending")))
      .orderBy(asc(workspaceInvites.email)),
  ]);

  return {
    members,
    invites,
  };
}
