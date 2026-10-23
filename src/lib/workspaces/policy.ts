export const tenancyPolicy = {
  defaultBoundary: "single-broker-workspace",
  crossTenantUsersAllowed: false,
  externalParticipantsAsUsers: false,
  futureExpansion: [
    "shipment_sharing_grants",
    "external_partner_portal",
    "customer_specific_import_mappings",
  ],
} as const;
