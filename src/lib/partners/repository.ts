import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { AppSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import {
  auditLogs,
  documents,
  externalParticipantPhoneNumbers,
  externalParticipants,
  invoices,
  locations,
  organizations,
  payments,
  purchaseOrders,
  reconciliationRequirements,
  shipments,
  whatsappThreadParticipants,
  whatsappThreads,
} from "@/lib/db/schema";
import { sortPartnerOrganizationsByName } from "@/lib/partners/display";
import { formatPhoneNumberForStorage, normalizePhoneNumber } from "@/lib/partners/phone";

type OrganizationType = (typeof organizations.$inferSelect)["organizationType"];
type ExternalParticipantRole = (typeof externalParticipants.$inferSelect)["role"];
type ExternalParticipantChannel = (typeof externalParticipantPhoneNumbers.$inferSelect)["channel"];

export type PartnerOrganizationRecord = {
  id: string;
  legalName: string;
  displayName: string | null;
  organizationType: string;
  taxId: string | null;
  active: boolean;
  contactCount: number;
};

export type PartnerPhoneRecord = {
  id: string;
  phoneNumber: string;
  normalizedPhoneNumber: string;
  label: string | null;
  channel: string;
  isPrimary: boolean;
  active: boolean;
  verifiedAt: string | null;
  lastSeenAt: string | null;
};

export type PartnerContactRecord = {
  id: string;
  fullName: string | null;
  displayName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  role: string;
  language: string;
  active: boolean;
  notes: string | null;
  primaryPhoneNumber: string | null;
  phoneNumbers: PartnerPhoneRecord[];
};

export type PartnerDirectorySnapshot = {
  organizations: PartnerOrganizationRecord[];
  contacts: PartnerContactRecord[];
  metrics: {
    organizations: number;
    contacts: number;
    mappedPhoneNumbers: number;
    unassignedContacts: number;
  };
};

type OrganizationInput = {
  legalName: string;
  displayName?: string | null;
  organizationType: string;
  taxId?: string | null;
  active?: boolean;
  metadata?: Record<string, unknown> | null;
};

type ContactInput = {
  fullName?: string | null;
  displayName?: string | null;
  organizationId?: string | null;
  role: string;
  language?: string | null;
  active?: boolean;
  notes?: string | null;
  primaryPhoneNumber?: string | null;
};

type PhoneInput = {
  externalParticipantId: string;
  phoneNumber: string;
  label?: string | null;
  channel?: string | null;
  isPrimary?: boolean;
  active?: boolean;
};

type PhoneUpdateInput = {
  phoneRecordId: string;
  label?: string | null;
  isPrimary?: boolean;
  active?: boolean;
};

function requireDb() {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  return db;
}

function cleanNullable(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function insertAuditLog(args: {
  tenantId: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  payload?: Record<string, unknown>;
}) {
  const database = requireDb();

  await database.insert(auditLogs).values({
    tenantId: args.tenantId,
    actorUserId: args.actorUserId,
    entityType: args.entityType,
    entityId: args.entityId,
    action: args.action,
    summary: args.summary,
    payload: args.payload,
  });
}

async function ensureTenantOrganization(tenantId: string, organizationId: string) {
  const database = requireDb();
  const [record] = await database
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.id, organizationId), eq(organizations.tenantId, tenantId)))
    .limit(1);

  if (!record) {
    throw new Error("Organization not found in this workspace.");
  }
}

async function ensureTenantContact(tenantId: string, contactId: string) {
  const database = requireDb();
  const [record] = await database
    .select({
      id: externalParticipants.id,
      phoneNumber: externalParticipants.phoneNumber,
    })
    .from(externalParticipants)
    .where(and(eq(externalParticipants.id, contactId), eq(externalParticipants.tenantId, tenantId)))
    .limit(1);

  if (!record) {
    throw new Error("Contact not found in this workspace.");
  }

  return record;
}

async function syncPrimaryPhoneForContact(args: {
  tenantId: string;
  contactId: string;
}) {
  const database = requireDb();
  const [primaryRecord] = await database
    .select({
      phoneNumber: externalParticipantPhoneNumbers.phoneNumber,
    })
    .from(externalParticipantPhoneNumbers)
    .where(
      and(
        eq(externalParticipantPhoneNumbers.tenantId, args.tenantId),
        eq(externalParticipantPhoneNumbers.externalParticipantId, args.contactId),
        eq(externalParticipantPhoneNumbers.active, true),
        eq(externalParticipantPhoneNumbers.isPrimary, true),
      ),
    )
    .limit(1);

  await database
    .update(externalParticipants)
    .set({
      phoneNumber: primaryRecord?.phoneNumber ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(externalParticipants.id, args.contactId), eq(externalParticipants.tenantId, args.tenantId)));
}

