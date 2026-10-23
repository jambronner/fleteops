"use client";

import { useRouter } from "next/navigation";
import { FileSpreadsheet, Map, RefreshCw, Upload } from "lucide-react";
import { startTransition, useMemo, useState } from "react";

import { FilePickerInput } from "@/components/ui/file-picker-input";

type DirectoryItemType = "counterparties" | "locations";
type DirectoryOrganizationType = "broker" | "shipper" | "carrier" | "retailer" | "vendor" | "warehouse_operator" | "other";

const counterpartyTypeOptions: DirectoryOrganizationType[] = [
  "vendor",
  "shipper",
  "carrier",
  "retailer",
  "broker",
  "warehouse_operator",
  "other",
];

type DirectoryPreview = {
  itemType: DirectoryItemType;
  fileName: string;
  sourceFormat: string;
  warnings: string[];
  sourceHeaders: string[];
  acceptedFields: Array<{
    key: string;
    label: string;
    optional: boolean;
  }>;
  detectedMappings: Record<string, string | null>;
  previewRows: Record<string, string>[];
};

type DirectoryUploadPanelProps = {
  locale: string;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      title: "Upload directory file",
      body:
        "Upload a CSV or single-sheet Excel file, review the detected fields, then confirm exactly what should be saved into the directory.",
      typeLabel: "Directory item type",
      types: {
        counterparties: "Counterparties",
        locations: "Locations",
      },
      fileLabel: "File",
      defaultCounterpartyTypeLabel: "Default counterparty type",
      defaultCounterpartyTypeHelp:
        "Use this when the file only has company names and no type column. You can adjust exceptions later.",
      analyze: "Analyze file",
      analyzing: "Analyzing...",
      mappingTitle: "Review field mapping",
      mappingBody:
        "We matched the columns we recognized. Adjust anything that looks off before importing.",
      sourceColumn: "Source column",
      leaveBlank: "Leave blank",
      sampleTitle: "Sample preview",
      sampleBody: "This preview shows how the mapped fields will be read before anything is saved.",
      import: "Import into directory",
      importing: "Importing...",
      success: "Directory import completed",
      result: {
        created: "Created",
        updated: "Updated",
        skipped: "Skipped",
      },
      reset: "Choose another file",
      warnings: "Warnings",
    };
  }

  return {
    title: "Subir archivo de directorio",
    body:
      "Sube un CSV o un Excel de una sola hoja, revisa los campos detectados y después confirma exactamente qué se debe guardar en el directorio.",
    typeLabel: "Tipo de elemento",
    types: {
      counterparties: "Contrapartes",
      locations: "Ubicaciones",
    },
      fileLabel: "Archivo",
      defaultCounterpartyTypeLabel: "Tipo predeterminado de contraparte",
      defaultCounterpartyTypeHelp:
        "Úsalo cuando el archivo solo trae nombres y no incluye una columna de tipo. Después podrás corregir excepciones.",
      analyze: "Analizar archivo",
      analyzing: "Analizando...",
    mappingTitle: "Revisar mapeo",
    mappingBody: "Empatamos las columnas reconocidas. Ajusta cualquier cosa que no se vea bien antes de importar.",
    sourceColumn: "Columna origen",
    leaveBlank: "Dejar en blanco",
    sampleTitle: "Vista previa",
    sampleBody: "Esta vista muestra cómo se leerán los campos antes de guardar cualquier dato.",
    import: "Importar al directorio",
    importing: "Importando...",
    success: "Importación de directorio completada",
    result: {
      created: "Creados",
      updated: "Actualizados",
      skipped: "Omitidos",
    },
    reset: "Elegir otro archivo",
    warnings: "Advertencias",
  };
}

function formatOrganizationTypeLabel(value: DirectoryOrganizationType, locale: string) {
  if (locale === "en") {
    return {
      broker: "Broker / 3PL",
      shipper: "Shipper / Brand",
      carrier: "Carrier",
      retailer: "Retailer",
      vendor: "Supplier / Vendor",
      warehouse_operator: "Warehouse operator",
      other: "Other",
    }[value];
  }

  return {
    broker: "Broker / 3PL",
    shipper: "Solicitante / Marca",
    carrier: "Carrier",
    retailer: "Retailer",
    vendor: "Proveedor",
    warehouse_operator: "Operador de almacén",
    other: "Otro",
  }[value];
}

