"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ChevronDown, ExternalLink, Link2, Receipt, RotateCcw, Unlink, X } from "lucide-react";

import { DocumentExtractionOverview } from "@/components/documents/document-extraction-overview";
import { DocumentExtractionProvenanceDetails } from "@/components/documents/document-extraction-provenance-details";
import { DocumentSourceTrace } from "@/components/documents/document-source-trace";
import { useToast } from "@/components/ui/toast-provider";
import { formatRegionalDateTime } from "@/lib/dates";
import type { EvidenceRouteSummary, RecentDocumentRecord } from "@/lib/documents/repository";
import { enumLabel } from "@/lib/i18n/enum-labels";

type RecentDocumentsPanelProps = {
  locale: string;
  documents: RecentDocumentRecord[];
  archivedDocuments: RecentDocumentRecord[];
  shipmentOptions: EvidenceRouteSummary[];
  canArchive: boolean;
  canLink: boolean;
  showAiProcessingDetails: boolean;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      title: "Recent evidence",
      empty: "No evidence has been attached yet.",
      noExtractionRun: "No extraction run yet",
      extractionIssueLabel: "Issue",
      processedWith: "Processed with",
      openStoredFile: "Open stored file",
      sourceChannel: "Source",
      linkedToRoute: "Linked to route",
      needsRouteLink: "Still needs a route link",
      openRoute: "Open route",
      archiveAction: "Archive evidence",
      archiveTitle: "Archive this evidence?",
      archiveBody: "It will leave active work views, but the original file, extraction history, audit trail, and route link will be retained indefinitely.",
      archiveReason: "Reason for archiving",
      archiveReasonPlaceholder: "For example: duplicate upload",
      archiveReasonHint: "Required so the change is clear in the audit trail.",
      archiveConfirm: "Archive evidence",
      archiving: "Archiving...",
      archiveSuccessTitle: "Evidence archived",
      archiveSuccessBody: "The original was retained and can be restored at any time.",
      archivedTitle: "Archived evidence",
      archivedOn: "Archived",
      restore: "Restore",
      restoring: "Restoring...",
      restoreSuccessTitle: "Evidence restored",
      restoreSuccessBody: "The evidence is active again with its history and route link intact.",
      correctLink: "Correct route link",
      routeLabel: "Route",
      saveLink: "Save link",
      savingLink: "Saving...",
      removeLink: "Remove link",
      removingLink: "Removing...",
      linkSuccessTitle: "Route link updated",
      linkSuccessBody: "The correction was saved in the audit trail.",
      unlinkSuccessTitle: "Route link removed",
      unlinkSuccessBody: "The evidence is now waiting for the correct route.",
      failedTitle: "Could not update evidence",
      failedBody: "Try again in a moment.",
      cancel: "Cancel",
    };
  }

  return {
    title: "Evidencia reciente",
    empty: "Aún no se ha adjuntado evidencia.",
    noExtractionRun: "Aún no hay corrida de extracción",
    extractionIssueLabel: "Problema",
    processedWith: "Procesado con",
    openStoredFile: "Abrir archivo almacenado",
    sourceChannel: "Origen",
    linkedToRoute: "Ligado a la ruta",
    needsRouteLink: "Todavía falta ligar a una ruta",
    openRoute: "Abrir ruta",
    archiveAction: "Archivar evidencia",
    archiveTitle: "¿Archivar esta evidencia?",
    archiveBody: "Saldrá de las vistas de trabajo activas, pero el archivo original, la extracción, la bitácora y el vínculo de ruta se conservarán indefinidamente.",
    archiveReason: "Motivo para archivar",
    archiveReasonPlaceholder: "Por ejemplo: carga duplicada",
    archiveReasonHint: "Es obligatorio para que el cambio quede claro en la bitácora.",
    archiveConfirm: "Archivar evidencia",
    archiving: "Archivando...",
    archiveSuccessTitle: "Evidencia archivada",
    archiveSuccessBody: "El original se conservó y puede restaurarse en cualquier momento.",
    archivedTitle: "Evidencia archivada",
    archivedOn: "Archivada",
    restore: "Restaurar",
    restoring: "Restaurando...",
    restoreSuccessTitle: "Evidencia restaurada",
    restoreSuccessBody: "La evidencia vuelve a estar activa con su historial y vínculo intactos.",
    correctLink: "Corregir vínculo de ruta",
    routeLabel: "Ruta",
    saveLink: "Guardar vínculo",
    savingLink: "Guardando...",
    removeLink: "Quitar vínculo",
    removingLink: "Quitando...",
    linkSuccessTitle: "Vínculo de ruta actualizado",
    linkSuccessBody: "La corrección quedó registrada en la bitácora.",
    unlinkSuccessTitle: "Vínculo de ruta eliminado",
    unlinkSuccessBody: "La evidencia está esperando la ruta correcta.",
    failedTitle: "No se pudo actualizar la evidencia",
    failedBody: "Intenta otra vez en un momento.",
    cancel: "Cancelar",
  };
}

