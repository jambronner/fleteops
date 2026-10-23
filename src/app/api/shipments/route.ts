import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { canManageOperationalRecords } from "@/lib/operations/policy";
import {
  createShipmentRecord,
  deleteShipmentRecord,
  updateShipmentRecord,
} from "@/lib/operations/repository";

export const runtime = "nodejs";

const shipmentStatusValues = [
  "draft",
  "planned",
  "in_transit",
  "delivered",
  "delivered_with_exception",
  "cancelled",
] as const;

const baseSchema = z
  .object({
    internalShipmentNumber: z.string().optional(),
    externalShipmentReference: z.string().optional(),
    brokerOrgId: z.string().optional(),
    shipperOrgId: z.string().optional(),
    carrierOrgId: z.string().optional(),
    customerOrgId: z.string().optional(),
    pickupLocationId: z.string().optional(),
    deliveryLocationId: z.string().optional(),
    deliveryLocationIds: z.array(z.string()).optional(),
    purchaseOrderId: z.string().optional(),
    pickupDate: z.string().optional(),
    deliveryDateExpected: z.string().optional(),
    deliveryDateActual: z.string().optional(),
    status: z.enum(shipmentStatusValues),
    temperatureControlled: z.boolean().optional(),
    notes: z.string().optional(),
  });

const updateSchema = baseSchema.extend({
  id: z.string().uuid(),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

function forbiddenMessage(locale: string) {
  return locale === "en"
    ? "You do not have permission to manage shipments and purchase orders."
    : "No tienes permiso para administrar embarques y órdenes de compra.";
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageOperationalRecords(session)) {
    return NextResponse.json({ ok: false, error: forbiddenMessage(session.tenant.locale) }, { status: 403 });
  }

  try {
    const payload = baseSchema.parse(await request.json());
    const shipmentId = await createShipmentRecord(session, payload);
    return NextResponse.json({ ok: true, shipmentId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to create shipment.",
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

  if (!canManageOperationalRecords(session)) {
    return NextResponse.json({ ok: false, error: forbiddenMessage(session.tenant.locale) }, { status: 403 });
  }

  try {
    const payload = updateSchema.parse(await request.json());
    await updateShipmentRecord(session, payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update shipment.",
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

  if (!canManageOperationalRecords(session)) {
    return NextResponse.json({ ok: false, error: forbiddenMessage(session.tenant.locale) }, { status: 403 });
  }

  try {
    const payload = deleteSchema.parse(await request.json());
    await deleteShipmentRecord(session, payload.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to delete shipment.",
      },
      { status: 400 },
    );
  }
}
