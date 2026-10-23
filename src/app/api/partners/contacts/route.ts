import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { externalParticipantRoleEnum } from "@/lib/db/schema";
import { canManageCounterparties } from "@/lib/partners/policy";
import { createContactRecord, deleteContactRecord, updateContactRecord } from "@/lib/partners/repository";
import {
  processHeldWhatsappMessagesForParticipant,
  processHeldWhatsappMessagesForSource,
} from "@/inngest/functions/process-whatsapp-message";
import { updateWhatsappSourceStatus } from "@/lib/whatsapp/sources";

export const runtime = "nodejs";

const roleValues = [...externalParticipantRoleEnum.enumValues] as [string, ...string[]];

const baseSchema = z
  .object({
    fullName: z.string().optional(),
    displayName: z.string().optional(),
    organizationId: z.string().optional(),
    role: z.enum(roleValues),
    language: z.string().optional(),
    active: z.boolean().optional(),
    notes: z.string().optional(),
    primaryPhoneNumber: z.string().optional(),
    trustWhatsappSourceId: z.string().uuid().optional(),
  })
  .refine(
    (value) =>
      Boolean(value.fullName?.trim()) ||
      Boolean(value.primaryPhoneNumber?.trim()) ||
      Boolean(value.organizationId?.trim()),
    {
      message: "Provide at least a name, organization, or phone number.",
    },
  );

const updateSchema = baseSchema.extend({
  id: z.string().uuid(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

function forbiddenMessage(locale: string) {
  return locale === "en"
    ? "You do not have permission to manage counterparties."
    : "No tienes permiso para administrar contrapartes.";
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageCounterparties(session)) {
    return NextResponse.json({ ok: false, error: forbiddenMessage(session.tenant.locale) }, { status: 403 });
  }

  try {
    const payload = baseSchema.parse(await request.json());
    const { trustWhatsappSourceId, ...contactPayload } = payload;
    const created = await createContactRecord(session, contactPayload);
    const heldMessageResults = [];

    if (trustWhatsappSourceId) {
      await updateWhatsappSourceStatus({
        session,
        sourceId: trustWhatsappSourceId,
        status: "active",
      });
      heldMessageResults.push(await processHeldWhatsappMessagesForSource({
        tenantId: session.tenant.id,
        sourceId: trustWhatsappSourceId,
      }));
    }

    if (contactPayload.primaryPhoneNumber) {
      heldMessageResults.push(await processHeldWhatsappMessagesForParticipant({
        tenantId: session.tenant.id,
        phoneNumber: contactPayload.primaryPhoneNumber,
      }));
    }

    return NextResponse.json({ ok: true, contact: created, heldMessages: heldMessageResults }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to create contact.",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageCounterparties(session)) {
    return NextResponse.json({ ok: false, error: forbiddenMessage(session.tenant.locale) }, { status: 403 });
  }

  try {
    const payload = updateSchema.parse(await request.json());
    await updateContactRecord(session, payload);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update contact.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageCounterparties(session)) {
    return NextResponse.json({ ok: false, error: forbiddenMessage(session.tenant.locale) }, { status: 403 });
  }

  try {
    const payload = deleteSchema.parse(await request.json());
    await deleteContactRecord(session, payload.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to delete contact.",
      },
      { status: 400 },
    );
  }
}
