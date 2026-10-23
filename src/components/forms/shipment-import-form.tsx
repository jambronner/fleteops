"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { FilePickerInput } from "@/components/ui/file-picker-input";
import {
  getImportTypeLabel,
  supportedImportTypes,
  type SupportedImportType,
} from "@/lib/imports/contracts";
import { buildImportReviewPath, coerceImportReviewReturnPath } from "@/lib/imports/route-review-navigation";

type SourceType = "column" | "constant" | "derived" | "not_provided";
type FieldSource =
  | { type: "column"; header: string }
  | { type: "constant"; value: string }
  | { type: "derived"; strategy: "file_date" | "upload_date" }
  | { type: "not_provided" };

type AcceptedField = {
  key: string;
  label: string;
  scope: "route" | "stop";
  requirement: "required" | "recommended" | "optional";
  supportedSources: SourceType[];
};

type DirectoryOption = {
  id: string;
  label: string;
  addressLine1?: string | null;
};

export type RouteImportPreview = {
  draftId?: string;
  fileName: string;
  mappingTemplate?: string | null;
  sheetName: string | null;
  signedReadUrl?: string;
  sheets: Array<{ name: string; nonEmptyRowCount: number }>;
  sourceHeaders: string[];
  acceptedFields: AcceptedField[];
  suggestedMapping: Record<string, FieldSource>;
  mapping: Record<string, FieldSource>;
  directoryOptions: {
    locations: DirectoryOption[];
    organizations: DirectoryOption[];
  };
  result: Record<string, unknown>;
  warnings: string[];
  appliedProfile?: { id: string; name: string } | null;
};

type ShipmentImportFormProps = {
  locale: string;
  maxFileSizeMb: number;
  allowedImportTypes?: readonly SupportedImportType[];
  compact?: boolean;
  introBody?: string;
  introTitle?: string;
  rulesOverride?: string[];
  submitLabelOverride?: string;
  defaultImportType?: SupportedImportType;
  initialRoutePreview?: RouteImportPreview | null;
  returnHref?: string | null;
  reviewMode?: boolean;
};

