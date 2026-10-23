const enLabels: Record<string, string> = {
  // Document types
  customer_po: "Customer PO",
  shipper_po: "Shipper PO",
  retailer_receipt: "Retailer receipt",
  pod: "Proof of delivery (POD)",
  carrier_invoice: "Carrier invoice",
  broker_invoice: "Broker invoice",
  vendor_invoice: "Vendor invoice",
  credit_note: "Credit note",
  photo: "Photo",
  pdf: "PDF",
  spreadsheet_import: "Spreadsheet",

  // Extraction providers
  docling: "Docling",
  openrouter_vision: "OpenRouter Vision",

  // Organization types
  broker: "Broker",
  shipper: "Shipper",
  carrier: "Carrier",
  retailer: "Retailer",
  vendor: "Vendor",
  warehouse_operator: "Warehouse operator",

  // Location types
  billing: "Billing",
  pickup: "Pickup",
  delivery: "Delivery",
  warehouse: "Warehouse",
  store: "Store",
  cedis: "CEDIS",
  office: "Office",

  // Route statuses
  draft: "Draft",
  planned: "Planned",
  in_transit: "In transit",
  delivered: "Delivered",
  delivered_with_exception: "Delivered with exception",
  cancelled: "Cancelled",

  // Purchase order statuses
  open: "Open",
  confirmed: "Confirmed",
  closed: "Closed",

  // Contact roles
  driver: "Driver",
  carrier_ops: "Carrier ops",
  shipper_ops: "Shipper ops",
  customer_contact: "Customer contact",
  retailer_contact: "Retailer contact",

  // Phone channels
  whatsapp: "WhatsApp",
  phone: "Phone",
  email: "Email",

  // Requirement statuses
  matched: "Matched",
  missing: "Missing",
  rejected: "Rejected",
  not_required_yet: "Not required yet",

  other: "Other",
};

const esLabels: Record<string, string> = {
  // Document types
  customer_po: "Orden de compra del cliente",
  shipper_po: "Orden de compra del shipper",
  retailer_receipt: "Recibo de tienda",
  pod: "Prueba de entrega (POD)",
  carrier_invoice: "Factura del carrier",
  broker_invoice: "Factura del broker",
  vendor_invoice: "Factura de proveedor",
  credit_note: "Nota de crédito",
  photo: "Foto",
  pdf: "PDF",
  spreadsheet_import: "Hoja de cálculo",

  // Extraction providers
  docling: "Docling",
  openrouter_vision: "OpenRouter Vision",

  // Organization types
  broker: "Broker",
  shipper: "Shipper",
  carrier: "Carrier",
  retailer: "Retailer",
  vendor: "Proveedor",
  warehouse_operator: "Operador de almacén",

  // Location types
  billing: "Facturación",
  pickup: "Recolección",
  delivery: "Entrega",
  warehouse: "Almacén",
  store: "Tienda",
  cedis: "CEDIS",
  office: "Oficina",

  // Route statuses
  draft: "Borrador",
  planned: "Planeada",
  in_transit: "En tránsito",
  delivered: "Entregada",
  delivered_with_exception: "Entregada con excepción",
  cancelled: "Cancelada",

  // Purchase order statuses
  open: "Abierta",
  confirmed: "Confirmada",
  closed: "Cerrada",

  // Contact roles
  driver: "Chofer",
  carrier_ops: "Operaciones del carrier",
  shipper_ops: "Operaciones del shipper",
  customer_contact: "Contacto del cliente",
  retailer_contact: "Contacto de tienda",

  // Phone channels
  whatsapp: "WhatsApp",
  phone: "Teléfono",
  email: "Correo",

  // Requirement statuses
  matched: "Cuadrado",
  missing: "Faltante",
  rejected: "Rechazado",
  not_required_yet: "Aún no requerido",

  other: "Otro",
};

function fallbackTokenLabel(value: string) {
  return value
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export function enumLabel(locale: string, value: string): string {
  const table = locale === "en" ? enLabels : esLabels;

  return table[value] ?? fallbackTokenLabel(value);
}
