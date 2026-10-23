"use client";

import { useState } from "react";
import { CheckCircle2, Clipboard, ClipboardCheck, FileText, Sparkles } from "lucide-react";

import type { DocumentPresentationSummary, DocumentSummaryField } from "@/lib/documents/presentation";

type DocumentExtractionOverviewProps = {
  locale: string;
  summary: DocumentPresentationSummary;
  confidenceOverall?: number | string | null;
  providerLabel?: string | null;
  technicalDetails?: string | null;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      extractedTitle: "What the system found",
      extractedEmpty: "No structured details were extracted yet.",
      lineItems: "Line items found",
      confidence: "Confidence",
      extractedText: "Extracted text",
      extractedTextBody:
        "Open this only if you want to verify what the document parser actually used for its summary.",
      technicalDetails: "Technical details",
      copyText: "Copy text",
      copyDetails: "Copy details",
      copied: "Copied",
    };
  }

  return {
    extractedTitle: "Lo que encontró el sistema",
    extractedEmpty: "Todavía no se extrajeron detalles estructurados.",
    lineItems: "Partidas detectadas",
    confidence: "Confianza",
    extractedText: "Texto extraído",
    extractedTextBody:
      "Ábrelo solo si quieres validar el texto que el sistema usó para construir su resumen.",
    technicalDetails: "Detalles técnicos",
    copyText: "Copiar texto",
    copyDetails: "Copiar detalles",
    copied: "Copiado",
  };
}

function formatConfidence(value?: number | string | null) {
  if (value == null || value === "") {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return `${Math.round(numericValue * 100)}%`;
}

function fieldLabelForLocale(locale: string, field: DocumentSummaryField) {
  const englishLabels: Record<string, string> = {
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
  };

  const spanishLabels: Record<string, string> = {
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
  };

  if (!field.key) {
    return field.rawLabel;
  }

  if (locale === "en") {
    return englishLabels[field.key] ?? field.rawLabel;
  }

  return spanishLabels[field.key] ?? field.rawLabel;
}

function CopyTextButton({
  locale,
  text,
  variant = "text",
}: {
  locale: string;
  text: string;
  variant?: "text" | "details";
}) {
  const copy = copyForLocale(locale);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-semibold text-accent transition hover:bg-surface"
      onClick={() => void handleCopy()}
      type="button"
    >
      {copied ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
      {copied ? copy.copied : variant === "details" ? copy.copyDetails : copy.copyText}
    </button>
  );
}

export function DocumentExtractionOverview({
  locale,
  summary,
  confidenceOverall,
  providerLabel,
  technicalDetails,
}: DocumentExtractionOverviewProps) {
  const copy = copyForLocale(locale);
  const confidenceLabel = formatConfidence(confidenceOverall);

  return (
    <div className="mt-4 rounded-xl border border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface text-accent">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">{copy.extractedTitle}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted/80">
              {providerLabel ? <span>{providerLabel}</span> : null}
              {confidenceLabel ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 font-semibold text-accent">
                  <CheckCircle2 className="h-3 w-3" />
                  {copy.confidence}: {confidenceLabel}
                </span>
              ) : null}
              {summary.lineItemCount > 0 ? (
                <span className="rounded-full bg-tint px-2 py-0.5 font-semibold text-muted">
                  {copy.lineItems}: {summary.lineItemCount}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {summary.fields.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.fields.map((field) => (
              <div
                key={`${field.rawLabel}-${field.value}`}
                className={`rounded-xl border border-line bg-tint px-3 py-3 ${
                  field.value.length > 64 ? "sm:col-span-2" : ""
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted/70">
                  {fieldLabelForLocale(locale, field)}
                </p>
                <p className="mt-1 text-sm font-medium leading-6 text-ink">{field.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">{copy.extractedEmpty}</p>
        )}

        {summary.normalizedText ? (
          <details className="rounded-xl border border-line bg-tint px-4 py-3">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{copy.extractedText}</p>
                  <p className="mt-1 text-xs leading-5 text-muted/75">{copy.extractedTextBody}</p>
                </div>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-card text-accent">
                  <FileText className="h-4 w-4" />
                </span>
              </div>
            </summary>

            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-3 flex justify-end">
                <CopyTextButton locale={locale} text={summary.normalizedText} />
              </div>
              <pre className="whitespace-pre-wrap rounded-xl bg-card p-3 text-xs leading-6 text-muted">
                {summary.normalizedText}
              </pre>
            </div>
          </details>
        ) : null}

        {technicalDetails ? (
          <details className="rounded-xl border border-line bg-tint px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              {copy.technicalDetails}
            </summary>
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-3 flex justify-end">
                <CopyTextButton locale={locale} text={technicalDetails} variant="details" />
              </div>
              <pre className="overflow-x-auto rounded-xl bg-ink p-4 text-xs text-surface-2">
                {technicalDetails}
              </pre>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
