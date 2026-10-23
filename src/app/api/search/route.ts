import { isDemoMode, demoApiDisabled } from "@/lib/runtime-mode";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";

import { getOptionalSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { documents, locations, organizations, shipments } from "@/lib/db/schema";

export const runtime = "nodejs";

export type GlobalSearchResult = {
  id: string;
  label: string;
  detail: string | null;
  href: string;
  group: "routes" | "directory" | "documents";
};

export async function GET(request: NextRequest) {
  if (isDemoMode()) return demoApiDisabled();

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const pattern = `%${query}%`;
  const tenantId = session.tenant.id;

  const [shipmentRows, organizationRows, locationRows, documentRows] = await Promise.all([
    db
      .select({
        id: shipments.id,
        internalNumber: shipments.internalShipmentNumber,
        externalReference: shipments.externalShipmentReference,
      })
      .from(shipments)
      .where(
        and(
          eq(shipments.tenantId, tenantId),
          or(
            ilike(shipments.internalShipmentNumber, pattern),
            ilike(shipments.externalShipmentReference, pattern),
          ),
        ),
      )
      .orderBy(desc(shipments.createdAt))
      .limit(5),
    db
      .select({
        id: organizations.id,
        displayName: organizations.displayName,
        legalName: organizations.legalName,
      })
      .from(organizations)
      .where(
        and(
          eq(organizations.tenantId, tenantId),
          or(ilike(organizations.displayName, pattern), ilike(organizations.legalName, pattern)),
        ),
      )
      .limit(4),
    db
      .select({
        id: locations.id,
        name: locations.name,
        city: locations.city,
      })
      .from(locations)
      .where(and(eq(locations.tenantId, tenantId), ilike(locations.name, pattern)))
      .limit(4),
    db
      .select({
        id: documents.id,
        fileName: documents.originalFileName,
        documentNumber: documents.documentNumber,
      })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, tenantId),
          isNull(documents.archivedAt),
          or(ilike(documents.originalFileName, pattern), ilike(documents.documentNumber, pattern)),
        ),
      )
      .orderBy(desc(documents.createdAt))
      .limit(4),
  ]);

  const results: GlobalSearchResult[] = [
    ...shipmentRows.map((row) => ({
      id: row.id,
      label: row.internalNumber ?? row.externalReference ?? row.id,
      detail: row.internalNumber && row.externalReference ? row.externalReference : null,
      href: `/routes/${row.id}`,
      group: "routes" as const,
    })),
    ...organizationRows.map((row) => ({
      id: row.id,
      label: row.displayName ?? row.legalName,
      detail: null,
      href: "/partners",
      group: "directory" as const,
    })),
    ...locationRows.map((row) => ({
      id: row.id,
      label: row.name,
      detail: row.city,
      href: "/partners",
      group: "directory" as const,
    })),
    ...documentRows.map((row) => ({
      id: row.id,
      label: row.fileName ?? row.documentNumber ?? row.id,
      detail: null,
      href: "/evidence",
      group: "documents" as const,
    })),
  ];

  return NextResponse.json({ results });
}
