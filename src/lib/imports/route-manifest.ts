import { normalizeImportedDirectoryText } from "@/lib/imports/text-normalization";

export type RouteManifestDirectoryOrganization = {
  id: string;
  legalName: string;
  displayName: string | null;
};

export type RouteManifestDirectoryLocation = {
  id: string;
  name: string;
  addressLine1: string | null;
};

export type RouteManifestFieldKey =
  | "routeGroup"
  | "dispatchDate"
  | "pickupOrigin"
  | "operatingEntity"
  | "carrier"
  | "routeStatus"
  | "deliveryPointName"
  | "deliveryAddress"
  | "originalDeliveryAddress"
  | "clientAccount"
  | "deliveryWindow"
  | "stopNotes"
  | "deliveryStatus"
  | "orderReference"
  | "invoiceReference"
  | "phoneNumber"
  | "quantityOrBoxes"
  | "productDescription"
  | "invoiceValue"
  | "inventoryRegistration";

export type RouteManifestFieldSource =
  | { type: "column"; header: string }
  | { type: "constant"; value: string }
  | { type: "derived"; strategy: "file_date" | "upload_date" }
  | { type: "not_provided" };

export type RouteManifestMapping = Partial<Record<RouteManifestFieldKey, RouteManifestFieldSource>>;
export type RouteManifestSourceType = RouteManifestFieldSource["type"];

export type RouteManifestAcceptedField = {
  key: RouteManifestFieldKey;
  label: string;
  scope: "route" | "stop";
  requirement: "required" | "recommended" | "optional";
  supportedSources: RouteManifestSourceType[];
};

export type RouteManifestStopPreview = {
  sourceRowNumber: number;
  importRowHash: string;
  deliveryPointName: string | null;
  deliveryAddress: string | null;
  originalDeliveryAddress: string | null;
  clientAccount: string | null;
  deliveryWindow: string | null;
  stopNotes: string | null;
  deliveryStatus: string | null;
  orderReference: string | null;
  invoiceReference: string | null;
  phoneNumber: string | null;
  quantityOrBoxes: string | null;
  productDescription: string | null;
  invoiceValue: string | null;
  inventoryRegistration: string | null;
  locationMatch: RouteManifestDirectoryLocation | null;
  organizationMatch: RouteManifestDirectoryOrganization | null;
  needsLocationReview: boolean;
  sourceColumns: Record<string, string>;
};

export type RouteManifestRoutePreview = {
  routeGroup: string;
  dispatchDate: string | null;
  operatingEntity: string | null;
  carrier: string | null;
  routeStatus: string | null;
  groupingKey: string;
  stops: RouteManifestStopPreview[];
};

export type RouteManifestPreviewResult = {
  routeDraftCount: number;
  deliveryStopCount: number;
  pickupStopCount: number;
  matchedLocations: number;
  unmatchedLocations: number;
  matchedOrganizations: number;
  unmatchedOrganizations: number;
  skipped: number;
  duplicateSkipped: number;
  dispatchDate: string | null;
  pickupOrigin: RouteManifestDirectoryLocation | null;
  routes: RouteManifestRoutePreview[];
  warnings: string[];
};

