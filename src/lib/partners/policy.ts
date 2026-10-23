import type { AppSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";

export function canReadCounterparties(session: AppSession) {
  return hasPermission(session.permissions, "counterparty.read") || canManageCounterparties(session);
}

export function canManageCounterparties(session: AppSession) {
  return (
    hasPermission(session.permissions, "counterparty.manage") ||
    hasPermission(session.permissions, "workspace.manage")
  );
}
