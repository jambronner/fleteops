import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { externalParticipantChannelEnum } from "@/lib/db/schema";
import { canManageCounterparties } from "@/lib/partners/policy";
import { addPhoneNumberRecord, updatePhoneNumberRecord } from "@/lib/partners/repository";
import {
  processHeldWhatsappMessagesForParticipant,
  processHeldWhatsappMessagesForSource,
} from "@/inngest/functions/process-whatsapp-message";
import { updateWhatsappSourceStatus } from "@/lib/whatsapp/sources";

export const runtime = "nodejs";

const channelValues = [...externalParticipantChannelEnum.enumValues] as [string, ...string[]];

const createSchema = z.object({
  externalParticipantId: z.string().uuid(),
  phoneNumber: z.string().min(1),
  label: z.string().optional(),
  channel: z.enum(channelValues).optional(),
  isPrimary: z.boolean().optional(),
  active: z.boolean().optional(),
  trustWhatsappSourceId: z.string().uuid().optional(),
});

const updateSchema = z.object({
  phoneRecordId: z.string().uuid(),
  label: z.string().optional(),
  isPrimary: z.boolean().optional(),
  active: z.boolean().optional(),
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
    const payload = createSchema.parse(await request.json());
    const { trustWhatsappSourceId, ...phonePayload } = payload;
    const heldMessageResults = [];

    await addPhoneNumberRecord(session, phonePayload);

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

    if (phonePayload.channel === "whatsapp" || !phonePayload.channel) {
      heldMessageResults.push(await processHeldWhatsappMessagesForParticipant({
        tenantId: session.tenant.id,
        phoneNumber: phonePayload.phoneNumber,
      }));
    }

    return NextResponse.json({ ok: true, heldMessages: heldMessageResults }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to add phone number.",
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
    await updatePhoneNumberRecord(session, payload);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update phone assignment.",
      },
      { status: 400 },
    );
  }
}
