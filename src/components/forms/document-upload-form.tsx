"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { DocumentExtractionOverview } from "@/components/documents/document-extraction-overview";
import { FilePickerInput } from "@/components/ui/file-picker-input";
import { useToast } from "@/components/ui/toast-provider";
import { buildDocumentPresentationSummary, extractNormalizedTextFromArtifacts } from "@/lib/documents/presentation";
import { enumLabel } from "@/lib/i18n/enum-labels";

const documentTypes = [
  "customer_po",
  "shipper_po",
  "retailer_receipt",
  "pod",
  "carrier_invoice",
  "broker_invoice",
  "vendor_invoice",
  "credit_note",
  "photo",
  "pdf",
  "spreadsheet_import",
  "other",
] as const;

function isDocumentType(value: string | null): value is (typeof documentTypes)[number] {
  return Boolean(value && documentTypes.includes(value as (typeof documentTypes)[number]));
}

type DocumentUploadFormProps = {
  locale: string;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      title: "Upload shipment evidence",
      body: "Add a purchase order, POD, invoice, photo, or other shipment file into the authenticated workspace intake flow.",
      routeContextTitle: "Adding evidence for route",
      routeContextBody:
        "Anything you upload here will be linked back to this route automatically so the missing check can clear without extra steps.",
      routeContextSuggested: "Suggested type",
      backToRoute: "Back to route",
      typeLabel: "Document type",
      fileLabel: "File",
      submit: "Upload file",
      processed: "Document processed",
      queued: "Document saved and queued",
      saved: "Document saved",
      savedTitle: "Evidence saved",
      savedToastBody: "The file now belongs to this workspace and appears in recent evidence.",
      linkedToastTitle: "Evidence linked to route",
      linkedToastBody: "The file was attached to this route and now appears in its evidence packet.",
      linkFailedTitle: "Evidence saved, but not linked",
      processedTitle: "Extraction completed",
      processedBody: "The document was processed immediately and the extracted summary is ready to review.",
      queuedTitle: "Extraction queued",
      queuedBody: "The file was saved and queued for background processing.",
      uploadFailedTitle: "Upload failed",
      openFile: "Open stored file",
      savedPanelBody: "The file is now part of this workspace and appears in recent evidence below.",
      authNote: "The workspace is inferred from your signed-in session.",
      extractionErrorPrefix: "Extraction issue",
      documentIdLabel: "Document ID",
    };
  }

  return {
    title: "Cargar evidencia del embarque",
    body: "Agrega una orden de compra, POD, factura, foto u otro archivo del embarque al flujo autenticado de ingesta del espacio de trabajo.",
    routeContextTitle: "Agregando evidencia para la ruta",
    routeContextBody:
      "Cualquier archivo que subas aquí se ligará automáticamente a esta ruta para que el check faltante se cierre sin pasos extra.",
    routeContextSuggested: "Tipo sugerido",
    backToRoute: "Volver a la ruta",
    typeLabel: "Tipo de documento",
    fileLabel: "Archivo",
    submit: "Subir archivo",
    processed: "Documento procesado",
    queued: "Documento guardado y encolado",
    saved: "Documento guardado",
    savedTitle: "Evidencia guardada",
    savedToastBody: "El archivo ya forma parte de este espacio y aparece en la evidencia reciente.",
    linkedToastTitle: "Evidencia ligada a la ruta",
    linkedToastBody: "El archivo quedó adjuntado a esta ruta y ya aparece dentro de su paquete de evidencia.",
    linkFailedTitle: "La evidencia se guardó, pero no se ligó",
    processedTitle: "Extracción completada",
    processedBody: "El documento se procesó al momento y el resumen extraído ya está listo para revisarse.",
    queuedTitle: "Extracción en cola",
    queuedBody: "El archivo se guardó y quedó en cola para procesamiento en segundo plano.",
    uploadFailedTitle: "No se pudo subir",
    openFile: "Abrir archivo almacenado",
    savedPanelBody: "El archivo ya forma parte de este espacio y aparece abajo en la evidencia reciente.",
    authNote: "El espacio de trabajo se toma de tu sesión autenticada.",
    extractionErrorPrefix: "Problema de extracción",
    documentIdLabel: "ID del documento",
  };
}