export function DirectoryUploadPanel({ locale }: DirectoryUploadPanelProps) {
  const copy = copyForLocale(locale);
  const router = useRouter();
  const [directoryItemType, setDirectoryItemType] = useState<DirectoryItemType>("locations");
  const [defaultCounterpartyType, setDefaultCounterpartyType] = useState<DirectoryOrganizationType>("vendor");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DirectoryPreview | null>(null);
  const [fieldMappings, setFieldMappings] = useState<Record<string, string | null>>({});
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);

  const previewRows = useMemo(() => {
    if (!preview) {
      return [];
    }

    return preview.previewRows.map((row) =>
      Object.fromEntries(
        preview.acceptedFields.map((field) => {
          const sourceHeader = fieldMappings[field.key];
          return [field.key, sourceHeader ? row[field.key] ?? "" : ""];
        }),
      ),
    );
  }, [fieldMappings, preview]);

  async function handleAnalyze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    if (!file) {
      setError(locale === "en" ? "Choose a file first." : "Primero selecciona un archivo.");
      return;
    }

    setAnalyzing(true);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("directoryItemType", directoryItemType);

      const response = await fetch("/api/imports/directory/preview", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; preview?: DirectoryPreview };

      if (!response.ok || !payload.preview) {
        setError(payload.error ?? "Preview failed.");
        return;
      }

      setPreview(payload.preview);
      setFieldMappings(payload.preview.detectedMappings);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Preview failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleImport() {
    if (!file || !preview) {
      return;
    }

    setImporting(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("importType", "directory");
      formData.set("directoryItemType", directoryItemType);
      formData.set("fieldMappings", JSON.stringify(fieldMappings));
      if (directoryItemType === "counterparties") {
        formData.set("defaultCounterpartyType", defaultCounterpartyType);
      }

      const response = await fetch("/api/imports/shipments", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        setError(String(payload.error ?? "Import failed."));
        return;
      }

      setResult(payload);
      startTransition(() => {
        router.refresh();
      });
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  function resetFlow() {
    setPreview(null);
    setFieldMappings({});
    setResult(null);
    setError("");
    setFile(null);
  }

  const warnings = Array.isArray(preview?.warnings)
    ? preview.warnings
    : Array.isArray(result?.warnings)
      ? result.warnings.map(String)
      : [];

  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-surface text-accent">
          <Upload className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ink">
            {copy.title}
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-muted/78">{copy.body}</p>
        </div>
      </div>

      {!preview ? (
        <form className="mt-5 grid gap-4" onSubmit={handleAnalyze}>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">{copy.typeLabel}</span>
            <select
              className="rounded-xl border border-line px-3 py-2.5"
              onChange={(event) => setDirectoryItemType(event.target.value as DirectoryItemType)}
              value={directoryItemType}
            >
              <option value="counterparties">{copy.types.counterparties}</option>
              <option value="locations">{copy.types.locations}</option>
            </select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">{copy.fileLabel}</span>
            <FilePickerInput accept=".csv,.xlsx,.xls" file={file} locale={locale} onFileChange={setFile} />
          </label>

          {directoryItemType === "counterparties" ? (
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.defaultCounterpartyTypeLabel}</span>
              <select
                className="rounded-xl border border-line px-3 py-2.5"
                onChange={(event) => setDefaultCounterpartyType(event.target.value as DirectoryOrganizationType)}
                value={defaultCounterpartyType}
              >
                {counterpartyTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {formatOrganizationTypeLabel(type, locale)}
                  </option>
                ))}
              </select>
              <span className="text-xs leading-5 text-muted/70">{copy.defaultCounterpartyTypeHelp}</span>
            </label>
          ) : null}

          <button
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={analyzing}
            type="submit"
          >
            {analyzing ? copy.analyzing : copy.analyze}
          </button>
        </form>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="rounded-2xl bg-tint p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{copy.mappingTitle}</p>
                <p className="mt-1 text-sm text-muted/78">{copy.mappingBody}</p>
              </div>
              <div className="rounded-full bg-card px-3 py-1 text-xs font-semibold text-muted">
                {preview.fileName}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {preview.acceptedFields.map((field) => (
                <div key={field.key} className="rounded-xl border border-line bg-card p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{field.label}</p>
                      <p className="text-xs text-muted/60">
                        {field.optional ? copy.leaveBlank : locale === "en" ? "Required" : "Obligatorio"}
                      </p>
                    </div>
                    <Map className="h-4 w-4 text-accent" />
                  </div>
                  <label className="mt-3 grid gap-1.5 text-sm">
                    <span className="font-medium text-ink">{copy.sourceColumn}</span>
                    <select
                      className="rounded-xl border border-line px-3 py-2.5"
                      onChange={(event) =>
                        setFieldMappings((current) => ({
                          ...current,
                          [field.key]: event.target.value || null,
                        }))}
                      value={fieldMappings[field.key] ?? ""}
                    >
                      <option value="">{copy.leaveBlank}</option>
                      {preview.sourceHeaders.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>

            {directoryItemType === "counterparties" ? (
              <div className="mt-4 rounded-xl border border-line bg-card p-3">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-ink">{copy.defaultCounterpartyTypeLabel}</span>
                  <select
                    className="rounded-xl border border-line px-3 py-2.5"
                    onChange={(event) => setDefaultCounterpartyType(event.target.value as DirectoryOrganizationType)}
                    value={defaultCounterpartyType}
                  >
                    {counterpartyTypeOptions.map((type) => (
                      <option key={type} value={type}>
                        {formatOrganizationTypeLabel(type, locale)}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs leading-5 text-muted/70">{copy.defaultCounterpartyTypeHelp}</span>
                </label>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-line bg-card p-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-ink">{copy.sampleTitle}</p>
            </div>
            <p className="mt-1 text-sm text-muted/78">{copy.sampleBody}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-blue-100 text-left text-sm">
                <thead>
                  <tr>
                    {preview.acceptedFields.map((field) => (
                      <th key={field.key} className="px-3 py-2 font-semibold text-ink">
                        {field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50">
                  {previewRows.map((row, index) => (
                    <tr key={`${preview.fileName}-${index}`}>
                      {preview.acceptedFields.map((field) => (
                        <td key={field.key} className="px-3 py-2 text-muted/80">
                          {row[field.key] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap gap-3 border-t border-line bg-card/96 px-1 pb-1 pt-4 backdrop-blur">
            <button
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={importing}
              onClick={handleImport}
              type="button"
            >
              {importing ? copy.importing : copy.import}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-muted transition hover:bg-tint"
              onClick={resetFlow}
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
              {copy.reset}
            </button>
          </div>
        </div>
      )}

      {warnings.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">{copy.warnings}</p>
          <ul className="mt-2 space-y-1">
            {warnings.map((warning) => (
              <li key={warning} className="text-sm leading-6 text-amber-700">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}

      {result?.result && typeof result.result === "object" ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">{copy.success}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(["created", "updated", "skipped"] as const).map((key) => (
              <div key={key} className="rounded-xl bg-card px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{copy.result[key]}</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {String((result.result as Record<string, unknown>)[key] ?? 0)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