function copyForLocale(locale: string, maxFileSizeMb: number) {
  if (locale === "en") {
    return {
      title: "Planning file intake",
      body: "Upload a structured operational file, review the mapping, then confirm the records to create.",
      typeLabel: "Import type",
      mappingLabel: "Mapping profile",
      mappingPlaceholder: "Optional profile name",
      fileLabel: "File",
      analyze: "Analyze file",
      updatePreview: "Update preview",
      replaceFile: "Replace preview file",
      openSourceFile: "Open source file",
      confirm: "Confirm import",
      cancelDraft: "Cancel draft",
      discardPreview: "Discard preview",
      accepted: "Import batch created",
      reviewKicker: "Pending import review",
      reviewStepFile: "File",
      reviewStepMapping: "Mapping",
      reviewStepExceptions: "Exceptions",
      reviewStepConfirm: "Confirm",
      reviewIntro: "Review the mapped fields, refresh the preview when you change anything, then confirm or cancel this draft.",
      previewTitle: "Route mapping preview",
      details: "Technical details",
      noActionNeeded: "No additional action is required on this screen.",
      reviewNeeded: "Review this import before continuing.",
      routesSaved: "Routes saved",
      routesUpdated: "Routes updated",
      rowsRead: "Rows read",
      deliveryStops: "Delivery stops",
      pickupStops: "Pickup stops",
      skipped: "Skipped",
      matchedLocations: "Matched locations",
      needsLocationReview: "Needs location review",
      matchedClients: "Matched clients",
      needsClientReview: "Needs client review",
      savedRoutesAction: "Draft routes were saved. Review unmatched locations before dispatch.",
      updatedRoutesAction: "Existing routes were updated with the latest statuses and stops from this file.",
      savedAndUpdatedRoutesAction:
        "New routes were saved and existing routes were updated with the latest statuses and stops.",
      duplicateAction: "No new routes were added because the file rows were already imported.",
      authNote: "The workspace is inferred from your signed-in session.",
      batchLabel: "Batch ID",
      statusLabel: "Status",
      rulesTitle: "Use this page for:",
      rules: [
        "Shipment tracker exports and route manifests with one operational table per file or selected workbook sheet.",
        "Purchase order tables exported from the client system.",
        "Directory CSVs with clients and delivery locations.",
        `CSV, XLSX, or XLS files up to ${maxFileSizeMb} MB.`,
        "Review workbook sheet, field mapping, and upload-level constants before confirming route imports.",
      ],
      warningsTitle: "Warnings",
      sourceTable: "Source table",
      workbookSheet: "Workbook sheet",
      sheets: "sheets",
      fieldMapping: "Field mapping",
      sourceType: "Source",
      sourceColumn: "Column",
      constantValue: "Constant value",
      derivedRule: "Derived rule",
      notProvided: "Not provided",
      column: "Column",
      constant: "Constant",
      derived: "Derived",
      fileDate: "Date from filename",
      uploadDate: "Upload date",
      routeFields: "Route fields",
      stopFields: "Stop fields",
      noWarehouse: "Add the warehouse in the directory, then refresh this preview.",
      restoredDraft: "Unsaved route preview restored.",
      restoredDraftBody: "The uploaded file is retained. You can adjust the mapping, confirm the import, or choose another file to replace this preview.",
      replaceDraftBody: "Choosing another file will replace the current unsaved preview.",
      missingDraft: "The saved preview is no longer available. Choose the file again to continue.",
      appliedMappingPreset: "Applied saved mapping",
      saveMappingPresetLabel: "Save mapping as preset",
      saveMappingPresetPlaceholder: "Preset name",
      savedMappingPreset: "Mapping preset saved",
    };
  }

  return {
    title: "Carga de archivo de planeación",
    body: "Sube un archivo operativo, revisa el mapeo y confirma los registros que se van a crear.",
    typeLabel: "Tipo de importación",
    mappingLabel: "Perfil de mapeo",
    mappingPlaceholder: "Nombre opcional del perfil",
    fileLabel: "Archivo",
    analyze: "Analizar archivo",
    updatePreview: "Actualizar preview",
    replaceFile: "Reemplazar archivo del preview",
    openSourceFile: "Abrir archivo fuente",
    confirm: "Confirmar importación",
    cancelDraft: "Cancelar borrador",
    discardPreview: "Descartar preview",
    accepted: "Lote de importación creado",
    reviewKicker: "Revisión de importación pendiente",
    reviewStepFile: "Archivo",
    reviewStepMapping: "Mapeo",
    reviewStepExceptions: "Excepciones",
    reviewStepConfirm: "Confirmar",
    reviewIntro: "Revisa los campos mapeados, actualiza el preview si cambias algo y después confirma o cancela este borrador.",
    previewTitle: "Preview de mapeo de rutas",
    details: "Detalles técnicos",
    noActionNeeded: "No se requiere acción adicional en esta pantalla.",
    reviewNeeded: "Revisa esta importación antes de continuar.",
    routesSaved: "Rutas guardadas",
    routesUpdated: "Rutas actualizadas",
    rowsRead: "Filas leídas",
    deliveryStops: "Paradas de entrega",
    pickupStops: "Paradas de recolección",
    skipped: "Omitidas",
    matchedLocations: "Ubicaciones enlazadas",
    needsLocationReview: "Requieren revisión de ubicación",
    matchedClients: "Clientes enlazados",
    needsClientReview: "Requieren revisión de cliente",
    savedRoutesAction: "Las rutas borrador se guardaron. Revisa las ubicaciones sin coincidencia antes de despachar.",
    updatedRoutesAction: "Las rutas existentes se actualizaron con los estatus y paradas más recientes de este archivo.",
    savedAndUpdatedRoutesAction:
      "Se guardaron rutas nuevas y las rutas existentes se actualizaron con los estatus y paradas más recientes.",
    duplicateAction: "No se agregaron rutas nuevas porque las filas del archivo ya se habían importado.",
    authNote: "El espacio de trabajo se toma de tu sesión autenticada.",
    batchLabel: "Lote",
    statusLabel: "Estatus",
    rulesTitle: "Usa esta página para:",
    rules: [
      "Exports del tracker de embarques y manifiestos de ruta con una tabla operativa por archivo o pestaña seleccionada.",
      "Tablas de órdenes de compra exportadas desde el sistema del cliente.",
      "CSVs de directorio con clientes y ubicaciones de entrega.",
      `Archivos CSV, XLSX o XLS de hasta ${maxFileSizeMb} MB.`,
      "Revisa pestaña, mapeo de campos y constantes del archivo antes de confirmar rutas.",
    ],
    warningsTitle: "Advertencias",
    sourceTable: "Tabla fuente",
    workbookSheet: "Pestaña",
    sheets: "pestañas",
    fieldMapping: "Mapeo de campos",
    sourceType: "Fuente",
    sourceColumn: "Columna",
    constantValue: "Valor constante",
    derivedRule: "Regla derivada",
    notProvided: "No proporcionado",
    column: "Columna",
    constant: "Constante",
    derived: "Derivado",
    fileDate: "Fecha del nombre del archivo",
    uploadDate: "Fecha de carga",
    routeFields: "Campos de ruta",
    stopFields: "Campos de parada",
    noWarehouse: "Agrega el almacén en el directorio y actualiza este preview.",
    restoredDraft: "Preview de rutas sin guardar restaurado.",
    restoredDraftBody: "El archivo cargado se conserva. Puedes ajustar el mapeo, confirmar la importación o elegir otro archivo para reemplazar este preview.",
    replaceDraftBody: "Elegir otro archivo reemplazará el preview sin guardar actual.",
    missingDraft: "El preview guardado ya no está disponible. Vuelve a elegir el archivo para continuar.",
    appliedMappingPreset: "Mapeo guardado aplicado",
    saveMappingPresetLabel: "Guardar mapeo como preajuste",
    saveMappingPresetPlaceholder: "Nombre del preajuste",
    savedMappingPreset: "Preajuste de mapeo guardado",
  };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function sourceTypeLabel(type: SourceType, copy: ReturnType<typeof copyForLocale>) {
  return {
    column: copy.column,
    constant: copy.constant,
    derived: copy.derived,
    not_provided: copy.notProvided,
  }[type];
}

function defaultSourceForType(type: SourceType, headers: string[], current?: FieldSource): FieldSource {
  if (type === "column") {
    return { type, header: current?.type === "column" ? current.header : headers[0] ?? "" };
  }

  if (type === "constant") {
    return { type, value: current?.type === "constant" ? current.value : "" };
  }

  if (type === "derived") {
    return { type, strategy: current?.type === "derived" ? current.strategy : "file_date" };
  }

  return { type: "not_provided" };
}

function buildFormData(args: {
  file: File;
  importType: SupportedImportType;
  mappingTemplate: string;
  preview: RouteImportPreview | null;
  fieldMappings: Record<string, FieldSource>;
}) {
  const formData = new FormData();
  formData.set("file", args.file);
  formData.set("importType", args.importType);

  if (args.mappingTemplate.trim()) {
    formData.set("mappingTemplate", args.mappingTemplate.trim());
  }

  if (args.preview?.sheetName) {
    formData.set("sheetName", args.preview.sheetName);
  }

  if (args.preview?.draftId) {
    formData.set("draftId", args.preview.draftId);
  }

  if (args.importType === "shipment_tracker" && Object.keys(args.fieldMappings).length > 0) {
    formData.set("routeManifestMapping", JSON.stringify(args.fieldMappings));
  }

  return formData;
}

function buildRouteDraftPayload(args: {
  preview: RouteImportPreview;
  importType: SupportedImportType;
  mappingTemplate: string;
  fieldMappings: Record<string, FieldSource>;
  saveProfileName?: string;
}) {
  return {
    previewBatchId: args.preview.draftId,
    draftId: args.preview.draftId,
    importType: args.importType,
    mappingTemplate: args.mappingTemplate.trim() || null,
    routeManifestMapping: args.fieldMappings,
    sheetName: args.preview.sheetName,
    ...(args.saveProfileName?.trim() ? { saveProfile: { name: args.saveProfileName.trim() } } : {}),
  };
}

export function ShipmentImportForm({
  locale,
  maxFileSizeMb,
  allowedImportTypes = supportedImportTypes,
  compact = false,
  introTitle,
  submitLabelOverride,
  defaultImportType = "shipment_tracker",
  initialRoutePreview = null,
  returnHref = "/routes",
  reviewMode = false,
}: ShipmentImportFormProps) {
  const copy = copyForLocale(locale, maxFileSizeMb);
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [mappingTemplate, setMappingTemplate] = useState(initialRoutePreview?.mappingTemplate ?? "");
  const [importType, setImportType] = useState<SupportedImportType>(defaultImportType);
  const [preview, setPreview] = useState<RouteImportPreview | null>(initialRoutePreview);
  const [fieldMappings, setFieldMappings] = useState<Record<string, FieldSource>>(
    initialRoutePreview?.mapping ?? initialRoutePreview?.suggestedMapping ?? {},
  );
  const [saveProfileName, setSaveProfileName] = useState(initialRoutePreview?.sheetName ?? "");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const availableTypes = allowedImportTypes;
  const showTypeSelector = availableTypes.length > 1;
  const title = introTitle ?? copy.title;
  const fileConstraint =
    locale === "en"
      ? `CSV, XLSX, or XLS · up to ${maxFileSizeMb} MB`
      : `CSV, XLSX o XLS · hasta ${maxFileSizeMb} MB`;
  const submitLabel = submitLabelOverride ?? (
    reviewMode
      ? file
        ? copy.replaceFile
        : copy.updatePreview
      : preview && importType === "shipment_tracker"
        ? copy.updatePreview
        : copy.analyze
  );
  const safeReturnHref = coerceImportReviewReturnPath(returnHref);
  const reviewSteps = [
    copy.reviewStepFile,
    copy.reviewStepMapping,
    copy.reviewStepExceptions,
    copy.reviewStepConfirm,
  ];

  function updateFieldSource(fieldKey: string, source: FieldSource) {
    setFieldMappings((current) => ({
      ...current,
      [fieldKey]: source,
    }));
  }

  async function analyzeRouteImport() {
    if (!file && !preview?.draftId) {
      setError(locale === "en" ? "Choose a file first." : "Primero selecciona un archivo.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = file
        ? await fetch("/api/imports/shipments/preview", {
            method: "POST",
            body: buildFormData({ file, importType, mappingTemplate, preview, fieldMappings }),
          })
        : await fetch("/api/imports/shipments/preview", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(buildRouteDraftPayload({ preview: preview as RouteImportPreview, importType, mappingTemplate, fieldMappings })),
          });
      const payload = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        setError(String(payload.error ?? "Preview failed."));
        return;
      }

      const nextPreview = payload.preview as RouteImportPreview;
      setPreview(nextPreview);
      setFieldMappings(nextPreview.mapping ?? nextPreview.suggestedMapping ?? {});
      setMappingTemplate(nextPreview.mappingTemplate ?? mappingTemplate);
      setSaveProfileName((current) => current || nextPreview.sheetName || "");
      setResult(null);

      if (!reviewMode && nextPreview.draftId) {
        router.push(buildImportReviewPath(nextPreview.draftId));
      }
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Preview failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmRouteImport() {
    if (!preview) {
      setError(locale === "en" ? "Analyze the file first." : "Primero analiza el archivo.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = preview.draftId
        ? await fetch("/api/imports/shipments", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              buildRouteDraftPayload({ preview, importType, mappingTemplate, fieldMappings, saveProfileName }),
            ),
          })
        : file
          ? await fetch("/api/imports/shipments", {
              method: "POST",
              body: buildFormData({ file, importType, mappingTemplate, preview, fieldMappings }),
            })
          : null;

      if (!response) {
        setError(copy.missingDraft);
        return;
      }

      const payload = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        setError(String(payload.error ?? "Import failed."));
        return;
      }

      setResult(payload);
      setPreview(null);
      setFile(null);
      setSaveProfileName("");
      if (reviewMode) {
        router.push(safeReturnHref);
      } else {
        router.refresh();
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelRouteDraft() {
    if (!preview?.draftId) {
      setError(copy.missingDraft);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/imports/shipments/preview?draftId=${encodeURIComponent(preview.draftId)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        setError(String(payload.error ?? "Unable to cancel this draft."));
        return;
      }

      setPreview(null);
      setFile(null);
      router.push(safeReturnHref);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Unable to cancel this draft.");
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadDirect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setError("");

    if (importType === "shipment_tracker") {
      await analyzeRouteImport();
      return;
    }

    if (!file) {
      setError(locale === "en" ? "Choose a file first." : "Primero selecciona un archivo.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/imports/shipments", {
        method: "POST",
        body: buildFormData({ file, importType, mappingTemplate, preview: null, fieldMappings: {} }),
      });
      const payload = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        setError(String(payload.error ?? "Import failed."));
        return;
      }

      setResult(payload);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const routePreviewResult = preview ? asRecord(preview.result) : null;
  const confirmedResult = result?.result && typeof result.result === "object" ? result.result as Record<string, unknown> : null;
  const summary = confirmedResult ?? routePreviewResult;
  const warnings = [
    ...(preview?.warnings ?? []),
    ...(Array.isArray(result?.warnings) ? result.warnings.map(String) : []),
  ];
  const resultStatus = String(result?.status ?? "");
  const createdRoutes = Number(confirmedResult?.created ?? 0);
  const updatedRoutes = Number(confirmedResult?.updated ?? 0);
  const rowCount = Number(summary?.rowCount ?? 0);
  const routeDraftCount = Number(summary?.routeDraftCount ?? createdRoutes);
  const deliveryStopCount = Number(summary?.deliveryStopCount ?? 0);
  const pickupStopCount = Number(summary?.pickupStopCount ?? 0);
  const skippedRows = Number(summary?.skipped ?? 0);
  const duplicateSkipped = Number(summary?.duplicateSkipped ?? 0);
  const matchedLocations = Number(summary?.matchedLocations ?? 0);
  const unmatchedLocations = Number(summary?.unmatchedLocations ?? 0);
  const matchedOrganizations = Number(summary?.matchedOrganizations ?? 0);
  const unmatchedOrganizations = Number(summary?.unmatchedOrganizations ?? 0);
  const resultNeedsReview = ["failed", "partially_completed"].includes(resultStatus) || unmatchedLocations > 0 || skippedRows > 0;
  const actionText =
    createdRoutes > 0 && updatedRoutes > 0
      ? copy.savedAndUpdatedRoutesAction
      : createdRoutes > 0
        ? copy.savedRoutesAction
        : updatedRoutes > 0
          ? copy.updatedRoutesAction
          : duplicateSkipped > 0
            ? copy.duplicateAction
            : resultNeedsReview
              ? copy.reviewNeeded
              : copy.noActionNeeded;
  const routeFields = preview?.acceptedFields.filter((field) => field.scope === "route") ?? [];
  const stopFields = preview?.acceptedFields.filter((field) => field.scope === "stop") ?? [];

  return (
    <div className={`min-w-0 max-w-full overflow-hidden rounded-2xl border border-line bg-card shadow-sm ${compact ? "p-4 sm:p-6" : "p-6"}`}>
      {reviewMode ? (
        <div className="mb-5 rounded-xl border border-line bg-tint p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted/70">{copy.reviewKicker}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {reviewSteps.map((step, index) => (
              <div
                className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs font-semibold text-ink"
                key={step}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] text-accent-contrast">
                  {index + 1}
                </span>
                <span className="truncate">{step}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm leading-5 text-muted/75">{copy.reviewIntro}</p>
        </div>
      ) : null}

      {!compact ? (
        <>
          <h2 className="font-display text-xl font-semibold text-ink">
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted/60">{fileConstraint}</p>
        </>
      ) : (
        <div className="mb-5">
          <h2 className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted/60">{fileConstraint}</p>
        </div>
      )}

      <form className="mt-5 grid min-w-0 gap-4" onSubmit={uploadDirect}>
        {showTypeSelector ? (
          <label className="grid min-w-0 gap-1.5 text-sm">
            <span className="font-medium text-ink">{copy.typeLabel}</span>
            <select
              className="w-full min-w-0 rounded-xl border border-line px-3 py-2.5"
              onChange={(event) => {
                setImportType(event.target.value as SupportedImportType);
                setPreview(null);
                setFieldMappings({});
                setResult(null);
              }}
              value={importType}
            >
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {getImportTypeLabel(type, locale)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="grid min-w-0 gap-1.5 text-sm">
          <span className="font-medium text-ink">{copy.mappingLabel}</span>
          <input
            className="w-full min-w-0 rounded-xl border border-line px-3 py-2.5"
            onChange={(event) => setMappingTemplate(event.target.value)}
            placeholder={copy.mappingPlaceholder}
            type="text"
            value={mappingTemplate}
          />
        </label>

        <label className="grid min-w-0 gap-1.5 text-sm">
          <span className="font-medium text-ink">{copy.fileLabel}</span>
          <FilePickerInput
            accept=".csv,.xlsx,.xls"
            file={file}
            fileDisplayName={!file && preview?.draftId ? preview.fileName : null}
            locale={locale}
            onFileChange={(nextFile) => {
              setFile(nextFile);
              if (!reviewMode) {
                setPreview(null);
                setFieldMappings({});
                setSaveProfileName("");
              }
              setResult(null);
            }}
          />
        </label>

        <button
          className="w-full min-w-0 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "..." : submitLabel}
        </button>
      </form>

      {reviewMode && preview?.signedReadUrl ? (
        <a
          className="mt-3 inline-flex text-xs font-semibold text-accent transition hover:text-ink"
          href={preview.signedReadUrl}
          rel="noreferrer"
          target="_blank"
        >
          {copy.openSourceFile}
        </a>
      ) : null}

      {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}

      {preview?.draftId && !reviewMode ? (
        <div className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          <p className="font-semibold text-ink">{copy.replaceDraftBody}</p>
        </div>
      ) : null}

      {preview && importType === "shipment_tracker" ? (
        <div className="mt-5 min-w-0 max-w-full rounded-2xl border border-line bg-tint p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">{copy.previewTitle}</p>
              <p className="mt-1 text-xs text-muted/70">
                {copy.sourceTable}: {preview.sheetName ?? preview.fileName}
              </p>
              {preview.appliedProfile ? (
                <p className="mt-1 text-xs font-medium text-emerald-700">
                  {copy.appliedMappingPreset}: {preview.appliedProfile.name}
                </p>
              ) : null}
            </div>
            {preview.sheets.length > 1 ? (
              <label className="grid min-w-[180px] gap-1 text-xs font-medium text-ink">
                {copy.workbookSheet}
                <select
                  className="rounded-xl border border-line bg-card px-3 py-2 text-sm font-normal"
                  onChange={(event) => {
                    const sheetName = event.target.value;
                    setPreview((current) => current ? { ...current, sheetName } : current);
                    setResult(null);
                  }}
                  value={preview.sheetName ?? preview.sheets[0]?.name ?? ""}
                >
                  {preview.sheets.map((sheet) => (
                    <option key={sheet.name} value={sheet.name}>
                      {sheet.name} ({sheet.nonEmptyRowCount})
                    </option>
                  ))}
                </select>
                <span className="text-[11px] font-normal text-muted/65">
                  {preview.sheets.length} {copy.sheets}
                </span>
              </label>
            ) : null}
          </div>

          {summary ? (
            <div className="mt-4 grid gap-2 rounded-xl border border-line bg-card p-4 text-xs text-muted sm:grid-cols-2 lg:grid-cols-4">
              {[
                [copy.routesSaved, routeDraftCount],
                [copy.deliveryStops, deliveryStopCount],
                [copy.pickupStops, pickupStopCount],
                [copy.rowsRead, rowCount],
                [copy.matchedLocations, matchedLocations],
                [copy.needsLocationReview, unmatchedLocations],
                [copy.matchedClients, matchedOrganizations],
                [copy.needsClientReview, unmatchedOrganizations],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="font-semibold text-ink">{label}</p>
                  <p className="mt-1">{String(value)}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-5 grid gap-4">
            {[
              [copy.routeFields, routeFields],
              [copy.stopFields, stopFields],
            ].map(([sectionTitle, fields]) => (
              <div key={String(sectionTitle)} className="rounded-xl border border-line bg-card p-4">
                <p className="text-sm font-semibold text-ink">{String(sectionTitle)}</p>
                <div className="mt-4 grid gap-3">
                  {(fields as AcceptedField[]).map((field) => {
                    const current = fieldMappings[field.key] ?? { type: "not_provided" as const };
                    return (
                      <div key={field.key} className="grid gap-3 rounded-xl bg-tint p-3 lg:grid-cols-[minmax(0,1fr)_180px_minmax(0,1.2fr)]">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{field.label}</p>
                          <p className="mt-0.5 text-xs capitalize text-muted/65">{field.requirement}</p>
                        </div>
                        <label className="grid gap-1 text-xs font-medium text-ink">
                          {copy.sourceType}
                          <select
                            className="rounded-xl border border-line px-3 py-2 text-sm font-normal"
                            onChange={(event) =>
                              updateFieldSource(
                                field.key,
                                defaultSourceForType(event.target.value as SourceType, preview.sourceHeaders, current),
                              )}
                            value={current.type}
                          >
                            {field.supportedSources.map((type) => (
                              <option key={type} value={type}>
                                {sourceTypeLabel(type, copy)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {current.type === "column" ? (
                          <label className="grid gap-1 text-xs font-medium text-ink">
                            {copy.sourceColumn}
                            <select
                              className="min-w-0 rounded-xl border border-line px-3 py-2 text-sm font-normal"
                              onChange={(event) => updateFieldSource(field.key, { type: "column", header: event.target.value })}
                              value={current.header}
                            >
                              {preview.sourceHeaders.map((header) => (
                                <option key={header || "blank"} value={header}>
                                  {header || "Column"}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : current.type === "constant" && field.key === "pickupOrigin" ? (
                          <label className="grid gap-1 text-xs font-medium text-ink">
                            {copy.constantValue}
                            <select
                              className="min-w-0 rounded-xl border border-line px-3 py-2 text-sm font-normal"
                              onChange={(event) => updateFieldSource(field.key, { type: "constant", value: event.target.value })}
                              value={current.value}
                            >
                              <option value="">{copy.notProvided}</option>
                              {preview.directoryOptions.locations.map((location) => (
                                <option key={location.id} value={location.id}>
                                  {location.label}
                                </option>
                              ))}
                            </select>
                            {preview.directoryOptions.locations.length === 0 ? (
                              <span className="text-[11px] text-amber-700">{copy.noWarehouse}</span>
                            ) : null}
                          </label>
                        ) : current.type === "constant" ? (
                          <label className="grid gap-1 text-xs font-medium text-ink">
                            {copy.constantValue}
                            <input
                              className="min-w-0 rounded-xl border border-line px-3 py-2 text-sm font-normal"
                              onChange={(event) => updateFieldSource(field.key, { type: "constant", value: event.target.value })}
                              value={current.value}
                            />
                          </label>
                        ) : current.type === "derived" ? (
                          <label className="grid gap-1 text-xs font-medium text-ink">
                            {copy.derivedRule}
                            <select
                              className="min-w-0 rounded-xl border border-line px-3 py-2 text-sm font-normal"
                              onChange={(event) =>
                                updateFieldSource(field.key, {
                                  type: "derived",
                                  strategy: event.target.value as "file_date" | "upload_date",
                                })}
                              value={current.strategy}
                            >
                              <option value="file_date">{copy.fileDate}</option>
                              <option value="upload_date">{copy.uploadDate}</option>
                            </select>
                          </label>
                        ) : (
                          <div className="flex items-center rounded-xl border border-dashed border-line px-3 py-2 text-sm text-muted/70">
                            {copy.notProvided}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <label className="mt-5 grid max-w-xs min-w-0 gap-1 text-xs font-medium text-ink">
            {copy.saveMappingPresetLabel}
            <input
              className="rounded-xl border border-line bg-card px-3 py-2 text-sm font-normal"
              onChange={(event) => setSaveProfileName(event.target.value)}
              placeholder={copy.saveMappingPresetPlaceholder}
              type="text"
              value={saveProfileName}
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-3">
            {reviewMode ? (
              <button
                className="rounded-xl border border-rose-100 bg-card px-5 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={submitting}
                onClick={cancelRouteDraft}
                type="button"
              >
                {copy.cancelDraft}
              </button>
            ) : null}
            <button
              className="rounded-xl border border-line bg-card px-5 py-2.5 text-sm font-semibold text-accent transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={submitting}
              onClick={analyzeRouteImport}
              type="button"
            >
              {copy.updatePreview}
            </button>
            <button
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={submitting}
              onClick={confirmRouteImport}
              type="button"
            >
              {copy.confirm}
            </button>
          </div>
        </div>
      ) : null}

      {warnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">{copy.warningsTitle}</p>
          <ul className="mt-2 space-y-1">
            {warnings.map((warning) => (
              <li key={warning} className="break-words text-sm leading-6 text-amber-700">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <div
          className={
            compact
              ? "mt-5 max-h-[min(48dvh,420px)] min-w-0 max-w-full overflow-y-auto rounded-2xl border border-line bg-tint p-4 sm:p-5"
              : "mt-5 min-w-0 max-w-full rounded-2xl border border-line bg-tint p-5"
          }
        >
          <p className="text-sm font-semibold text-ink">{copy.accepted}</p>
          <p className="mt-2 break-all text-xs text-muted/75">
            {copy.batchLabel}: {String(result.batchId ?? "")}
          </p>
          <p className="mt-1 text-xs text-muted/75">
            {copy.statusLabel}: {resultStatus}
          </p>
          {typeof asRecord(result.savedProfile).name === "string" ? (
            <p className="mt-1 text-xs font-medium text-emerald-700">
              {copy.savedMappingPreset}: {String(asRecord(result.savedProfile).name)}
            </p>
          ) : null}
          {confirmedResult && (
            <div className="mt-4 grid gap-2 rounded-xl border border-line bg-card p-4 text-xs text-muted sm:grid-cols-2 lg:grid-cols-6">
              {[
                [copy.routesSaved, createdRoutes],
                [copy.routesUpdated, updatedRoutes],
                [copy.deliveryStops, deliveryStopCount],
                [copy.matchedLocations, matchedLocations],
                [copy.needsLocationReview, unmatchedLocations],
                [copy.skipped, skippedRows + duplicateSkipped],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="font-semibold text-ink">{label}</p>
                  <p className="mt-1">{String(value)}</p>
                </div>
              ))}
            </div>
          )}
          <p className={`mt-4 text-sm font-semibold ${resultNeedsReview ? "text-amber-700" : "text-emerald-700"}`}>
            {actionText}
          </p>
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-semibold text-accent">{copy.details}</summary>
            <pre className="mt-3 max-h-64 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-xl bg-ink p-4 text-xs text-surface-2">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