function mapDatabaseError(error: unknown) {
  if (error instanceof Error && error.message.includes("external_participant_phone_numbers_tenant_phone_idx")) {
    return "This phone number is already assigned in the workspace.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to save partner data.";
}

export async function getPartnerDirectorySnapshot(tenantId: string): Promise<PartnerDirectorySnapshot> {
  const database = requireDb();

  const [organizationRows, contactRows, phoneRows] = await Promise.all([
    database
      .select({
        id: organizations.id,
        legalName: organizations.legalName,
        displayName: organizations.displayName,
        organizationType: organizations.organizationType,
        taxId: organizations.taxId,
        active: organizations.active,
      })
      .from(organizations)
      .where(eq(organizations.tenantId, tenantId))
      .orderBy(asc(organizations.organizationType), asc(organizations.legalName)),
    database
      .select({
        id: externalParticipants.id,
        fullName: externalParticipants.fullName,
        displayName: externalParticipants.displayName,
        organizationId: externalParticipants.organizationId,
        fallbackOrganizationName: externalParticipants.organizationName,
        role: externalParticipants.role,
        language: externalParticipants.language,
        active: externalParticipants.active,
        notes: externalParticipants.notes,
        primaryPhoneNumber: externalParticipants.phoneNumber,
        organizationDisplayName: organizations.displayName,
        organizationLegalName: organizations.legalName,
      })
      .from(externalParticipants)
      .leftJoin(organizations, eq(organizations.id, externalParticipants.organizationId))
      .where(eq(externalParticipants.tenantId, tenantId))
      .orderBy(asc(externalParticipants.fullName), asc(externalParticipants.id)),
    database
      .select({
        id: externalParticipantPhoneNumbers.id,
        externalParticipantId: externalParticipantPhoneNumbers.externalParticipantId,
        phoneNumber: externalParticipantPhoneNumbers.phoneNumber,
        normalizedPhoneNumber: externalParticipantPhoneNumbers.normalizedPhoneNumber,
        label: externalParticipantPhoneNumbers.label,
        channel: externalParticipantPhoneNumbers.channel,
        isPrimary: externalParticipantPhoneNumbers.isPrimary,
        active: externalParticipantPhoneNumbers.active,
        verifiedAt: externalParticipantPhoneNumbers.verifiedAt,
        lastSeenAt: externalParticipantPhoneNumbers.lastSeenAt,
      })
      .from(externalParticipantPhoneNumbers)
      .where(eq(externalParticipantPhoneNumbers.tenantId, tenantId))
      .orderBy(desc(externalParticipantPhoneNumbers.isPrimary), asc(externalParticipantPhoneNumbers.phoneNumber)),
  ]);

  const phoneMap = new Map<string, PartnerPhoneRecord[]>();
  for (const row of phoneRows) {
    const list = phoneMap.get(row.externalParticipantId) ?? [];
    list.push({
      id: row.id,
      phoneNumber: row.phoneNumber,
      normalizedPhoneNumber: row.normalizedPhoneNumber,
      label: row.label,
      channel: row.channel,
      isPrimary: row.isPrimary,
      active: row.active,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    });
    phoneMap.set(row.externalParticipantId, list);
  }

  const contacts: PartnerContactRecord[] = contactRows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    displayName: row.displayName,
    organizationId: row.organizationId,
    organizationName:
      row.organizationDisplayName ?? row.organizationLegalName ?? row.fallbackOrganizationName ?? null,
    role: row.role,
    language: row.language,
    active: row.active,
    notes: row.notes,
    primaryPhoneNumber: row.primaryPhoneNumber,
    phoneNumbers: phoneMap.get(row.id) ?? [],
  }));

  const contactCountByOrg = new Map<string, number>();
  for (const contact of contacts) {
    if (!contact.organizationId) {
      continue;
    }
    contactCountByOrg.set(contact.organizationId, (contactCountByOrg.get(contact.organizationId) ?? 0) + 1);
  }

  const orgs: PartnerOrganizationRecord[] = sortPartnerOrganizationsByName(
    organizationRows.map((row) => ({
      id: row.id,
      legalName: row.legalName,
      displayName: row.displayName,
      organizationType: row.organizationType,
      taxId: row.taxId,
      active: row.active,
      contactCount: contactCountByOrg.get(row.id) ?? 0,
    })),
  );

  const mappedPhoneNumbers = phoneRows.filter((row) => row.active).length;
  const unassignedContacts = contacts.filter((contact) => !contact.organizationId).length;

  return {
    organizations: orgs,
    contacts,
    metrics: {
      organizations: orgs.length,
      contacts: contacts.length,
      mappedPhoneNumbers,
      unassignedContacts,
    },
  };
}

