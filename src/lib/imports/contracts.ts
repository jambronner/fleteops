export const supportedImportTypes = ["shipment_tracker", "purchase_orders", "invoice_status", "directory"] as const;
export type SupportedImportType = (typeof supportedImportTypes)[number];

export const supportedImportFormats = ["csv", "xlsx", "xls"] as const;
export type SupportedImportFormat = (typeof supportedImportFormats)[number];

export const defaultImportMaxFileSizeMb = 12;

export function detectImportFormat(fileName: string): SupportedImportFormat | null {
  const normalized = fileName.trim().toLowerCase();

  if (normalized.endsWith(".xlsx")) {
    return "xlsx";
  }

  if (normalized.endsWith(".xls")) {
    return "xls";
  }

  if (normalized.endsWith(".csv")) {
    return "csv";
  }

  return null;
}

export function getImportTypeLabel(type: SupportedImportType, locale: string) {
  if (locale === "en") {
    return {
      shipment_tracker: "Shipment tracker",
      purchase_orders: "Purchase orders",
      invoice_status: "Invoice status",
      directory: "Directory list",
    }[type];
  }

  return {
    shipment_tracker: "Tracker de embarques",
    purchase_orders: "Órdenes de compra",
    invoice_status: "Estado de facturas",
    directory: "Directorio de clientes",
  }[type];
}

export function getImportStatusLabel(status: string, locale: string) {
  if (locale === "en") {
    return {
      pending: "Pending",
      processing: "Processing",
      completed: "Completed",
      failed: "Failed",
      partially_completed: "Partially completed",
    }[status] ?? status;
  }

  return {
    pending: "Pendiente",
    processing: "Procesando",
    completed: "Completado",
    failed: "Falló",
    partially_completed: "Parcial",
  }[status] ?? status;
}