const fieldAliases: Record<RouteManifestFieldKey, string[]> = {
  routeGroup: ["ruta", "route", "zona", "zone", "lane"],
  dispatchDate: ["fecha", "fecha_de_entrega", "delivery_date", "dispatch_date", "service_date"],
  pickupOrigin: ["pickup", "pickup_origin", "origen", "warehouse", "almacen", "almacén"],
  operatingEntity: ["operating_entity", "entidad_operativa"],
  carrier: ["carrier", "transportista", "fletera"],
  routeStatus: ["status", "estatus", "route_status"],
  deliveryPointName: ["nombre", "name", "cliente", "customer", "destination", "delivery_location", "ubicacion", "ubicación"],
  deliveryAddress: ["direccion_modificada", "dirección_modificada", "direccion", "dirección", "address", "delivery_address", "domicilio"],
  originalDeliveryAddress: ["direccion", "dirección", "original_address", "client_address"],
  clientAccount: ["marca", "brand", "shipper", "cliente_marca", "customer_brand"],
  deliveryWindow: ["prioridad_horario", "horario", "priority_schedule", "delivery_window", "ventana"],
  stopNotes: ["comentarios", "comments", "notes", "observaciones"],
  deliveryStatus: ["entrega_realizada", "delivered", "delivery_status", "status", "estatus"],
  orderReference: [
    "numero_de_pedido_orden_de_comra",
    "numero_de_pedido_orden_de_compra",
    "numero_de_pedido",
    "pedido",
    "orden_de_compra",
    "purchase_order",
    "po",
  ],
  invoiceReference: ["factura_o_remision", "factura_remision", "factura", "remision", "invoice", "invoice_number"],
  phoneNumber: ["telefono_del_cliente", "teléfono_del_cliente", "telefono", "teléfono", "phone", "customer_phone"],
  quantityOrBoxes: ["numero_de_cajas", "número_de_cajas", "cajas", "boxes", "box_count"],
  productDescription: ["descripcion_del_producto", "descripción_del_producto", "producto", "product_description", "description"],
  invoiceValue: ["valor_factura", "invoice_value", "value"],
  inventoryRegistration: ["registro_de_inventarios", "inventory_registration", "inventory"],
};

const acceptedFields: RouteManifestAcceptedField[] = [
  {
    key: "routeGroup",
    label: "Route group",
    scope: "route",
    requirement: "recommended",
    supportedSources: ["column", "constant", "derived", "not_provided"],
  },
  {
    key: "dispatchDate",
    label: "Dispatch date",
    scope: "route",
    requirement: "recommended",
    supportedSources: ["column", "constant", "derived", "not_provided"],
  },
  {
    key: "pickupOrigin",
    label: "Pickup origin",
    scope: "route",
    requirement: "recommended",
    supportedSources: ["column", "constant", "not_provided"],
  },
  {
    key: "operatingEntity",
    label: "Operating entity",
    scope: "route",
    requirement: "optional",
    supportedSources: ["constant", "derived", "not_provided"],
  },
  {
    key: "carrier",
    label: "Carrier",
    scope: "route",
    requirement: "optional",
    supportedSources: ["column", "constant", "not_provided"],
  },
  {
    key: "routeStatus",
    label: "Route status",
    scope: "route",
    requirement: "optional",
    supportedSources: ["constant", "derived", "not_provided"],
  },
  {
    key: "deliveryPointName",
    label: "Delivery point name",
    scope: "stop",
    requirement: "recommended",
    supportedSources: ["column", "constant", "not_provided"],
  },
  {
    key: "deliveryAddress",
    label: "Delivery address",
    scope: "stop",
    requirement: "recommended",
    supportedSources: ["column", "constant", "not_provided"],
  },
  {
    key: "originalDeliveryAddress",
    label: "Original delivery address",
    scope: "stop",
    requirement: "optional",
    supportedSources: ["column", "not_provided"],
  },
  {
    key: "clientAccount",
    label: "Client account",
    scope: "stop",
    requirement: "recommended",
    supportedSources: ["column", "constant", "not_provided"],
  },
  {
    key: "deliveryWindow",
    label: "Delivery window",
    scope: "stop",
    requirement: "optional",
    supportedSources: ["column", "constant", "not_provided"],
  },
  {
    key: "stopNotes",
    label: "Stop notes",
    scope: "stop",
    requirement: "optional",
    supportedSources: ["column", "constant", "not_provided"],
  },
  {
    key: "deliveryStatus",
    label: "Delivery status",
    scope: "stop",
    requirement: "optional",
    supportedSources: ["column", "derived", "not_provided"],
  },
  {
    key: "orderReference",
    label: "Order reference",
    scope: "stop",
    requirement: "optional",
    supportedSources: ["column", "not_provided"],
  },
  {
    key: "invoiceReference",
    label: "Invoice reference",
    scope: "stop",
    requirement: "optional",
    supportedSources: ["column", "not_provided"],
  },
  {
    key: "phoneNumber",
    label: "Phone number",
    scope: "stop",
    requirement: "optional",
    supportedSources: ["column", "not_provided"],
  },
  {
    key: "quantityOrBoxes",
    label: "Quantity or boxes",
    scope: "stop",
    requirement: "optional",
    supportedSources: ["column", "not_provided"],
  },
  {
    key: "productDescription",
    label: "Product description",
    scope: "stop",
    requirement: "optional",
    supportedSources: ["column", "not_provided"],
  },
  {
    key: "invoiceValue",
    label: "Invoice value",
    scope: "stop",
    requirement: "optional",
    supportedSources: ["column", "not_provided"],
  },
  {
    key: "inventoryRegistration",
    label: "Inventory registration",
    scope: "stop",
    requirement: "optional",
    supportedSources: ["column", "not_provided"],
  },
];