export async function createOrganizationRecord(session: AppSession, input: OrganizationInput) {
  const database = requireDb();
  const [created] = await database
    .insert(organizations)
    .values({
      id: randomUUID(),
      tenantId: session.tenant.id,
      legalName: input.legalName.trim(),
      displayName: cleanNullable(input.displayName),
      organizationType: input.organizationType as OrganizationType,
      taxId: cleanNullable(input.taxId),
      active: input.active ?? true,
      metadata: input.metadata ?? null,
    })
    .returning({ id: organizations.id, legalName: organizations.legalName });

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "organization",
    entityId: created.id,
    action: "created",
    summary: `Created organization ${created.legalName}.`,
    payload: { organizationType: input.organizationType },
  });

  return created;
}

export async function updateOrganizationRecord(
  session: AppSession,
  input: OrganizationInput & { id: string },
) {
  const database = requireDb();
  await ensureTenantOrganization(session.tenant.id, input.id);

  await database
    .update(organizations)
    .set({
      legalName: input.legalName.trim(),
      displayName: cleanNullable(input.displayName),
      organizationType: input.organizationType as OrganizationType,
      taxId: cleanNullable(input.taxId),
      active: input.active ?? true,
      metadata: input.metadata ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(organizations.id, input.id), eq(organizations.tenantId, session.tenant.id)));

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "organization",
    entityId: input.id,
    action: "updated",
    summary: `Updated organization ${input.legalName}.`,
    payload: { organizationType: input.organizationType, active: input.active ?? true },
  });
}

export async function deleteOrganizationRecord(session: AppSession, organizationId: string) {
  const database = requireDb();
  await ensureTenantOrganization(session.tenant.id, organizationId);

  const [
    linkedContact,
    linkedLocation,
    linkedPurchaseOrder,
    linkedShipment,
    linkedDocument,
    linkedThread,
    linkedInvoice,
    linkedPayment,
    linkedRequirement,
  ] = await Promise.all([
    database
      .select({ id: externalParticipants.id })
      .from(externalParticipants)
      .where(and(eq(externalParticipants.tenantId, session.tenant.id), eq(externalParticipants.organizationId, organizationId)))
      .limit(1),
    database
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.tenantId, session.tenant.id), eq(locations.organizationId, organizationId)))
      .limit(1),
    database
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.tenantId, session.tenant.id),
          sql`${purchaseOrders.issuerOrgId} = ${organizationId} OR ${purchaseOrders.supplierOrgId} = ${organizationId}`,
        ),
      )
      .limit(1),
    database
      .select({ id: shipments.id })
      .from(shipments)
      .where(
        and(
          eq(shipments.tenantId, session.tenant.id),
          sql`${shipments.brokerOrgId} = ${organizationId} OR ${shipments.shipperOrgId} = ${organizationId} OR ${shipments.carrierOrgId} = ${organizationId} OR ${shipments.customerOrgId} = ${organizationId}`,
        ),
      )
      .limit(1),
    database
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, session.tenant.id),
          sql`${documents.issuingOrgId} = ${organizationId} OR ${documents.receivingOrgId} = ${organizationId}`,
        ),
      )
      .limit(1),
    database
      .select({ id: whatsappThreads.id })
      .from(whatsappThreads)
      .where(and(eq(whatsappThreads.tenantId, session.tenant.id), eq(whatsappThreads.counterpartyOrgId, organizationId)))
      .limit(1),
    database
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, session.tenant.id),
          sql`${invoices.issuerOrgId} = ${organizationId} OR ${invoices.recipientOrgId} = ${organizationId}`,
        ),
      )
      .limit(1),
    database
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, session.tenant.id),
          sql`${payments.payerOrgId} = ${organizationId} OR ${payments.payeeOrgId} = ${organizationId}`,
        ),
      )
      .limit(1),
    database
      .select({ id: reconciliationRequirements.id })
      .from(reconciliationRequirements)
      .where(
        and(
          eq(reconciliationRequirements.tenantId, session.tenant.id),
          eq(reconciliationRequirements.requiredFromOrgId, organizationId),
        ),
      )
      .limit(1),
  ]);

  if (
    linkedContact.length ||
    linkedLocation.length ||
    linkedPurchaseOrder.length ||
    linkedShipment.length ||
    linkedDocument.length ||
    linkedThread.length ||
    linkedInvoice.length ||
    linkedPayment.length ||
    linkedRequirement.length
  ) {
    throw new Error("This organization is already referenced in the workspace. Remove its linked records first or keep it inactive.");
  }

  const [deleted] = await database
    .delete(organizations)
    .where(and(eq(organizations.id, organizationId), eq(organizations.tenantId, session.tenant.id)))
    .returning({ id: organizations.id, legalName: organizations.legalName });

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "organization",
    entityId: organizationId,
    action: "deleted",
    summary: `Deleted organization ${deleted?.legalName ?? organizationId}.`,
  });

  return deleted;
}