export function RecentDocumentsPanel({
  locale,
  documents: initialDocuments,
  archivedDocuments: initialArchivedDocuments,
  shipmentOptions,
  canArchive,
  canLink,
  showAiProcessingDetails,
}: RecentDocumentsPanelProps) {
  const router = useRouter();
  const copy = copyForLocale(locale);
  const { showToast } = useToast();
  const [documents, setDocuments] = useState(initialDocuments);
  const [archivedDocuments, setArchivedDocuments] = useState(initialArchivedDocuments);
  const [documentToArchive, setDocumentToArchive] = useState<RecentDocumentRecord | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [routeSelections, setRouteSelections] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  const initialSelections = useMemo(
    () => Object.fromEntries(initialDocuments.map((document) => [document.id, document.linkedShipment?.shipmentId ?? ""])),
    [initialDocuments],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the connected editing draft synchronized with refreshed external state.
    setDocuments(initialDocuments);
    setArchivedDocuments(initialArchivedDocuments);
    setRouteSelections(initialSelections);
  }, [initialArchivedDocuments, initialDocuments, initialSelections]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function showFailure(caught: unknown) {
    const message = caught instanceof Error ? caught.message : copy.failedBody;
    setError(message);
    showToast({ title: copy.failedTitle, message, variant: "error" });
  }

  async function archiveDocument() {
    if (!documentToArchive || archiveReason.trim().length < 3) {
      return;
    }

    const target = documentToArchive;
    setPendingId(target.id);
    setError("");

    try {
      const response = await fetch(`/api/documents/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", reason: archiveReason.trim() }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? copy.failedBody);
      }

      setDocuments((current) => current.filter((document) => document.id !== target.id));
      setArchivedDocuments((current) => [
        { ...target, archivedAt: new Date(), archiveReason: archiveReason.trim() },
        ...current,
      ]);
      setDocumentToArchive(null);
      setArchiveReason("");
      showToast({ title: copy.archiveSuccessTitle, message: copy.archiveSuccessBody, variant: "success" });
      refresh();
    } catch (caught) {
      showFailure(caught);
    } finally {
      setPendingId(null);
    }
  }

  async function restoreDocument(document: RecentDocumentRecord) {
    setPendingId(document.id);
    setError("");

    try {
      const response = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? copy.failedBody);
      }

      const restored = { ...document, archivedAt: null, archivedByUserId: null, archiveReason: null };
      setArchivedDocuments((current) => current.filter((item) => item.id !== document.id));
      setDocuments((current) => [restored, ...current]);
      setRouteSelections((current) => ({ ...current, [document.id]: document.linkedShipment?.shipmentId ?? "" }));
      showToast({ title: copy.restoreSuccessTitle, message: copy.restoreSuccessBody, variant: "success" });
      refresh();
    } catch (caught) {
      showFailure(caught);
    } finally {
      setPendingId(null);
    }
  }

  async function saveRouteLink(document: RecentDocumentRecord) {
    const shipmentId = routeSelections[document.id];

    if (!shipmentId) {
      return;
    }

    setPendingId(document.id);
    setError("");

    try {
      const response = await fetch(`/api/documents/${document.id}/shipment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId, notes: "Corrected by a workspace user from the evidence workbench." }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? copy.failedBody);
      }

      const linkedShipment = shipmentOptions.find((shipment) => shipment.shipmentId === shipmentId) ?? null;
      setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, linkedShipment } : item));
      showToast({ title: copy.linkSuccessTitle, message: copy.linkSuccessBody, variant: "success" });
      refresh();
    } catch (caught) {
      showFailure(caught);
    } finally {
      setPendingId(null);
    }
  }

  async function removeRouteLink(document: RecentDocumentRecord) {
    setPendingId(document.id);
    setError("");

    try {
      const response = await fetch(`/api/documents/${document.id}/shipment-link`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? copy.failedBody);
      }

      setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, linkedShipment: null } : item));
      setRouteSelections((current) => ({ ...current, [document.id]: "" }));
      showToast({ title: copy.unlinkSuccessTitle, message: copy.unlinkSuccessBody, variant: "success" });
      refresh();
    } catch (caught) {
      showFailure(caught);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <article className="rounded-2xl border border-line bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-line-2 px-6 py-4">
          <h2 className="font-display text-sm font-semibold text-ink">{copy.title}</h2>
          <Receipt className="h-4 w-4 text-accent" />
        </div>

        <div className="grid gap-3 p-4">
          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
          ) : null}

          {documents.length > 0 ? documents.slice(0, 9).map((document) => {
            const isPending = pendingId === document.id;
            const hasReadableSummary = document.summary.fields.length > 0 || Boolean(document.summary.normalizedText);
            const selectedRouteId = routeSelections[document.id] ?? "";
            const currentRouteId = document.linkedShipment?.shipmentId ?? "";

            return (
              <div className="rounded-xl border border-line bg-tint px-4 py-4" key={document.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{document.originalFileName}</p>
                    <p className="mt-1 text-xs text-muted">
                      {formatRegionalDateTime(document.createdAt, locale, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start justify-end gap-2">
                    <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {enumLabel(locale, document.documentType)}
                    </span>
                    <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {copy.sourceChannel}: {document.sourceChannel}
                    </span>
                    {canArchive ? (
                      <button
                        aria-label={copy.archiveAction}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-card text-muted transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={Boolean(pendingId)}
                        onClick={() => { setError(""); setArchiveReason(""); setDocumentToArchive(document); }}
                        type="button"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted/80">
                  <span className="rounded-full bg-card px-2.5 py-0.5 font-semibold uppercase tracking-wide text-muted">
                    {document.extractionStatus}
                  </span>
                  {document.linkedShipment ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-700">
                      {copy.linkedToRoute}: {document.linkedShipment.shipmentReference}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 font-semibold text-amber-700">{copy.needsRouteLink}</span>
                  )}
                  <span>
                    {document.latestRun?.provider
                      ? `${copy.processedWith} ${document.latestRun.provider} / ${document.latestRun.status}`
                      : copy.noExtractionRun}
                  </span>
                </div>

                <DocumentSourceTrace locale={locale} sourceChannel={document.sourceChannel} provenance={document.provenance} />

                {showAiProcessingDetails && document.extractionProvenance ? (
                  <DocumentExtractionProvenanceDetails
                    locale={locale}
                    provenance={document.extractionProvenance}
                  />
                ) : null}

                {document.statusDetail ? (
                  <p className="mt-2 text-xs text-amber-700">
                    <span className="font-semibold">{copy.extractionIssueLabel}:</span> {document.statusDetail}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {document.signedReadUrl ? (
                    <a className="inline-flex items-center gap-1 text-xs font-semibold text-accent" href={document.signedReadUrl} rel="noreferrer" target="_blank">
                      {copy.openStoredFile}<ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                  {document.linkedShipment ? (
                    <Link className="text-xs font-semibold text-accent" href={`/routes/${document.linkedShipment.shipmentId}`}>{copy.openRoute}</Link>
                  ) : null}
                </div>

                {canLink ? (
                  <details className="group mt-3 rounded-xl border border-line bg-card px-3 py-2.5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-ink">
                      <span className="inline-flex items-center gap-2"><Link2 className="h-3.5 w-3.5 text-accent" />{copy.correctLink}</span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted transition group-open:rotate-180" />
                    </summary>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                      <label className="grid gap-1 text-[11px] font-semibold text-muted">
                        {copy.routeLabel}
                        <select
                          className="min-h-10 rounded-lg border border-line bg-card px-3 text-sm text-ink outline-none focus:border-accent"
                          disabled={isPending}
                          onChange={(event) => setRouteSelections((current) => ({ ...current, [document.id]: event.target.value }))}
                          value={selectedRouteId}
                        >
                          <option value="">—</option>
                          {shipmentOptions.map((shipment) => (
                            <option key={shipment.shipmentId} value={shipment.shipmentId}>{shipment.shipmentReference} · {shipment.routeLabel}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="min-h-10 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-contrast disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!selectedRouteId || selectedRouteId === currentRouteId || isPending}
                        onClick={() => saveRouteLink(document)}
                        type="button"
                      >
                        {isPending ? copy.savingLink : copy.saveLink}
                      </button>
                      {currentRouteId ? (
                        <button
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-muted disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isPending}
                          onClick={() => removeRouteLink(document)}
                          type="button"
                        >
                          <Unlink className="h-3.5 w-3.5" />{isPending ? copy.removingLink : copy.removeLink}
                        </button>
                      ) : null}
                    </div>
                  </details>
                ) : null}

                {hasReadableSummary ? (
                  <DocumentExtractionOverview
                    confidenceOverall={document.latestRun?.confidenceOverall ?? null}
                    locale={locale}
                    providerLabel={document.latestRun?.model ?? document.latestRun?.provider ?? null}
                    summary={document.summary}
                  />
                ) : null}
              </div>
            );
          }) : (
            <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">{copy.empty}</p>
          )}

          {archivedDocuments.length > 0 ? (
            <details className="group rounded-xl border border-dashed border-line bg-surface/70">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-muted">
                <span>{copy.archivedTitle} · {archivedDocuments.length}</span>
                <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
              </summary>
              <div className="space-y-2 border-t border-line-2 p-3">
                {archivedDocuments.map((document) => (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-card px-3 py-3" key={document.id}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{document.originalFileName}</p>
                      <p className="mt-1 text-xs text-muted">
                        {copy.archivedOn} {document.archivedAt ? formatRegionalDateTime(document.archivedAt, locale, { dateStyle: "medium" }) : ""}
                        {document.archiveReason ? ` · ${document.archiveReason}` : ""}
                      </p>
                    </div>
                    {canArchive ? (
                      <button
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line px-3 text-xs font-semibold text-ink transition hover:bg-tint disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={Boolean(pendingId)}
                        onClick={() => restoreDocument(document)}
                        type="button"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {pendingId === document.id ? copy.restoring : copy.restore}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </article>

      {documentToArchive ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/28 p-4 backdrop-blur-sm">
          <div aria-labelledby="archive-document-title" aria-modal="true" className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-2xl shadow-ink/15" role="dialog">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-lg font-semibold text-ink" id="archive-document-title">{copy.archiveTitle}</p>
                <p className="mt-2 text-sm leading-6 text-muted/80">{copy.archiveBody}</p>
              </div>
              <button aria-label={copy.cancel} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted transition hover:bg-surface" disabled={Boolean(pendingId)} onClick={() => setDocumentToArchive(null)} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 rounded-xl bg-tint px-4 py-3">
              <p className="text-sm font-semibold text-ink">{documentToArchive.originalFileName}</p>
            </div>

            <label className="mt-4 grid gap-2 text-sm font-semibold text-ink">
              {copy.archiveReason}
              <textarea
                autoFocus
                className="min-h-24 resize-y rounded-xl border border-line bg-card px-3 py-2 text-sm font-normal text-ink outline-none focus:border-accent"
                disabled={Boolean(pendingId)}
                maxLength={500}
                onChange={(event) => setArchiveReason(event.target.value)}
                placeholder={copy.archiveReasonPlaceholder}
                value={archiveReason}
              />
              <span className="text-xs font-normal text-muted">{copy.archiveReasonHint}</span>
            </label>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button className="min-h-10 rounded-xl border border-line px-4 text-sm font-semibold text-muted transition hover:bg-surface" disabled={Boolean(pendingId)} onClick={() => setDocumentToArchive(null)} type="button">{copy.cancel}</button>
              <button className="min-h-10 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={archiveReason.trim().length < 3 || Boolean(pendingId)} onClick={archiveDocument} type="button">
                {pendingId === documentToArchive.id ? copy.archiving : copy.archiveConfirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
