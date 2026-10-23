import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { importBatches } from "@/lib/db/schema";
import { getImportTypeLabel, type SupportedImportType } from "@/lib/imports/contracts";
import { buildImportReviewPath } from "@/lib/imports/route-review-navigation";
import { getStorageDriver } from "@/lib/storage";

type ImportBatchMetadata = {
  importType?: SupportedImportType;
  sourceFormat?: string | null;
  mappingTemplate?: string | null;
  file?: {
    size?: number | null;
    mimeType?: string | null;
  };
  storage?: {
    key?: string | null;
  };
  routePreviewDraft?: unknown;
  warnings?: string[];
};

export type RecentImportBatch = {
  id: string;
  fileName: string | null;
  status: string;
  importType: SupportedImportType | null;
  importTypeLabel: string | null;
  sourceFormat: string | null;
  mappingTemplate: string | null;
  fileSizeBytes: number | null;
  createdAt: Date;
  signedReadUrl: string | null;
  reviewHref: string | null;
  warnings: string[];
};

export async function getRecentImportBatches(args: {
  tenantId: string;
  locale: string;
  limit?: number;
}) {
  if (!db) {
    return [];
  }

  const rows = await db
    .select({
      id: importBatches.id,
      fileName: importBatches.fileName,
      status: importBatches.status,
      metadata: importBatches.metadata,
      createdAt: importBatches.createdAt,
    })
    .from(importBatches)
    .where(eq(importBatches.tenantId, args.tenantId))
    .orderBy(desc(importBatches.createdAt))
    .limit(args.limit ?? 8);

  const storageDriver = await getStorageDriver();

  return Promise.all(
    rows.map(async (row) => {
      const metadata = (row.metadata ?? null) as ImportBatchMetadata | null;
      const importType = metadata?.importType ?? null;
      const storageKey = metadata?.storage?.key ?? null;

      let signedReadUrl: string | null = null;

      if (storageKey && row.fileName) {
        try {
          signedReadUrl = await storageDriver.createSignedReadUrl({
            key: storageKey,
            fileName: row.fileName,
          });
        } catch {
          signedReadUrl = null;
        }
      }

      return {
        id: row.id,
        fileName: row.fileName,
        status: row.status,
        importType,
        importTypeLabel: importType ? getImportTypeLabel(importType, args.locale) : null,
        sourceFormat: metadata?.sourceFormat ?? null,
        mappingTemplate: metadata?.mappingTemplate ?? null,
        fileSizeBytes: metadata?.file?.size ?? null,
        createdAt: row.createdAt,
        signedReadUrl,
        reviewHref:
          row.status === "pending" && importType === "shipment_tracker" && metadata?.routePreviewDraft
            ? buildImportReviewPath(row.id)
            : null,
        warnings: metadata?.warnings ?? [],
      } satisfies RecentImportBatch;
    }),
  );
}