export async function createContactRecord(session: AppSession, input: ContactInput) {
  const database = requireDb();
  const organizationId = cleanNullable(input.organizationId);

  if (organizationId) {
    await ensureTenantOrganization(session.tenant.id, organizationId);
  }

  const fullName = cleanNullable(input.fullName);
  const displayName = cleanNullable(input.displayName);
  const primaryPhoneNumber = cleanNullable(input.primaryPhoneNumber);

  const [created] = await database
    .insert(externalParticipants)
    .values({
      id: randomUUID(),
      tenantId: session.tenant.id,
      organizationId,
      fullName,
      displayName,
      role: input.role as ExternalParticipantRole,
      language: cleanNullable(input.language) ?? session.tenant.locale,
      active: input.active ?? true,
      notes: cleanNullable(input.notes),
    })
    .returning({
      id: externalParticipants.id,
      fullName: externalParticipants.fullName,
    });

  if (primaryPhoneNumber) {
    await addPhoneNumberRecord(session, {
      externalParticipantId: created.id,
      phoneNumber: primaryPhoneNumber,
      isPrimary: true,
      active: true,
      channel: "whatsapp",
    });
  }

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "external_participant",
    entityId: created.id,
    action: "created",
    summary: `Created contact ${created.fullName ?? created.id}.`,
    payload: { role: input.role, organizationId },
  });

  return created;
}

export async function updateContactRecord(session: AppSession, input: ContactInput & { id: string }) {
  const database = requireDb();
  const organizationId = cleanNullable(input.organizationId);

  if (organizationId) {
    await ensureTenantOrganization(session.tenant.id, organizationId);
  }

  await ensureTenantContact(session.tenant.id, input.id);

  await database
    .update(externalParticipants)
    .set({
      organizationId,
      fullName: cleanNullable(input.fullName),
      displayName: cleanNullable(input.displayName),
      role: input.role as ExternalParticipantRole,
      language: cleanNullable(input.language) ?? session.tenant.locale,
      active: input.active ?? true,
      notes: cleanNullable(input.notes),
      updatedAt: new Date(),
    })
    .where(and(eq(externalParticipants.id, input.id), eq(externalParticipants.tenantId, session.tenant.id)));

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "external_participant",
    entityId: input.id,
    action: "updated",
    summary: `Updated contact ${cleanNullable(input.fullName) ?? input.id}.`,
    payload: { organizationId, role: input.role, active: input.active ?? true },
  });
}

export async function deleteContactRecord(session: AppSession, contactId: string) {
  const database = requireDb();
  const currentContact = await ensureTenantContact(session.tenant.id, contactId);

  const [linkedParticipant] = await database
    .select({ id: whatsappThreadParticipants.id })
    .from(whatsappThreadParticipants)
    .where(
      and(
        eq(whatsappThreadParticipants.tenantId, session.tenant.id),
        eq(whatsappThreadParticipants.externalParticipantId, contactId),
      ),
    )
    .limit(1);

  if (linkedParticipant) {
    throw new Error("This contact is already referenced by WhatsApp thread history. Keep it active or inactive instead of deleting it.");
  }

  await database.transaction(async (tx) => {
    await tx
      .delete(externalParticipantPhoneNumbers)
      .where(
        and(
          eq(externalParticipantPhoneNumbers.tenantId, session.tenant.id),
          eq(externalParticipantPhoneNumbers.externalParticipantId, contactId),
        ),
      );

    await tx
      .delete(externalParticipants)
      .where(and(eq(externalParticipants.id, contactId), eq(externalParticipants.tenantId, session.tenant.id)));
  });

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "external_participant",
    entityId: contactId,
    action: "deleted",
    summary: `Deleted contact ${currentContact.id}.`,
    payload: { primaryPhoneNumber: currentContact.phoneNumber ?? null },
  });
}