function readExtractionSummary(result: Record<string, unknown>) {
  const extraction = result.extraction as
    | {
        result?: {
          overallConfidence?: number | null;
          artifacts?: Array<{ artifactType?: string | null; textContent?: string | null }>;
          facts?: Array<{
            factType?: string | null;
            valueText?: string | null;
            valueNumber?: number | string | null;
            valueDate?: string | null;
          }>;
        };
        provider?: string | null;
      }
    | null
    | undefined;

  const extractionResult = extraction?.result;
  const normalizedText = extractNormalizedTextFromArtifacts(extractionResult?.artifacts);
  const summary = buildDocumentPresentationSummary({
    normalizedText,
    facts: extractionResult?.facts,
  });

  return {
    summary,
    confidenceOverall: extractionResult?.overallConfidence ?? null,
    providerLabel: extraction?.provider ?? null,
  };
}

export function DocumentUploadForm({ locale }: DocumentUploadFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const copy = copyForLocale(locale);
  const { showToast } = useToast();
  const suggestedDocumentType = searchParams.get("documentType");
  const shipmentId = searchParams.get("shipmentId");
  const shipmentReference = searchParams.get("shipmentReference");
  const shipmentHref = shipmentId ? `/routes/${shipmentId}` : null;
  const [documentType, setDocumentType] = useState<(typeof documentTypes)[number]>(
    isDocumentType(suggestedDocumentType) ? suggestedDocumentType : "customer_po",
  );
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const extractionSummary = result ? readExtractionSummary(result) : null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the connected editing draft synchronized with refreshed external state.
    setDocumentType(isDocumentType(suggestedDocumentType) ? suggestedDocumentType : "customer_po");
  }, [suggestedDocumentType]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setError("");

    if (!file) {
      setError(locale === "en" ? "Choose a file first." : "Primero selecciona un archivo.");
      showToast({
        title: copy.uploadFailedTitle,
        message: locale === "en" ? "Choose a file first." : "Primero selecciona un archivo.",
        variant: "error",
      });
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.set("documentType", documentType);
      formData.set("file", file);
      formData.set("sourceChannel", "upload");
      formData.set("language", locale);

      const response = await fetch("/api/documents/intake", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        const message = String(payload.error ?? "Upload failed.");
        setError(message);
        showToast({
          title: copy.uploadFailedTitle,
          message,
          variant: "error",
        });
        return;
      }

      let linkedPayload: Record<string, unknown> | null = null;

      if (shipmentId && typeof payload.documentId === "string") {
        const linkResponse = await fetch(`/api/documents/${payload.documentId}/shipment-link`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            shipmentId,
            confidence: 1,
            notes:
              shipmentReference && shipmentReference.length > 0
                ? `Linked from route-aware evidence intake for ${shipmentReference}.`
                : "Linked from route-aware evidence intake.",
          }),
        });

        linkedPayload = (await linkResponse.json()) as Record<string, unknown>;

        if (!linkResponse.ok) {
          showToast({
            title: copy.linkFailedTitle,
            message: String(
              linkedPayload.error ??
                (locale === "en"
                  ? "The file was saved, but we could not attach it to the route automatically."
                  : "El archivo se guardó, pero no pudimos ligarlo automáticamente a la ruta."),
            ),
            variant: "error",
          });
        }
      }

      setResult({
        ...payload,
        linkedShipmentId: shipmentId,
        linkedShipmentReference: shipmentReference,
        linkedShipmentOk: Boolean(linkedPayload?.ok),
        linkedShipmentError: linkedPayload?.ok ? null : (linkedPayload?.error ?? null),
      });
      if (Boolean(payload.extractionProcessed)) {
        showToast({
          title: copy.processedTitle,
          message:
            shipmentId && linkedPayload?.ok
              ? `${copy.processedBody} ${copy.linkedToastBody}`
              : copy.processedBody,
          variant: "success",
        });
      } else if (Boolean(payload.extractionQueued)) {
        showToast({
          title: copy.queuedTitle,
          message:
            shipmentId && linkedPayload?.ok
              ? `${copy.queuedBody} ${copy.linkedToastBody}`
              : copy.queuedBody,
          variant: "info",
        });
      } else {
        showToast({
          title: shipmentId && linkedPayload?.ok ? copy.linkedToastTitle : copy.savedTitle,
          message: shipmentId && linkedPayload?.ok ? copy.linkedToastBody : copy.savedToastBody,
          variant: "success",
        });
      }
      router.refresh();
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Upload failed.";
      setError(message);
      showToast({
        title: copy.uploadFailedTitle,
        message,
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {shipmentId && shipmentReference ? (
        <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-lg font-semibold text-ink">
                {copy.routeContextTitle}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted/80">{copy.routeContextBody}</p>
            </div>
            {shipmentHref ? (
              <Link
                href={shipmentHref}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-2 text-xs font-semibold text-accent transition hover:border-accent/30 hover:bg-tint"
              >
                {copy.backToRoute}
              </Link>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted/80">
            <span className="rounded-full border border-line bg-card px-3 py-1 font-semibold text-ink">
              {shipmentReference}
            </span>
            {isDocumentType(suggestedDocumentType) ? (
              <span className="rounded-full border border-line bg-card px-3 py-1">
                {copy.routeContextSuggested}: <span className="font-semibold text-ink">{enumLabel(locale, suggestedDocumentType)}</span>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-ink">
          {copy.title}
        </h2>

        <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">{copy.typeLabel}</span>
            <select
              className="rounded-xl border border-line px-3 py-2.5"
              onChange={(event) => setDocumentType(event.target.value as (typeof documentTypes)[number])}
              value={documentType}
            >
              {documentTypes.map((type) => (
                <option key={type} value={type}>
                  {enumLabel(locale, type)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">{copy.fileLabel}</span>
            <FilePickerInput file={file} locale={locale} onFileChange={setFile} />
          </label>

          <button
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "..." : copy.submit}
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}
      </div>

      {result && (
        <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
          <p className="text-sm font-semibold text-ink">
            {Boolean(result.extractionProcessed)
              ? copy.processed
              : Boolean(result.extractionQueued)
                ? copy.queued
                : copy.saved}
          </p>
          <p className="mt-2 text-sm text-muted/75">{copy.savedPanelBody}</p>
          <p className="mt-2 text-xs text-muted/75">
            {copy.documentIdLabel}: {String(result.documentId ?? "")}
          </p>
          {typeof result.extractionError === "string" ? (
            <p className="mt-3 text-sm text-amber-700">
              {copy.extractionErrorPrefix}: {result.extractionError}
            </p>
          ) : null}
          {Boolean(result.linkedShipmentOk) && typeof result.linkedShipmentReference === "string" ? (
            <p className="mt-3 text-sm text-emerald-700">
              {copy.linkedToastBody} <span className="font-semibold">{result.linkedShipmentReference}</span>.
            </p>
          ) : null}
          {typeof result.linkedShipmentError === "string" ? (
            <p className="mt-3 text-sm text-rose-700">{result.linkedShipmentError}</p>
          ) : null}
          {typeof result.signedReadUrl === "string" && (
            <a
              className="mt-3 inline-flex text-sm font-medium text-accent"
              href={result.signedReadUrl}
              target="_blank"
              rel="noreferrer"
            >
              {copy.openFile}
            </a>
          )}

          {Boolean(result.extractionProcessed) ? (
            <DocumentExtractionOverview
              locale={locale}
              summary={extractionSummary?.summary ?? buildDocumentPresentationSummary({})}
              confidenceOverall={extractionSummary?.confidenceOverall}
              providerLabel={extractionSummary?.providerLabel}
              technicalDetails={JSON.stringify(result, null, 2)}
            />
          ) : typeof result.extractionError === "string" ? (
            <DocumentExtractionOverview
              locale={locale}
              summary={buildDocumentPresentationSummary({})}
              technicalDetails={JSON.stringify(result, null, 2)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
