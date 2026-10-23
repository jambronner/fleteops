import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";

import { ShipmentImportForm, type RouteImportPreview } from "@/components/forms/shipment-import-form";
import { getSession } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/config";
import { findRoutePreviewDraft } from "@/lib/imports/route-preview-draft-records";
import { getImportMaxFileSizeMb } from "@/lib/imports/server";
import { canManageOperationalRecords } from "@/lib/operations/policy";
import { getStorageDriver } from "@/lib/storage";

async function buildInitialPreview(draft: NonNullable<Awaited<ReturnType<typeof findRoutePreviewDraft>>>) {
  const storageDriver = await getStorageDriver();
  let signedReadUrl: string | undefined;

  try {
    signedReadUrl = await storageDriver.createSignedReadUrl({
      key: draft.metadata.storage.key,
      fileName: draft.metadata.fileName,
    });
  } catch {
    signedReadUrl = undefined;
  }

  return {
    ...draft.metadata.routePreviewDraft.preview,
    draftId: draft.id,
    mappingTemplate: draft.metadata.mappingTemplate,
    signedReadUrl,
  } as RouteImportPreview;
}

export default async function ImportReviewPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const session = await getSession();

  if (!canManageOperationalRecords(session)) {
    redirect("/imports");
  }

  const draft = await findRoutePreviewDraft(session.tenant.id, batchId);

  if (!draft) {
    redirect("/routes");
  }

  const copy = getDictionary(session.tenant.locale).importReviewPage;
  const maxFileSizeMb = getImportMaxFileSizeMb();
  const initialRoutePreview = await buildInitialPreview(draft);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <header className="flex flex-shrink-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            className="inline-flex items-center gap-2 text-xs font-semibold text-muted/70 transition hover:text-ink"
            href="/imports"
          >
            <ArrowLeft className="h-4 w-4" />
            {copy.backToImports}
          </Link>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted/60">
            {session.tenant.name} / {copy.eyebrow}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">
            {copy.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted/75">{copy.subtitle}</p>
        </div>
        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 shadow-sm">
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-accent" />
          <p className="min-w-0 truncate text-sm font-semibold text-ink">{draft.fileName ?? draft.id}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ShipmentImportForm
          allowedImportTypes={["shipment_tracker"]}
          compact
          defaultImportType="shipment_tracker"
          initialRoutePreview={initialRoutePreview}
          introTitle={copy.formTitle}
          locale={session.tenant.locale}
          maxFileSizeMb={maxFileSizeMb}
          returnHref="/routes"
          reviewMode
        />
      </div>
    </div>
  );
}
