import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { importBatches } from "@/lib/db/schema";
import { readRoutePreviewDraftMetadata } from "@/lib/imports/route-preview-drafts";
import { getStorageDriver } from "@/lib/storage";

function routeDraftWhere(tenantId: string, draftId?: string | null) {
  const base = and(
    eq(importBatches.tenantId, tenantId),
    eq(importBatches.status, "pending"),
    sql`${importBatches.metadata}->>'importType' = 'shipment_tracker'`,
    sql`${importBatches.metadata} ? 'routePreviewDraft'`,
  );

  return draftId ? and(base, eq(importBatches.id, draftId)) : base;
}

export async function findRoutePreviewDraft(tenantId: string, draftId?: string | null) {
  if (!db) {
    return null;
  }

  const [draft] = await db
    .select({
      id: importBatches.id,
      fileName: importBatches.fileName,
      metadata: importBatches.metadata,
    })
    .from(importBatches)
    .where(routeDraftWhere(tenantId, draftId))
    .orderBy(desc(importBatches.updatedAt))
    .limit(1);

  const metadata = readRoutePreviewDraftMetadata(draft?.metadata);

  return draft && metadata ? { ...draft, metadata } : null;
}

export async function getLatestRoutePreviewDraft(tenantId: string) {
  return findRoutePreviewDraft(tenantId);
}

export async function discardRoutePreviewDraft(args: { tenantId: string; draftId: string }) {
  if (!db) {
    return false;
  }

  const draft = await findRoutePreviewDraft(args.tenantId, args.draftId);

  if (!draft) {
    return false;
  }

  const storageDriver = await getStorageDriver();

  await db.delete(importBatches).where(and(eq(importBatches.id, draft.id), eq(importBatches.tenantId, args.tenantId)));
  await storageDriver.deleteObject({ key: draft.metadata.storage.key }).catch(() => undefined);

  return true;
}
