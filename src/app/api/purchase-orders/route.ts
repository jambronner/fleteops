import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { canManageOperationalRecords } from "@/lib/operations/policy";
import { createPurchaseOrderRecord, updatePurchaseOrderRecord } from "@/lib/operations/repository";

export const runtime = "nodejs";

const purchaseOrderStatusValues = ["draft", "open", "confirmed", "closed", "cancelled"] as const;

const purchaseOrderLineSchema = z.object({
  lineNumber: z.union([z.number(), z.string()]).optional(),
  externalProductCode: z.string().optional(),
  description: z.string().trim().min(1),
  qtyOrdered: z.string().optional(),
  uom: z.string().optional(),
  unitPrice: z.string().optional(),
  lineTotal: z.string().optional(),
  requestedDeliveryDate: z.string().optional(),
});

const baseSchema = z.object({
  issuerOrgId: z.string().uuid(),
  supplierOrgId: z.string().optional(),
  shipToLocationId: z.string().optional(),
  billToLocationId: z.string().optional(),
  poNumber: z.string().min(1),
  externalPoNumber: z.string().optional(),
  poDate: z.string().optional(),
  requestedDeliveryDate: z.string().optional(),
  status: z.enum(purchaseOrderStatusValues).optional(),
  note: z.string().optional(),
  lines: z.array(purchaseOrderLineSchema).optional(),
});

const updateSchema = baseSchema.extend({
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
    const created = await createPurchaseOrderRecord(session, payload);
    return NextResponse.json({ ok: true, purchaseOrder: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to create purchase order.",
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
    await updatePurchaseOrderRecord(session, payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update purchase order.",
      },
      { status: 400 },
    );
  }
}
