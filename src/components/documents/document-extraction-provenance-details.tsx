import { ChevronDown, ShieldCheck } from "lucide-react";

import type { ExtractionProvenanceSummary } from "@/lib/documents/extraction-provenance";
import { enumLabel } from "@/lib/i18n/enum-labels";

type DocumentExtractionProvenanceDetailsProps = {
  locale: string;
  provenance: ExtractionProvenanceSummary;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      title: "AI processing",
      provider: "Provider",
      model: "Model",
      upstreamProvider: "Model host",
      route: "Execution",
      primaryRoute: "Primary route",
      fallbackRoute: "Fallback route",
      fallbackAfter: "Fallback after",
      sourceFacts: "Source facts",
      factsLinked: (linked: number, total: number) =>
        `${linked} of ${total} linked to retained source evidence`,
      noFacts: "No facts returned",
      reused: "Reused from matching retained evidence",
      externalBoundary:
        "The stored file and available intake context were sent through OpenRouter to the selected model provider. Provider routing and fact sources are retained for review.",
      reusedExternalBoundary:
        "This result reuses retained evidence from an earlier OpenRouter extraction. No new provider request was made for this document.",
      configuredBoundary:
        "Processing used the configured extraction service. Provider routing and fact sources are retained for review.",
    };
  }

  return {
    title: "Procesamiento con IA",
    provider: "Proveedor",
    model: "Modelo",
    upstreamProvider: "Alojamiento del modelo",
    route: "Ejecución",
    primaryRoute: "Ruta principal",
    fallbackRoute: "Ruta de respaldo",
    fallbackAfter: "Respaldo después de",
    sourceFacts: "Hechos con fuente",
    factsLinked: (linked: number, total: number) =>
      `${linked} de ${total} ligados a evidencia fuente conservada`,
    noFacts: "No se devolvieron hechos",
    reused: "Reutilizado desde evidencia conservada coincidente",
    externalBoundary:
      "El archivo almacenado y el contexto disponible de ingreso se enviaron mediante OpenRouter al proveedor del modelo seleccionado. La ruta del proveedor y las fuentes quedan conservadas para revisión.",
    reusedExternalBoundary:
      "Este resultado reutiliza evidencia conservada de una extracción anterior con OpenRouter. No se hizo una nueva solicitud al proveedor para este documento.",
    configuredBoundary:
      "El procesamiento usó el servicio de extracción configurado. La ruta del proveedor y las fuentes quedan conservadas para revisión.",
  };
}

export function DocumentExtractionProvenanceDetails({
  locale,
  provenance,
}: DocumentExtractionProvenanceDetailsProps) {
  const copy = copyForLocale(locale);
  const routeLabel = provenance.fallbackFrom
    ? `${copy.fallbackAfter} ${enumLabel(locale, provenance.fallbackFrom.provider)}`
    : provenance.isFallbackRun
      ? copy.fallbackRoute
      : copy.primaryRoute;

  return (
    <details className="group mt-3 rounded-xl border border-line bg-card px-3 py-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-ink">
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" />
          {copy.title}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted transition group-open:rotate-180" />
      </summary>

      <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-muted">{copy.provider}</dt>
          <dd className="mt-0.5 text-ink">{enumLabel(locale, provenance.provider)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted">{copy.model}</dt>
          <dd className="mt-0.5 break-all text-ink">{provenance.model ?? "—"}</dd>
        </div>
        {provenance.upstreamProvider ? (
          <div>
            <dt className="font-semibold text-muted">{copy.upstreamProvider}</dt>
            <dd className="mt-0.5 text-ink">{provenance.upstreamProvider}</dd>
          </div>
        ) : null}
        <div>
          <dt className="font-semibold text-muted">{copy.route}</dt>
          <dd className="mt-0.5 text-ink">{routeLabel}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold text-muted">{copy.sourceFacts}</dt>
          <dd className="mt-0.5 text-ink">
            {provenance.factCount > 0
              ? copy.factsLinked(
                  provenance.sourceLinkedFactCount,
                  provenance.factCount,
                )
              : copy.noFacts}
          </dd>
        </div>
      </dl>

      {provenance.reusedFromStoredEvidence ? (
        <p className="mt-3 rounded-lg bg-surface px-2.5 py-2 text-[11px] font-semibold text-muted">
          {copy.reused}
        </p>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        {provenance.reusedFromStoredEvidence && provenance.externalProcessing
          ? copy.reusedExternalBoundary
          : provenance.externalProcessing
            ? copy.externalBoundary
            : copy.configuredBoundary}
      </p>
    </details>
  );
}
