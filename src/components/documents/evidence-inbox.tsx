"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, FileUp, Link2, Loader2, Mail, MessageCircle, Route, Sparkles, Truck, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";

import { DocumentSourceTrace } from "@/components/documents/document-source-trace";
import { useToast } from "@/components/ui/toast-provider";
import { formatRegionalDateTime } from "@/lib/dates";
import type { EvidenceMatchReason, EvidenceRouteSummary, RecentDocumentRecord } from "@/lib/documents/repository";
import { enumLabel } from "@/lib/i18n/enum-labels";

type EvidenceInboxProps = {
  locale: string;
  canManage: boolean;
  documents: RecentDocumentRecord[];
  shipmentOptions: EvidenceRouteSummary[];
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      title: "Inbox",
      queueEyebrow: "Unlinked evidence",
      documentEyebrow: "Document",
      decisionEyebrow: "Route decision",
      empty: "All recent evidence is connected to a route.",
      readOnly: "Only admins and operators can connect evidence to routes.",
      noRoutes: "Create a route first so incoming evidence has somewhere to land.",
      noSuggestion: "No confident route suggestion yet. Choose a route manually when the context is clear.",
      suggestion: "Best route suggestion",
      suggestionAction: "Link suggested route",
      manualAction: "Link selected route",
      linking: "Linking...",
      chooseRoute: "Choose a route",
      openRoute: "Open route",
      openFile: "Open file",
      selectPrompt: "Select an item to review it.",
      reasonsTitle: "Why this was suggested",
      manualTitle: "Choose another route",
      confidence: "confidence",
      previewUnavailable: "Preview unavailable. Open the stored file to review it.",
      clearTitle: "Inbox clear",
      clearBody: "New unlinked evidence will appear here.",
      routePickerLabel: "Route",
      noSummary: "No structured details were extracted yet.",
      linkFailed: "We could not connect that document right now.",
      linkFailedTitle: "Link failed",
      linkSuccessTitle: "Evidence linked",
      linkSuccessBody: "The document is now attached to the route packet.",
      keyboardHint: "↑↓ navigate · Enter links the suggestion",
      dropHint: "Drop files to upload them as evidence",
      uploading: "Uploading…",
      uploadSuccessTitle: "Evidence uploaded",
      uploadSuccessBody: "The file landed in the inbox and is ready to triage.",
      uploadFailedTitle: "Upload failed",
      uploadFailed: "We could not upload that file right now.",
      summaryLabels: {
        purchaseOrderNumber: "Purchase order",
        invoiceNumber: "Invoice",
        shipmentReference: "Route reference",
        sellerName: "Seller",
        supplierName: "Supplier",
        buyerName: "Buyer",
        companyName: "Company",
        invoiceAmount: "Amount",
        totalAmount: "Total",
        purchaseDate: "Purchase date",
        invoiceDate: "Invoice date",
        deliveryDate: "Delivery date",
        shippingDestination: "Destination",
        billingAddress: "Billing",
        receiverName: "Receiver",
      },
      reasons: {
        route_reference: "The document includes a route reference that matches.",
        purchase_order: "The purchase order number lines up with this route.",
        service_date: "The service date is consistent with this route.",
        delivery_location: "The delivery location appears in the document.",
        customer_name: "The client name shows up in the document context.",
        shipper_name: "The requesting brand matches the document context.",
        carrier_name: "The carrier name shows up in the document context.",
      } satisfies Record<EvidenceMatchReason, string>,
    };
  }

  return {
    title: "Bandeja",
    queueEyebrow: "Evidencia por ligar",
    documentEyebrow: "Documento",
    decisionEyebrow: "Decisión de ruta",
    empty: "Toda la evidencia reciente ya está conectada con una ruta.",
    readOnly: "Solo admins y operadores pueden conectar evidencia con rutas.",
    noRoutes: "Primero crea una ruta para que la evidencia entrante tenga dónde aterrizar.",
    noSuggestion: "Todavía no hay una sugerencia confiable. Elige la ruta manualmente cuando el contexto ya sea claro.",
    suggestion: "Mejor sugerencia de ruta",
    suggestionAction: "Ligar ruta sugerida",
    manualAction: "Ligar ruta seleccionada",
    linking: "Ligando...",
    chooseRoute: "Elegir ruta",
    openRoute: "Abrir ruta",
    openFile: "Abrir archivo",
    selectPrompt: "Selecciona un elemento para revisarlo.",
    reasonsTitle: "Por qué se sugirió",
    manualTitle: "Elegir otra ruta",
    confidence: "de confianza",
    previewUnavailable: "La vista previa no está disponible. Abre el archivo almacenado para revisarlo.",
    clearTitle: "Bandeja al día",
    clearBody: "La nueva evidencia sin ligar aparecerá aquí.",
    routePickerLabel: "Ruta",
    noSummary: "Todavía no se extrajeron detalles estructurados.",
    linkFailed: "No pudimos conectar ese documento en este momento.",
    linkFailedTitle: "No se pudo ligar",
    linkSuccessTitle: "Evidencia ligada",
    linkSuccessBody: "El documento ya está ligado al paquete de la ruta.",
    keyboardHint: "↑↓ navegar · Enter liga la sugerencia",
    dropHint: "Suelta archivos para subirlos como evidencia",
    uploading: "Subiendo…",
    uploadSuccessTitle: "Evidencia subida",
    uploadSuccessBody: "El archivo llegó a la bandeja y está listo para revisar.",
    uploadFailedTitle: "No se pudo subir",
    uploadFailed: "No pudimos subir ese archivo en este momento.",
    summaryLabels: {
      purchaseOrderNumber: "Orden de compra",
      invoiceNumber: "Factura",
      shipmentReference: "Referencia de ruta",
      sellerName: "Vendedor",
      supplierName: "Proveedor",
      buyerName: "Comprador",
      companyName: "Empresa",
      invoiceAmount: "Importe",
      totalAmount: "Total",
      purchaseDate: "Fecha de compra",
      invoiceDate: "Fecha de factura",
      deliveryDate: "Fecha de entrega",
      shippingDestination: "Destino",
      billingAddress: "Facturación",
      receiverName: "Recibe",
    },
    reasons: {
      route_reference: "El documento incluye una referencia de ruta que coincide.",
      purchase_order: "El número de orden de compra cuadra con esta ruta.",
      service_date: "La fecha de servicio es consistente con esta ruta.",
      delivery_location: "La ubicación de entrega aparece en el documento.",
      customer_name: "El nombre del cliente aparece en el contexto del documento.",
      shipper_name: "La marca o solicitante coincide con el documento.",
      carrier_name: "El carrier aparece en el contexto del documento.",
    } satisfies Record<EvidenceMatchReason, string>,
  };
}

