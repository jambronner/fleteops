import type { AppSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";

type PermissionSubject = Pick<AppSession, "permissions">;

export function canWriteDocuments(subject: PermissionSubject) {
  return hasPermission(subject.permissions, "document.write");
}

export function canLinkDocumentsToShipments(subject: PermissionSubject) {
  return (
    canWriteDocuments(subject) ||
    hasPermission(subject.permissions, "shipment.write")
  );
}
