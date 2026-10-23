import Link from "next/link";
import { ArrowUpRight, ChevronRight, FileSpreadsheet } from "lucide-react";

import { ShipmentImportForm } from "@/components/forms/shipment-import-form";
import { StatBar } from "@/components/ui/stat-bar";
import { getSession } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n/config";
import { getImportStatusLabel } from "@/lib/imports/contracts";
import { manageableImportTypes } from "@/lib/imports/policy";
import { getRecentImportBatches } from "@/lib/imports/repository";
import { getImportMaxFileSizeMb } from "@/lib/imports/server";

function formatFileSize(bytes: number | null, locale: string) {
  if (!bytes) {
    return null;
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: size >= 10 ? 0 : 1 }).format(size)} ${units[unitIndex]}`;
}

export default async function ImportsPage() {
  const session = await getSession();
  const dictionary = getDictionary(session.tenant.locale);
  const recentBatches = await getRecentImportBatches({
    tenantId: session.tenant.id,
    locale: session.tenant.locale,
    limit: 12,
  });
  const maxFileSizeMb = getImportMaxFileSizeMb();
  const allowedImportTypes = manageableImportTypes(session).filter(
    (type) => type !== "directory",
  );

  const metrics = {
    filesReceived: recentBatches.length,
    pendingBatches: recentBatches.filter((batch) => ["pending", "processing"].includes(batch.status)).length,
    shipmentTrackers: recentBatches.filter((batch) => batch.importType === "shipment_tracker").length,
    directoryFiles: recentBatches.filter((batch) => batch.importType === "directory").length,
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex-shrink-0">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted/60">
          {session.tenant.name}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">
          {dictionary.importsPage.title}
        </h1>
      </div>

      <StatBar
        items={[
          { label: dictionary.importsPage.metrics.filesReceived, value: metrics.filesReceived },
          { label: dictionary.importsPage.metrics.pendingBatches, value: metrics.pendingBatches, tone: "warning" },
          { label: dictionary.importsPage.metrics.shipmentTrackers, value: metrics.shipmentTrackers, tone: "accent" },
          { label: dictionary.importsPage.metrics.directoryFiles, value: metrics.directoryFiles, tone: "success" },
        ]}
      />

      <div className="grid min-h-0 flex-1 gap-5 overflow-hidden xl:grid-cols-[1.05fr_0.95fr]">
        <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
          <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-line-2 px-6 py-4">
              <h2 className="font-display text-xl font-semibold text-ink">
                {dictionary.importsPage.recentTitle}
              </h2>
              <FileSpreadsheet className="h-4 w-4 text-accent" />
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {recentBatches.length > 0 ? (
                recentBatches.map((batch) => (
                  <div
                    key={batch.id}
                    className="rounded-xl border border-line bg-tint px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {batch.fileName ?? batch.id}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {batch.importTypeLabel && (
                            <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                              {batch.importTypeLabel}
                            </span>
                          )}
                          {batch.sourceFormat && (
                            <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                              {batch.sourceFormat}
                            </span>
                          )}
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                            {getImportStatusLabel(batch.status, session.tenant.locale)}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-3">
                        {batch.reviewHref && (
                          <Link
                            className="inline-flex items-center gap-1 text-xs font-semibold text-accent"
                            href={batch.reviewHref}
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                            {dictionary.importsPage.reviewDraft}
                          </Link>
                        )}
                        {batch.signedReadUrl && (
                          <Link
                            className="inline-flex items-center gap-1 text-xs font-semibold text-accent"
                            href={batch.signedReadUrl}
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                            {dictionary.importsPage.openFile}
                          </Link>
                        )}
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-muted/78">
                      {new Intl.DateTimeFormat(session.tenant.locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(batch.createdAt)}
                      {batch.fileSizeBytes ? ` / ${formatFileSize(batch.fileSizeBytes, session.tenant.locale)}` : ""}
                    </p>

                    {batch.mappingTemplate && (
                      <p className="mt-2 text-xs text-muted/78">
                        {dictionary.importsPage.mappingProfile}: {batch.mappingTemplate}
                      </p>
                    )}

                    {batch.warnings[0] && (
                      <p className="mt-2 text-xs leading-5 text-amber-700">{batch.warnings[0]}</p>
                    )}
                  </div>
                ))
              ) : (
                <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">
                  {dictionary.importsPage.recentEmpty}
                </p>
              )}
            </div>
          </article>
        </div>

        <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
          {allowedImportTypes.length > 0 ? (
            <ShipmentImportForm
              allowedImportTypes={allowedImportTypes}
              locale={session.tenant.locale}
              maxFileSizeMb={maxFileSizeMb}
            />
          ) : (
            <article className="rounded-2xl border border-line bg-card p-6 text-sm text-muted shadow-sm">
              {dictionary.importsPage.readOnly}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
