import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { organizationTypeEnum } from "@/lib/db/schema";
import { canManageCounterparties } from "@/lib/partners/policy";
import {
  createOrganizationRecord,
  deleteOrganizationRecord,
  updateOrganizationRecord,
} from "@/lib/partners/repository";

export const runtime = "nodejs";

const organizationTypeValues = [...organizationTypeEnum.enumValues] as [string, ...string[]];

const createSchema = z.object({
  legalName: z.string().min(1),
  displayName: z.string().optional(),
  organizationType: z.enum(organizationTypeValues),
  taxId: z.string().optional(),
  active: z.boolean().optional(),
});

const updateSchema = createSchema.extend({
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
    const payload = createSchema.parse(await request.json());
    const created = await createOrganizationRecord(session, payload);

    return NextResponse.json({ ok: true, organization: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to create organization.",
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
    await updateOrganizationRecord(session, payload);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update organization.",
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
    await deleteOrganizationRecord(session, payload.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to delete organization.",
      },
      { status: 400 },
    );
  }
}
