import type { AppSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";

export function canManageOperationalRecords(session: AppSession) {
  return hasPermission(session.permissions, "shipment.write") || hasPermission(session.permissions, "workspace.manage");
}

export function canReadOperationalRecords(session: AppSession) {
  return canManageOperationalRecords(session) || hasPermission(session.permissions, "shipment.read");
}
