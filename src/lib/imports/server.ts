import { env } from "@/lib/env";
import {
  defaultImportMaxFileSizeMb,
  detectImportFormat,
  type SupportedImportType,
} from "@/lib/imports/contracts";
import { assertDocumentContentSafe } from "@/lib/shared-services/scan";

export function getImportMaxFileSizeMb() {
  return env.IMPORT_MAX_FILE_SIZE_MB ?? defaultImportMaxFileSizeMb;
}

export function getImportMaxFileSizeBytes() {
  return getImportMaxFileSizeMb() * 1024 * 1024;
}

export async function scanImportUpload(args: {
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string | null;
}) {
  return assertDocumentContentSafe(args);
}

export function validateImportUpload(args: {
  fileName: string;
  fileSize: number;
  importType: SupportedImportType;
  locale?: string;
}) {
  const sourceFormat = detectImportFormat(args.fileName);
  const errors: string[] = [];
  const warnings: string[] = [];
  const maxFileSizeMb = getImportMaxFileSizeMb();
  const english = args.locale === "en";

  if (!sourceFormat) {
    errors.push(
      english ? "Unsupported file type. Use CSV, XLSX, or XLS." : "Tipo de archivo no compatible. Usa CSV, XLSX o XLS.",
    );
  }

  if (args.fileSize <= 0) {
    errors.push(english ? "The uploaded file is empty." : "El archivo cargado está vacío.");
  }

  if (args.fileSize > getImportMaxFileSizeBytes()) {
    errors.push(
      english
        ? `File exceeds the ${maxFileSizeMb} MB upload limit.`
        : `El archivo supera el límite de carga de ${maxFileSizeMb} MB.`,
    );
  }

  if (sourceFormat && sourceFormat !== "csv") {
    warnings.push(
      english
        ? "Workbook files are accepted, but the cleanest imports come from a single operational sheet instead of a multi-tab master workbook."
        : "Se aceptan workbooks, pero las importaciones más limpias vienen de una sola hoja operativa en lugar de un workbook maestro con muchas pestañas.",
    );
  }

  if (args.importType === "shipment_tracker") {
    warnings.push(
      english
        ? "Use this import for structured tracker exports with one row set for shipments or trips. Avoid summary tabs and finance history in the same file."
        : "Usa esta importación para exports estructurados del tracker con un solo conjunto de filas de embarques o viajes. Evita pestañas de resumen e historial financiero en el mismo archivo.",
    );
  }

  if (args.importType === "purchase_orders") {
    warnings.push(
      english
        ? "Use this import for tabular purchase order data. PDF purchase orders and scanned documents belong in Documents instead."
        : "Usa esta importación para datos tabulares de órdenes de compra. Las órdenes en PDF y los documentos escaneados van en Documentos.",
    );
  }

  if (args.importType === "invoice_status") {
    warnings.push(
      english
        ? "Invoice status imports are stored now, but downstream reconciliation against invoices and payments is still being expanded."
        : "Las importaciones de estado de facturas ya se almacenan, pero la conciliación posterior con facturas y pagos todavía se está ampliando.",
    );
  }

  if (args.importType === "directory") {
    warnings.push(
      english
        ? "Directory uploads support CSV and single-sheet Excel files. Review the field mapping before confirming the import."
        : "Las cargas de directorio admiten archivos CSV y Excel de una sola hoja. Revisa el mapeo de campos antes de confirmar la importación.",
    );
  }

  return {
    sourceFormat,
    errors,
    warnings,
  };
}