function cleanNullable(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeForMatch(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceColumnValue(args: {
  source: RouteManifestFieldSource | undefined;
  headerIndex: Map<string, number>;
  row: string[];
  fileName: string;
  uploadDate?: string;
}) {
  if (!args.source || args.source.type === "not_provided") {
    return null;
  }

  if (args.source.type === "constant") {
    return cleanNullable(args.source.value);
  }

  if (args.source.type === "derived") {
    if (args.source.strategy === "upload_date") {
      return cleanNullable(args.uploadDate);
    }

    return parseFileDate(args.fileName);
  }

  const index = args.headerIndex.get(args.source.header);
  return cleanNullable(index == null ? null : args.row[index] ?? null);
}

function parseFileDate(fileName: string) {
  // Google Drive exports name files like "Demo routes 18/01/2026.xlsx"; browsers replace the "/"
  // with a space or underscore when saving to disk, so both must be accepted alongside the
  // original hyphen/underscore separators.
  const match = fileName.match(/(\d{1,2})[\s_-](\d{1,2})[\s_-](\d{4})/);

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function defaultFieldSource(field: RouteManifestFieldKey, headers: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const matchIndex = normalizedHeaders.findIndex((header) => fieldAliases[field].includes(header));
  return matchIndex >= 0 ? { type: "column" as const, header: headers[matchIndex] } : { type: "not_provided" as const };
}

function sourceColumns(headers: string[], row: string[]) {
  return Object.fromEntries(headers.map((header, index) => [header || `Column ${index + 1}`, row[index] ?? ""]));
}

function buildRowHash(args: { fileName: string; headers: string[]; row: string[] }) {
  const payload = JSON.stringify({ fileName: args.fileName, headers: args.headers, row: args.row.map((cell) => cell.trim()) });
  let hash = 0;

  for (let index = 0; index < payload.length; index += 1) {
    hash = (hash * 31 + payload.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

function findLocationById(id: string | null, locations: RouteManifestDirectoryLocation[]) {
  return id ? locations.find((location) => location.id === id) ?? null : null;
}

function findLocationMatch(args: {
  locationName: string | null;
  address: string | null;
  locations: RouteManifestDirectoryLocation[];
}) {
  const normalizedName = normalizeForMatch(args.locationName);
  const normalizedAddress = normalizeForMatch(args.address);

  if (!normalizedName && !normalizedAddress) {
    return null;
  }

  return (
    args.locations.find((location) => {
      const existingName = normalizeForMatch(location.name);
      const existingAddress = normalizeForMatch(location.addressLine1);
      return (normalizedAddress && normalizedAddress === existingAddress) || (normalizedName && normalizedName === existingName);
    }) ?? null
  );
}

function findOrganizationMatch(clientAccount: string | null, organizations: RouteManifestDirectoryOrganization[]) {
  const normalized = normalizeForMatch(clientAccount);

  if (!normalized) {
    return null;
  }

  return (
    organizations.find((organization) =>
      [organization.displayName, organization.legalName]
        .filter(Boolean)
        .some((label) => normalizeForMatch(label) === normalized),
    ) ?? null
  );
}

export function buildUnmatchedLocationsWarning(locale: string, unmatchedLocations: number): string | null {
  if (unmatchedLocations <= 0) {
    return null;
  }

  return locale === "en"
    ? `${unmatchedLocations} delivery stop${unmatchedLocations === 1 ? "" : "s"} need location review before dispatch.`
    : `${unmatchedLocations} parada${unmatchedLocations === 1 ? "" : "s"} necesitan revisión de ubicación antes de despachar.`;
}

/**
 * Normalizes a route group label into the canonical `route_code` stored on the
 * shipment row (lowercase, accents stripped, punctuation collapsed to single
 * spaces — the same normalization the import groupingKey uses). Returns null
 * for blank or unassigned groups so the route-identity unique index only
 * applies to real route codes.
 */
export function normalizeRouteCode(routeGroup: string | null | undefined): string | null {
  const normalized = normalizeForMatch(routeGroup ?? null);

  if (!normalized || normalized === "unassigned") {
    return null;
  }

  return normalized.slice(0, 64);
}

export type StopDeliveryStatus =
  | "completed"
  | "planned"
  | "missed"
  | "cancelled"
  | "completed_with_exception";

// A rejected delivery was attempted and refused at the door, so it maps to
// completed_with_exception, never to "missed" (a stop that was never reached).
// The raw source value is preserved on the stop metadata either way.
const stopDeliveryStatusByNormalizedValue: Record<string, StopDeliveryStatus> = {
  entregado: "completed",
  entregados: "completed",
  completo: "completed",
  completado: "completed",
  delivered: "completed",
  pendiente: "planned",
  pendientes: "planned",
  pending: "planned",
  rechazado: "completed_with_exception",
  rechazada: "completed_with_exception",
  rechazo: "completed_with_exception",
  rejected: "completed_with_exception",
  "entregado con excepcion": "completed_with_exception",
  "no entregado": "missed",
  "not delivered": "missed",
  cancelado: "cancelled",
  cancelled: "cancelled",
};

export function normalizeStopDeliveryStatus(value: string | null): StopDeliveryStatus | null {
  const normalized = normalizeForMatch(value);

  if (!normalized) {
    return null;
  }

  return stopDeliveryStatusByNormalizedValue[normalized] ?? null;
}

export function stopIdentityKey(stop: {
  orderReference: string | null;
  invoiceReference: string | null;
  deliveryPointName: string | null;
  deliveryAddress: string | null;
}): string | null {
  const orderReference = normalizeForMatch(stop.orderReference);
  if (orderReference) {
    return orderReference;
  }

  const invoiceReference = normalizeForMatch(stop.invoiceReference);
  if (invoiceReference) {
    return invoiceReference;
  }

  const deliveryPointName = normalizeForMatch(stop.deliveryPointName);
  const deliveryAddress = normalizeForMatch(stop.deliveryAddress);

  if (!deliveryPointName && !deliveryAddress) {
    return null;
  }

  return `${deliveryPointName}|${deliveryAddress}`;
}

function hasStopSignal(stop: {
  deliveryPointName: string | null;
  deliveryAddress: string | null;
  orderReference: string | null;
  invoiceReference: string | null;
  productDescription: string | null;
  quantityOrBoxes: string | null;
}) {
  return [
    stop.deliveryPointName,
    stop.deliveryAddress,
    stop.orderReference,
    stop.invoiceReference,
    stop.productDescription,
    stop.quantityOrBoxes,
  ].some(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseFieldSource(value: unknown): RouteManifestFieldSource | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  if (value.type === "column" && typeof value.header === "string") {
    return { type: "column", header: value.header };
  }

  if (value.type === "constant" && typeof value.value === "string") {
    return { type: "constant", value: value.value };
  }

  if (
    value.type === "derived" &&
    (value.strategy === "file_date" || value.strategy === "upload_date")
  ) {
    return { type: "derived", strategy: value.strategy };
  }

  if (value.type === "not_provided") {
    return { type: "not_provided" };
  }

  return null;
}

export function defaultRouteManifestMapping(headers: string[]): RouteManifestMapping {
  return {
    routeGroup: defaultFieldSource("routeGroup", headers),
    dispatchDate: defaultFieldSource("dispatchDate", headers),
    pickupOrigin: { type: "not_provided" },
    operatingEntity: { type: "not_provided" },
    carrier: defaultFieldSource("carrier", headers),
    routeStatus: { type: "not_provided" },
    deliveryPointName: defaultFieldSource("deliveryPointName", headers),
    deliveryAddress: defaultFieldSource("deliveryAddress", headers),
    originalDeliveryAddress: defaultFieldSource("originalDeliveryAddress", headers),
    clientAccount: defaultFieldSource("clientAccount", headers),
    deliveryWindow: defaultFieldSource("deliveryWindow", headers),
    stopNotes: defaultFieldSource("stopNotes", headers),
    deliveryStatus: defaultFieldSource("deliveryStatus", headers),
    orderReference: defaultFieldSource("orderReference", headers),
    invoiceReference: defaultFieldSource("invoiceReference", headers),
    phoneNumber: defaultFieldSource("phoneNumber", headers),
    quantityOrBoxes: defaultFieldSource("quantityOrBoxes", headers),
    productDescription: defaultFieldSource("productDescription", headers),
    invoiceValue: defaultFieldSource("invoiceValue", headers),
    inventoryRegistration: defaultFieldSource("inventoryRegistration", headers),
  };
}

export function parseRouteManifestMappingPayload(value: unknown): RouteManifestMapping | null {
  if (!isRecord(value)) {
    return null;
  }

  const allowedKeys = new Set(acceptedFields.map((field) => field.key));
  const mapping: RouteManifestMapping = {};

  for (const [key, sourceValue] of Object.entries(value)) {
    if (!allowedKeys.has(key as RouteManifestFieldKey)) {
      continue;
    }

    const source = parseFieldSource(sourceValue);
    if (source) {
      mapping[key as RouteManifestFieldKey] = source;
    }
  }

  return mapping;
}

export function getRouteManifestAcceptedFields(locale: string): RouteManifestAcceptedField[] {
  if (locale === "en") {
    return acceptedFields;
  }

  const labels: Partial<Record<RouteManifestFieldKey, string>> = {
    routeGroup: "Ruta / grupo",
    dispatchDate: "Fecha de salida",
    pickupOrigin: "Origen de recolección",
    operatingEntity: "Entidad operativa",
    carrier: "Carrier",
    routeStatus: "Estatus de ruta",
    deliveryPointName: "Punto de entrega",
    deliveryAddress: "Dirección de entrega",
    originalDeliveryAddress: "Dirección original",
    clientAccount: "Cuenta cliente",
    deliveryWindow: "Horario / prioridad",
    stopNotes: "Notas de parada",
    deliveryStatus: "Estatus de entrega",
    orderReference: "Referencia de pedido",
    invoiceReference: "Factura o remisión",
    phoneNumber: "Teléfono",
    quantityOrBoxes: "Cantidad o cajas",
    productDescription: "Descripción del producto",
    invoiceValue: "Valor factura",
    inventoryRegistration: "Registro de inventario",
  };

  return acceptedFields.map((field) => ({
    ...field,
    label: labels[field.key] ?? field.label,
  }));
}

export function buildRouteManifestPreview(args: {
  fileName: string;
  locale: string;
  rows: string[][];
  mapping: RouteManifestMapping;
  organizations: RouteManifestDirectoryOrganization[];
  locations: RouteManifestDirectoryLocation[];
  existingImportRowHashes: Set<string>;
  uploadDate?: string;
}): RouteManifestPreviewResult {
  if (args.rows.length < 2) {
    throw new Error(
      args.locale === "en"
        ? "The route file needs a header row and at least one route row."
        : "El archivo de rutas necesita encabezados y al menos una fila de ruta.",
    );
  }

  const [headers, ...valueRows] = args.rows;
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const dispatchDate = sourceColumnValue({
    source: args.mapping.dispatchDate,
    headerIndex,
    row: valueRows[0] ?? [],
    fileName: args.fileName,
    uploadDate: args.uploadDate,
  });
  const pickupOrigin = findLocationById(
    sourceColumnValue({
      source: args.mapping.pickupOrigin,
      headerIndex,
      row: valueRows[0] ?? [],
      fileName: args.fileName,
      uploadDate: args.uploadDate,
    }),
    args.locations,
  );
  const routeMap = new Map<string, RouteManifestRoutePreview>();
  let skipped = 0;
  let duplicateSkipped = 0;
  let matchedLocations = 0;
  let unmatchedLocations = 0;
  let matchedOrganizations = 0;
  let unmatchedOrganizations = 0;

  for (const [rowIndex, row] of valueRows.entries()) {
    const sourceRowNumber = rowIndex + 2;
    const importRowHash = buildRowHash({ fileName: args.fileName, headers, row });

    if (args.existingImportRowHashes.has(importRowHash)) {
      duplicateSkipped += 1;
      continue;
    }

    const sourceValue = (field: RouteManifestFieldKey) =>
      sourceColumnValue({
        source: args.mapping[field],
        headerIndex,
        row,
        fileName: args.fileName,
        uploadDate: args.uploadDate,
      });
    const routeGroup = normalizeImportedDirectoryText(sourceValue("routeGroup")) ?? "Unassigned route";
    const operatingEntity = normalizeImportedDirectoryText(sourceValue("operatingEntity"));
    const carrier = normalizeImportedDirectoryText(sourceValue("carrier"));
    const routeStatus = normalizeImportedDirectoryText(sourceValue("routeStatus"));
    const deliveryPointName = normalizeImportedDirectoryText(sourceValue("deliveryPointName"));
    const deliveryAddress = normalizeImportedDirectoryText(sourceValue("deliveryAddress"));
    const originalDeliveryAddress = normalizeImportedDirectoryText(sourceValue("originalDeliveryAddress"));
    const clientAccount = normalizeImportedDirectoryText(sourceValue("clientAccount"));
    const deliveryWindow = normalizeImportedDirectoryText(sourceValue("deliveryWindow"));
    const stopNotes = normalizeImportedDirectoryText(sourceValue("stopNotes"));
    const deliveryStatus = normalizeImportedDirectoryText(sourceValue("deliveryStatus"));
    const orderReference = sourceValue("orderReference");
    const invoiceReference = sourceValue("invoiceReference");
    const phoneNumber = sourceValue("phoneNumber");
    const productDescription = normalizeImportedDirectoryText(sourceValue("productDescription"));
    const quantityOrBoxes = sourceValue("quantityOrBoxes");
    const invoiceValue = sourceValue("invoiceValue");
    const inventoryRegistration = normalizeImportedDirectoryText(sourceValue("inventoryRegistration"));
    const locationMatch = findLocationMatch({
      locationName: deliveryPointName,
      address: deliveryAddress,
      locations: args.locations,
    });
    const organizationMatch = findOrganizationMatch(clientAccount, args.organizations);

    if (
      !hasStopSignal({
        deliveryPointName,
        deliveryAddress,
        orderReference,
        invoiceReference,
        productDescription,
        quantityOrBoxes,
      })
    ) {
      skipped += 1;
      continue;
    }

    if (locationMatch) {
      matchedLocations += 1;
    } else {
      unmatchedLocations += 1;
    }

    if (organizationMatch) {
      matchedOrganizations += 1;
    } else if (clientAccount) {
      unmatchedOrganizations += 1;
    }

    const groupingKey = `${normalizeForMatch(routeGroup) || "unassigned"}::${dispatchDate ?? "no-date"}`;
    const route = routeMap.get(groupingKey) ?? {
      routeGroup,
      dispatchDate,
      operatingEntity,
      carrier,
      routeStatus,
      groupingKey,
      stops: [],
    };
    route.operatingEntity ??= operatingEntity;
    route.carrier ??= carrier;
    route.routeStatus ??= routeStatus;

    route.stops.push({
      sourceRowNumber,
      importRowHash,
      deliveryPointName,
      deliveryAddress,
      originalDeliveryAddress,
      clientAccount,
      deliveryWindow,
      stopNotes,
      deliveryStatus,
      orderReference,
      invoiceReference,
      phoneNumber,
      quantityOrBoxes,
      productDescription,
      invoiceValue,
      inventoryRegistration,
      locationMatch,
      organizationMatch,
      needsLocationReview: !locationMatch,
      sourceColumns: sourceColumns(headers, row),
    });
    routeMap.set(groupingKey, route);
  }

  const routes = Array.from(routeMap.values());
  const warnings: string[] = [];
  const unmatchedLocationsWarning = buildUnmatchedLocationsWarning(args.locale, unmatchedLocations);

  if (unmatchedLocationsWarning) {
    warnings.push(unmatchedLocationsWarning);
  }

  return {
    routeDraftCount: routes.length,
    deliveryStopCount: routes.reduce((total, route) => total + route.stops.length, 0),
    pickupStopCount: pickupOrigin ? routes.length : 0,
    matchedLocations,
    unmatchedLocations,
    matchedOrganizations,
    unmatchedOrganizations,
    skipped,
    duplicateSkipped,
    dispatchDate,
    pickupOrigin,
    routes,
    warnings,
  };
}