function fieldLabel(
  labels: ReturnType<typeof copyForLocale>["summaryLabels"],
  field: RecentDocumentRecord["summary"]["fields"][number],
) {
  if (!field.key) {
    return field.rawLabel;
  }

  return labels[field.key] ?? field.rawLabel;
}

function routeOptionLabel(route: EvidenceRouteSummary) {
  return [route.shipmentReference, route.customerName, route.deliveryLocationName].filter(Boolean).join(" · ");
}

function SourceIcon({ channel, className }: { channel: string; className?: string }) {
  if (channel === "whatsapp") {
    return <MessageCircle className={className} />;
  }

  if (channel === "email") {
    return <Mail className={className} />;
  }

  return <FileUp className={className} />;
}

function inferDocumentType(file: File) {
  if (file.type.startsWith("image/")) {
    return "photo";
  }

  if (file.type === "application/pdf") {
    return "pdf";
  }

  if (
    file.type.includes("spreadsheet") ||
    file.type === "text/csv" ||
    /\.(csv|xlsx|xls)$/i.test(file.name)
  ) {
    return "spreadsheet_import";
  }

  return "other";
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable;
}

export function EvidenceInbox({
  locale,
  canManage,
  documents: initialDocuments,
  shipmentOptions,
}: EvidenceInboxProps) {
  const copy = copyForLocale(locale);
  const router = useRouter();
  const { showToast } = useToast();
  const [documents, setDocuments] = useState(initialDocuments);
  const [selectedId, setSelectedId] = useState<string | null>(initialDocuments[0]?.id ?? null);
  const [selectedRouteByDocument, setSelectedRouteByDocument] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [linkingDocumentId, setLinkingDocumentId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const dragDepthRef = useRef(0);
  const [, startTransition] = useTransition();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the connected editing draft synchronized with refreshed external state.
    setDocuments(initialDocuments);
    setSelectedId((current) =>
      current && initialDocuments.some((document) => document.id === current)
        ? current
        : initialDocuments[0]?.id ?? null,
    );
    setSelectedRouteByDocument(
      Object.fromEntries(
        initialDocuments.map((document) => [document.id, document.candidateShipments[0]?.shipmentId ?? ""]),
      ),
    );
  }, [initialDocuments]);

  const routeOptions = useMemo(
    () =>
      shipmentOptions.map((route) => ({
        value: route.shipmentId,
        label: routeOptionLabel(route),
      })),
    [shipmentOptions],
  );

  const selectedDocument = documents.find((document) => document.id === selectedId) ?? null;

  async function handleLink(documentId: string, shipmentId: string, confidence?: number) {
    if (!shipmentId) {
      return;
    }

    setError("");
    setLinkingDocumentId(documentId);

    try {
      const response = await fetch(`/api/documents/${documentId}/shipment-link`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          shipmentId,
          confidence,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? copy.linkFailed);
      }

      setDocuments((current) => {
        const next = current.filter((document) => document.id !== documentId);

        setSelectedId((currentSelected) =>
          currentSelected === documentId ? next[0]?.id ?? null : currentSelected,
        );

        return next;
      });
      showToast({
        title: copy.linkSuccessTitle,
        message: copy.linkSuccessBody,
        variant: "success",
      });
      startTransition(() => router.refresh());
    } catch (linkError) {
      const message = linkError instanceof Error ? linkError.message : copy.linkFailed;
      setError(message);
      showToast({
        title: copy.linkFailedTitle,
        message,
        variant: "error",
      });
    } finally {
      setLinkingDocumentId(null);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target) || documents.length === 0) {
        return;
      }

      const index = documents.findIndex((document) => document.id === selectedId);

      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        setSelectedId(documents[Math.min(index + 1, documents.length - 1)]?.id ?? null);
      } else if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        setSelectedId(documents[Math.max(index - 1, 0)]?.id ?? null);
      } else if (event.key === "Enter" && canManage && selectedId) {
        const suggestion = documents[index]?.candidateShipments[0];

        if (suggestion && !linkingDocumentId) {
          event.preventDefault();
          void handleLink(selectedId, suggestion.shipmentId, suggestion.confidence);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, selectedId, canManage, linkingDocumentId]);

  async function uploadFiles(files: File[]) {
    if (!canManage || files.length === 0) {
      return;
    }

    setUploadingCount((current) => current + files.length);

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.set("documentType", inferDocumentType(file));
        formData.set("file", file);
        formData.set("sourceChannel", "upload");
        formData.set("language", locale);

        const response = await fetch("/api/documents/intake", { method: "POST", body: formData });
        const payload = (await response.json()) as { ok?: boolean; error?: string };

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? copy.uploadFailed);
        }

        showToast({
          title: copy.uploadSuccessTitle,
          message: file.name,
          variant: "success",
        });
      } catch (uploadError) {
        showToast({
          title: copy.uploadFailedTitle,
          message: uploadError instanceof Error ? uploadError.message : copy.uploadFailed,
          variant: "error",
        });
      } finally {
        setUploadingCount((current) => current - 1);
      }
    }

    startTransition(() => router.refresh());
  }

  function onDragEnter(event: React.DragEvent) {
    if (!canManage || !event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  }

  function onDragOver(event: React.DragEvent) {
    if (!canManage || !event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
  }

  function onDragLeave(event: React.DragEvent) {
    if (!canManage) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setDragActive(false);
    }
  }

  function onDrop(event: React.DragEvent) {
    if (!canManage) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    void uploadFiles([...event.dataTransfer.files]);
  }

  const selectedRouteId = selectedDocument
    ? selectedRouteByDocument[selectedDocument.id] ?? selectedDocument.candidateShipments[0]?.shipmentId ?? ""
    : "";
  const suggestion = selectedDocument?.candidateShipments[0] ?? null;
  const isLinking = Boolean(selectedDocument) && linkingDocumentId === selectedDocument?.id;
  const previewKind = selectedDocument?.signedReadUrl
    ? selectedDocument.mimeType?.startsWith("image/")
      ? "image"
      : selectedDocument.mimeType === "application/pdf"
        ? "pdf"
        : null
    : null;

  return (
    <article
      className={`relative flex h-full min-h-0 flex-col overflow-y-auto bg-card xl:grid xl:grid-cols-[minmax(250px,300px)_minmax(420px,1fr)_minmax(300px,360px)] xl:overflow-hidden 2xl:grid-cols-[minmax(270px,320px)_minmax(480px,1fr)_minmax(320px,390px)] ${
        dragActive ? "bg-surface" : ""
      }`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dragActive ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent bg-surface/90 backdrop-blur-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-contrast shadow-lg shadow-accent/20">
            <UploadCloud className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold text-ink">{copy.dropHint}</p>
        </div>
      ) : null}
      {uploadingCount > 0 ? (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-medium text-muted shadow-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
          {copy.uploading}
        </div>
      ) : null}

      <section className="flex min-h-[280px] flex-shrink-0 flex-col border-b border-line-2 bg-tint/65 xl:min-h-0 xl:border-b-0 xl:border-r">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-line-2 px-4 py-3.5">
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted/55">
              {copy.queueEyebrow}
            </p>
            <h2 className="mt-1 font-display text-sm font-semibold text-ink">{copy.title}</h2>
          </div>
          <span className="min-w-7 rounded-lg bg-amber-50 px-2 py-1 text-center text-xs font-bold tabular-nums text-amber-700 ring-1 ring-amber-200/70">
            {documents.length}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2.5 max-xl:max-h-72">
          {documents.length === 0 ? (
            <div className="flex h-full min-h-44 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/70">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <p className="text-sm font-semibold text-ink">{copy.clearTitle}</p>
              <p className="max-w-48 text-xs leading-5 text-muted/70">{copy.clearBody}</p>
            </div>
          ) : (
            documents.map((document) => {
              const candidate = document.candidateShipments[0];
              const isSelected = document.id === selectedId;

              return (
                <button
                  className={`mb-1 flex w-full gap-2.5 rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
                    isSelected
                      ? "border-accent/20 bg-card shadow-sm"
                      : "border-transparent hover:border-line hover:bg-card/75"
                  }`}
                  key={document.id}
                  onClick={() => setSelectedId(document.id)}
                  type="button"
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
                      document.sourceChannel === "whatsapp"
                        ? "bg-emerald-50 text-emerald-600"
                        : document.sourceChannel === "email"
                          ? "bg-sky-50 text-sky-600"
                          : "bg-surface text-accent"
                    }`}
                  >
                    <SourceIcon channel={document.sourceChannel} className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className={`truncate text-sm ${isSelected ? "font-semibold text-ink" : "font-medium text-ink"}`}>
                        {document.originalFileName}
                      </span>
                      <span className="flex-shrink-0 text-[10px] tabular-nums text-muted/55">
                        {formatRegionalDateTime(new Date(document.createdAt).toISOString(), locale, {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-muted/65">
                      {enumLabel(locale, document.documentType)}
                    </span>
                    {candidate ? (
                      <span className="mt-2 flex max-w-full items-center justify-between gap-2 border-t border-line-2 pt-2 text-[11px] font-semibold text-accent">
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <Sparkles className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{candidate.shipmentReference}</span>
                        </span>
                        <span className="flex-shrink-0 tabular-nums text-muted/60">
                          {Math.round(candidate.confidence * 100)}%
                        </span>
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {documents.length > 0 ? (
          <p className="hidden flex-shrink-0 border-t border-line-2 px-4 py-2 text-[10px] text-muted/50 xl:block">
            {copy.keyboardHint}
          </p>
        ) : null}
      </section>

      <section className="flex min-h-[440px] flex-shrink-0 flex-col border-b border-line-2 bg-card xl:min-h-0 xl:border-b-0 xl:border-r">
        {selectedDocument ? (
          <>
            <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-line-2 px-5 py-3.5">
              <div className="min-w-0">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted/55">
                  {copy.documentEyebrow}
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-ink">{selectedDocument.originalFileName}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted/80">
                  <span className="font-semibold text-muted">
                    {enumLabel(locale, selectedDocument.documentType)}
                  </span>
                  <span aria-hidden className="text-line">/</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-muted">
                    <SourceIcon channel={selectedDocument.sourceChannel} className="h-3 w-3" />
                    {enumLabel(locale, selectedDocument.sourceChannel)}
                  </span>
                </div>
              </div>
              {selectedDocument.signedReadUrl ? (
                <a
                  className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-2 text-xs font-semibold text-accent transition hover:border-accent/30 hover:bg-tint"
                  href={selectedDocument.signedReadUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {copy.openFile}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="overflow-hidden rounded-2xl border border-line bg-surface/55">
                {previewKind === "image" && selectedDocument.signedReadUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={selectedDocument.originalFileName}
                    className="h-[min(42dvh,420px)] min-h-56 w-full object-contain"
                    src={selectedDocument.signedReadUrl}
                  />
                ) : previewKind === "pdf" && selectedDocument.signedReadUrl ? (
                  <iframe
                    className="h-[min(42dvh,420px)] min-h-56 w-full bg-card"
                    src={selectedDocument.signedReadUrl}
                    title={selectedDocument.originalFileName}
                  />
                ) : (
                  <div className="flex min-h-56 items-center justify-center px-8 py-12 text-center">
                    <p className="max-w-sm text-sm leading-6 text-muted/70">{copy.previewUnavailable}</p>
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
                {selectedDocument.summary.fields.length > 0 ? (
                  selectedDocument.summary.fields.slice(0, 6).map((field) => (
                    <div className="min-w-0 bg-card px-3.5 py-3" key={`${field.rawLabel}-${field.value}`}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/60">
                        {fieldLabel(copy.summaryLabels, field)}
                      </p>
                      <p className="mt-1 truncate text-sm font-medium text-ink" title={field.value}>
                        {field.value}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="bg-card px-4 py-4 text-sm text-muted sm:col-span-2">{copy.noSummary}</p>
                )}
              </div>

              <DocumentSourceTrace
                locale={locale}
                provenance={selectedDocument.provenance}
                sourceChannel={selectedDocument.sourceChannel}
              />
            </div>
          </>
        ) : documents.length > 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted">{copy.selectPrompt}</div>
        ) : (
          <div className="flex h-full min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
            <Truck aria-hidden className="h-20 w-20 text-ink/[0.06]" strokeWidth={1} />
            <div>
              <p className="text-sm font-semibold text-ink">{copy.clearTitle}</p>
              <p className="mt-1 text-xs text-muted/65">{copy.empty}</p>
            </div>
          </div>
        )}
      </section>

      <aside className="flex min-h-[380px] flex-shrink-0 flex-col bg-surface/45 xl:min-h-0">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-line-2 px-4 py-3.5">
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted/55">
              {copy.decisionEyebrow}
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {suggestion?.shipmentReference ?? copy.chooseRoute}
            </p>
          </div>
          {suggestion ? (
            <span className="rounded-lg bg-card px-2 py-1 text-xs font-bold tabular-nums text-accent ring-1 ring-line">
              {Math.round(suggestion.confidence * 100)}%
            </span>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error ? (
            <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-700">{error}</p>
          ) : null}
          {!canManage ? <p className="mb-4 text-xs leading-5 text-muted/75">{copy.readOnly}</p> : null}

          {selectedDocument ? (
            <>
              {suggestion ? (
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-accent">
                    <Sparkles className="h-3.5 w-3.5" />
                    {copy.suggestion}
                  </div>
                  <p className="mt-3 text-lg font-semibold tracking-tight text-ink">
                    {suggestion.shipmentReference}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-muted/75">
                    {[suggestion.customerName, suggestion.deliveryLocationName].filter(Boolean).join(" · ")}
                  </p>

                  <div className="mt-4 flex items-baseline gap-2 border-y border-line-2 py-3">
                    <span className="font-display text-3xl font-bold tracking-tight text-ink">
                      {Math.round(suggestion.confidence * 100)}%
                    </span>
                    <span className="text-xs font-medium text-muted/65">{copy.confidence}</span>
                  </div>

                  <div className="mt-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/60">
                      {copy.reasonsTitle}
                    </p>
                    <div className="mt-2 space-y-2">
                      {suggestion.reasons.map((reason) => (
                        <div className="flex items-start gap-2 text-xs leading-5 text-muted/80" key={reason}>
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
                          <span>{copy.reasons[reason]}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-2">
                    {canManage ? (
                      <button
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/20 transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={Boolean(linkingDocumentId)}
                        onClick={() =>
                          void handleLink(selectedDocument.id, suggestion.shipmentId, suggestion.confidence)
                        }
                        type="button"
                      >
                        <Link2 className="h-4 w-4" />
                        {isLinking ? copy.linking : copy.suggestionAction}
                      </button>
                    ) : null}
                    <Link
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-4 py-2.5 text-xs font-semibold text-accent transition hover:border-accent/30 hover:bg-tint"
                      href={`/routes/${suggestion.shipmentId}`}
                      onFocus={() => {
                        router.prefetch(`/routes/${suggestion.shipmentId}`);
                      }}
                      onMouseEnter={() => {
                        router.prefetch(`/routes/${suggestion.shipmentId}`);
                      }}
                    >
                      {copy.openRoute}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="text-sm leading-6 text-muted">{copy.noSuggestion}</p>
              )}

              <div className="mt-6 border-t border-line pt-5">
                <p className="text-sm font-semibold text-ink">{copy.manualTitle}</p>
                <label className="mt-3 grid gap-1.5 text-xs font-semibold text-muted">
                  {copy.routePickerLabel}
                  <select
                    className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
                    disabled={!canManage || routeOptions.length === 0 || Boolean(linkingDocumentId)}
                    onChange={(event) =>
                      setSelectedRouteByDocument((current) => ({
                        ...current,
                        [selectedDocument.id]: event.target.value,
                      }))
                    }
                    value={selectedRouteId}
                  >
                    <option value="">{copy.chooseRoute}</option>
                    {routeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {routeOptions.length === 0 ? (
                  <p className="mt-2 text-xs leading-5 text-muted/75">{copy.noRoutes}</p>
                ) : canManage ? (
                  <button
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-accent/30 hover:bg-tint disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!selectedRouteId || Boolean(linkingDocumentId)}
                    onClick={() => void handleLink(selectedDocument.id, selectedRouteId)}
                    type="button"
                  >
                    <Route className="h-4 w-4 text-accent" />
                    {isLinking ? copy.linking : copy.manualAction}
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex min-h-52 items-center justify-center text-center">
              <p className="max-w-56 text-sm leading-6 text-muted/70">
                {documents.length > 0 ? copy.selectPrompt : copy.noSuggestion}
              </p>
            </div>
          )}
        </div>
      </aside>
    </article>
  );
}