export async function addPhoneNumberRecord(session: AppSession, input: PhoneInput) {
  const database = requireDb();
  await ensureTenantContact(session.tenant.id, input.externalParticipantId);

  const formattedPhone = formatPhoneNumberForStorage(input.phoneNumber);
  const normalizedPhone = normalizePhoneNumber(formattedPhone);

  if (!normalizedPhone) {
    throw new Error("Phone number is required.");
  }

  try {
    await database.transaction(async (tx) => {
      const existingCounts = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(externalParticipantPhoneNumbers)
        .where(
          and(
            eq(externalParticipantPhoneNumbers.tenantId, session.tenant.id),
            eq(externalParticipantPhoneNumbers.externalParticipantId, input.externalParticipantId),
            eq(externalParticipantPhoneNumbers.active, true),
          ),
        )
        .limit(1);

      const shouldBePrimary = input.isPrimary ?? (existingCounts[0]?.count ?? 0) === 0;

      if (shouldBePrimary) {
        await tx
          .update(externalParticipantPhoneNumbers)
          .set({
            isPrimary: false,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(externalParticipantPhoneNumbers.tenantId, session.tenant.id),
              eq(externalParticipantPhoneNumbers.externalParticipantId, input.externalParticipantId),
            ),
          );
      }

      await tx.insert(externalParticipantPhoneNumbers).values({
        id: randomUUID(),
        tenantId: session.tenant.id,
        externalParticipantId: input.externalParticipantId,
        channel: (cleanNullable(input.channel) as ExternalParticipantChannel) ?? "whatsapp",
        phoneNumber: formattedPhone,
        normalizedPhoneNumber: normalizedPhone,
        label: cleanNullable(input.label),
        isPrimary: shouldBePrimary,
        active: input.active ?? true,
      });
    });
  } catch (error) {
    throw new Error(mapDatabaseError(error));
  }

  await syncPrimaryPhoneForContact({
    tenantId: session.tenant.id,
    contactId: input.externalParticipantId,
  });

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "external_participant_phone_number",
    entityId: input.externalParticipantId,
    action: "created",
    summary: `Added phone assignment ${formattedPhone}.`,
    payload: { normalizedPhone },
  });
}

export async function updatePhoneNumberRecord(session: AppSession, input: PhoneUpdateInput) {
  const database = requireDb();
  const [record] = await database
    .select({
      id: externalParticipantPhoneNumbers.id,
      externalParticipantId: externalParticipantPhoneNumbers.externalParticipantId,
      label: externalParticipantPhoneNumbers.label,
      isPrimary: externalParticipantPhoneNumbers.isPrimary,
      active: externalParticipantPhoneNumbers.active,
    })
    .from(externalParticipantPhoneNumbers)
    .where(
      and(
        eq(externalParticipantPhoneNumbers.id, input.phoneRecordId),
        eq(externalParticipantPhoneNumbers.tenantId, session.tenant.id),
      ),
    )
    .limit(1);

  if (!record) {
    throw new Error("Phone assignment not found in this workspace.");
  }

  await database.transaction(async (tx) => {
    if (input.isPrimary) {
      await tx
        .update(externalParticipantPhoneNumbers)
        .set({
          isPrimary: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(externalParticipantPhoneNumbers.tenantId, session.tenant.id),
            eq(externalParticipantPhoneNumbers.externalParticipantId, record.externalParticipantId),
          ),
        );
    }

    await tx
      .update(externalParticipantPhoneNumbers)
      .set({
        label: input.label !== undefined ? cleanNullable(input.label) : record.label,
        isPrimary: input.isPrimary ?? record.isPrimary,
        active: input.active ?? record.active,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(externalParticipantPhoneNumbers.id, input.phoneRecordId),
          eq(externalParticipantPhoneNumbers.tenantId, session.tenant.id),
        ),
      );
  });

  await syncPrimaryPhoneForContact({
    tenantId: session.tenant.id,
    contactId: record.externalParticipantId,
  });

  await insertAuditLog({
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    entityType: "external_participant_phone_number",
    entityId: input.phoneRecordId,
    action: "updated",
    summary: "Updated phone assignment.",
    payload: { isPrimary: input.isPrimary ?? record.isPrimary, active: input.active ?? record.active },
  });
}
