import type { AppSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import type { SupportedImportType } from "@/lib/imports/contracts";

type PermissionSubject = Pick<AppSession, "permissions">;

export function canManageImportType(
  subject: PermissionSubject,
  importType: SupportedImportType,
) {
  switch (importType) {
    case "directory":
      return hasPermission(subject.permissions, "counterparty.manage");
    case "invoice_status":
      return hasPermission(subject.permissions, "finance.write");
    case "purchase_orders":
    case "shipment_tracker":
      return hasPermission(subject.permissions, "shipment.write");
  }
}

export function manageableImportTypes(subject: PermissionSubject) {
  const types: SupportedImportType[] = [
    "shipment_tracker",
    "purchase_orders",
    "invoice_status",
    "directory",
  ];

  return types.filter((type) => canManageImportType(subject, type));
}
