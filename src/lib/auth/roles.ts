export const appRoles = ["admin", "operator", "finance", "viewer"] as const;

export type AppRole = (typeof appRoles)[number];

export const rolePermissions: Record<AppRole, string[]> = {
  admin: [
    "workspace.manage",
    "membership.manage",
    "counterparty.read",
    "counterparty.manage",
    "shipment.read",
    "shipment.write",
    "document.read",
    "document.write",
    "review.resolve",
    "review.read",
    "finance.write",
    "finance.read",
  ],
  operator: [
    "counterparty.read",
    "counterparty.manage",
    "shipment.read",
    "shipment.write",
    "document.read",
    "document.write",
    "review.resolve",
    "review.read",
    "message.read",
    "message.write",
  ],
  finance: [
    "counterparty.read",
    "shipment.read",
    "document.read",
    "finance.write",
    "finance.read",
    "review.read",
  ],
  viewer: ["counterparty.read", "shipment.read", "document.read", "finance.read", "review.read"],
};

export function hasPermission(permissions: string[], permission: string) {
  return permissions.includes(permission);
}
