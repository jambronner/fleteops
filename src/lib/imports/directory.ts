import type { AppSession } from "@/lib/auth/session";
import { getImportTypeLabel } from "@/lib/imports/contracts";
import { parseSpreadsheet } from "@/lib/imports/spreadsheet";
import { normalizeImportedDirectoryText } from "@/lib/imports/text-normalization";
import { createLocationRecord, getPartnerLocations } from "@/lib/partners/locations";
import { createOrganizationRecord, getPartnerDirectorySnapshot } from "@/lib/partners/repository";

export const directoryItemTypes = ["counterparties", "locations"] as const;
export type DirectoryItemType = (typeof directoryItemTypes)[number];
export const directoryOrganizationTypes = [
  "broker",
  "shipper",
  "carrier",
  "retailer",
  "vendor",
  "warehouse_operator",
  "other",
] as const;
export type DirectoryOrganizationType = (typeof directoryOrganizationTypes)[number];

export type DirectoryAcceptedField = {
  key: string;
  label: string;
  optional: boolean;
};

export type DirectoryPreviewRow = Record<string, string>;

export type DirectoryPreviewResult = {
  itemType: DirectoryItemType;
  fileName: string;
  sourceFormat: string;
  warnings: string[];
  sourceHeaders: string[];
  acceptedFields: DirectoryAcceptedField[];
  detectedMappings: Record<string, string | null>;
  previewRows: DirectoryPreviewRow[];
};

export type DirectoryImportResult = {
  created: number;
  updated: number;
  skipped: number;
  rowCount: number;
  warnings: string[];
  itemType: DirectoryItemType;
};

type DirectoryFieldDefinition = DirectoryAcceptedField & {
  aliases: string[];
};

type DirectoryRecordRow = Record<string, string | null>;

const organizationTypeSynonyms = new Map<string, DirectoryOrganizationType>([
  ["broker", "broker"],
  ["3pl", "broker"],
  ["logistics", "broker"],
  ["shipper", "shipper"],
  ["client", "shipper"],
  ["customer", "shipper"],
  ["brand", "shipper"],
  ["carrier", "carrier"],
  ["transport", "carrier"],
  ["transporter", "carrier"],
  ["retailer", "retailer"],
  ["store", "retailer"],
  ["vendor", "vendor"],
  ["supplier", "vendor"],
  ["warehouse", "warehouse_operator"],
  ["warehouse_operator", "warehouse_operator"],
  ["operator", "warehouse_operator"],
  ["other", "other"],
]);

const directoryFieldDefinitions: Record<DirectoryItemType, DirectoryFieldDefinition[]> = {
  counterparties: [
    {
      key: "name",
      label: "Counterparty name",
      optional: false,
      aliases: ["name", "nombre", "counterparty", "organization_name", "client_name", "customer_name", "legal_name", "razon_social", "cliente"],
    },
    {
      key: "type",
      label: "Counterparty type",
      optional: true,
      aliases: ["type", "organization_type", "counterparty_type", "tipo", "tipo_de_cliente"],
    },
    {
      key: "notes",
      label: "Notes",
      optional: true,
      aliases: ["notes", "note", "observations", "observaciones", "comentarios"],
    },
  ],
  locations: [
    {
      key: "name",
      label: "Location name",
      optional: false,
      aliases: ["name", "nombre", "location_name", "site_name", "delivery_location", "ubicacion", "ubicación", "sucursal", "cedis"],
    },
    {
      key: "address",
      label: "Address",
      optional: true,
      aliases: ["address", "direccion", "dirección", "address_line_1", "address1", "domicilio"],
    },
    {
      key: "customer",
      label: "Customer",
      optional: true,
      aliases: ["customer", "client", "brand", "counterparty", "organization", "cliente", "marca"],
    },
    {
      key: "city",
      label: "City",
      optional: true,
      aliases: ["city", "ciudad", "municipio"],
    },
    {
      key: "state",
      label: "State",
      optional: true,
      aliases: ["state", "estado", "province", "provincia"],
    },
    {
      key: "notes",
      label: "Notes",
      optional: true,
      aliases: ["notes", "note", "observations", "observaciones", "comentarios"],
    },
  ],
};

function cleanNullable(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeHeader(header: string) {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeKey(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function getAcceptedFields(itemType: DirectoryItemType, locale: string): DirectoryAcceptedField[] {
  const fields = directoryFieldDefinitions[itemType];

  if (locale !== "en") {
    return fields.map((field) => ({
      key: field.key,
      optional: field.optional,
      label:
        itemType === "counterparties"
          ? {
              name: "Nombre de contraparte",
              type: "Tipo de contraparte",
              notes: "Notas",
            }[field.key] ?? field.label
          : {
              name: "Nombre de ubicación",
              address: "Dirección",
              customer: "Cliente",
              city: "Ciudad",
              state: "Estado",
              notes: "Notas",
            }[field.key] ?? field.label,
    }));
  }

  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    optional: field.optional,
  }));
}

function detectMappings(itemType: DirectoryItemType, headers: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const fields = directoryFieldDefinitions[itemType];

  return Object.fromEntries(
    fields.map((field) => {
      const matchedHeader = headers.find((header, index) => {
        const normalized = normalizedHeaders[index];
        return field.aliases.includes(normalized);
      });

      return [field.key, matchedHeader ?? null];
    }),
  );
}

function mapRows(args: {
  headers: string[];
  valueRows: string[][];
  mappings: Record<string, string | null>;
}) {
  const headerIndex = new Map(args.headers.map((header, index) => [header, index]));

  return args.valueRows.map((row) =>
    Object.fromEntries(
      Object.entries(args.mappings).map(([fieldKey, header]) => {
        if (!header) {
          return [fieldKey, null];
        }

        const index = headerIndex.get(header);
        return [fieldKey, cleanNullable(index == null ? null : row[index] ?? null)];
      }),
    ) as DirectoryRecordRow,
  );
}

function resolveOrganizationType(value: string | null) {
  const normalized = normalizeKey(value).replace(/\s+/g, "_");
  return organizationTypeSynonyms.get(normalized) ?? null;
}

function formatDuplicateWarning(args: { locale: string; itemType: DirectoryItemType; rowNumber: number; name: string }) {
  if (args.locale === "en") {
    return args.itemType === "counterparties"
      ? `Row ${args.rowNumber} matched an existing counterparty (${args.name}) and was skipped.`
      : `Row ${args.rowNumber} matched an existing location (${args.name}) and was skipped.`;
  }

  return args.itemType === "counterparties"
    ? `La fila ${args.rowNumber} coincide con una contraparte existente (${args.name}) y se omitió.`
    : `La fila ${args.rowNumber} coincide con una ubicación existente (${args.name}) y se omitió.`;
}

export function buildDirectoryPreview(args: {
  body: Uint8Array;
  fileName: string;
  itemType: DirectoryItemType;
  locale: string;
}) {
  const parsed = parseSpreadsheet({
    body: args.body,
    fileName: args.fileName,
    locale: args.locale,
  });

  if (parsed.rows.length < 2) {
    throw new Error(
      args.locale === "en"
        ? "The file needs a header row and at least one data row."
        : "El archivo necesita una fila de encabezados y al menos una fila de datos.",
    );
  }

  const [headerRow, ...valueRows] = parsed.rows;
  const detectedMappings = detectMappings(args.itemType, headerRow);
  const previewRows = mapRows({
    headers: headerRow,
    valueRows: valueRows.slice(0, 5),
    mappings: detectedMappings,
  }).map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? ""])) as DirectoryPreviewRow,
  );

  return {
    itemType: args.itemType,
    fileName: args.fileName,
    sourceFormat: parsed.sourceFormat,
    warnings: parsed.warnings,
    sourceHeaders: headerRow,
    acceptedFields: getAcceptedFields(args.itemType, args.locale),
    detectedMappings,
    previewRows,
  } satisfies DirectoryPreviewResult;
}

export async function processDirectoryImport(args: {
  body: Uint8Array;
  fileName: string;
  itemType: DirectoryItemType;
  locale: string;
  fieldMappings: Record<string, string | null>;
  defaultCounterpartyType?: DirectoryOrganizationType | null;
  session: AppSession;
}) {
  const parsed = parseSpreadsheet({
    body: args.body,
    fileName: args.fileName,
    locale: args.locale,
  });

  if (parsed.rows.length < 2) {
    throw new Error(
      args.locale === "en"
        ? "The file needs a header row and at least one data row."
        : "El archivo necesita una fila de encabezados y al menos una fila de datos.",
    );
  }

  const [headerRow, ...valueRows] = parsed.rows;
  const mappedRows = mapRows({
    headers: headerRow,
    valueRows,
    mappings: args.fieldMappings,
  });

  const warnings = [...parsed.warnings];
  let created = 0;
  let skipped = 0;

  if (args.itemType === "counterparties") {
    const directory = await getPartnerDirectorySnapshot(args.session.tenant.id);
    const existingOrganizations = new Set(
      directory.organizations.flatMap((organization) =>
        [organization.legalName, organization.displayName].map((value) => normalizeKey(value)),
      ),
    );

    for (const [rowIndex, row] of mappedRows.entries()) {
      const rowNumber = rowIndex + 2;
      const name = normalizeImportedDirectoryText(cleanNullable(row.name));

      if (!name) {
        skipped += 1;
        warnings.push(
          args.locale === "en"
            ? `Row ${rowNumber} was skipped because the counterparty name is blank.`
            : `La fila ${rowNumber} se omitió porque el nombre de la contraparte está vacío.`,
        );
        continue;
      }

      if (existingOrganizations.has(normalizeKey(name))) {
        skipped += 1;
        warnings.push(formatDuplicateWarning({ locale: args.locale, itemType: args.itemType, rowNumber, name }));
        continue;
      }

      await createOrganizationRecord(args.session, {
        legalName: name,
        organizationType: resolveOrganizationType(cleanNullable(row.type)) ?? args.defaultCounterpartyType ?? "vendor",
        metadata: row.notes ? { importNotes: row.notes } : null,
      });

      existingOrganizations.add(normalizeKey(name));
      created += 1;
    }
  }

  if (args.itemType === "locations") {
    const locations = await getPartnerLocations(args.session.tenant.id);
    const existingLocations = new Set(
      locations.map((location) =>
        `${normalizeKey(location.name)}::${normalizeKey(location.addressLine1)}`,
      ),
    );

    for (const [rowIndex, row] of mappedRows.entries()) {
      const rowNumber = rowIndex + 2;
      const name = normalizeImportedDirectoryText(cleanNullable(row.name));
      const address = normalizeImportedDirectoryText(cleanNullable(row.address));

      if (!name) {
        skipped += 1;
        warnings.push(
          args.locale === "en"
            ? `Row ${rowNumber} was skipped because the location name is blank.`
            : `La fila ${rowNumber} se omitió porque el nombre de la ubicación está vacío.`,
        );
        continue;
      }

      const locationKey = `${normalizeKey(name)}::${normalizeKey(address)}`;
      if (existingLocations.has(locationKey)) {
        skipped += 1;
        warnings.push(formatDuplicateWarning({ locale: args.locale, itemType: args.itemType, rowNumber, name }));
        continue;
      }

      const customerName = normalizeImportedDirectoryText(cleanNullable(row.customer));
      const notes = cleanNullable(row.notes);
      await createLocationRecord(args.session, {
        name,
        locationType: "delivery",
        addressLine1: address,
        city: normalizeImportedDirectoryText(cleanNullable(row.city)),
        state: normalizeImportedDirectoryText(cleanNullable(row.state)),
        metadata:
          customerName || notes
            ? {
                importCustomerName: customerName,
                importNotes: notes,
              }
            : null,
      });

      existingLocations.add(locationKey);
      created += 1;
    }
  }

  return {
    created,
    updated: 0,
    skipped,
    rowCount: valueRows.length,
    warnings,
    itemType: args.itemType,
  } satisfies DirectoryImportResult;
}

export function getDirectorySubtypeLabel(itemType: DirectoryItemType, locale: string) {
  if (locale === "en") {
    return {
      counterparties: "Counterparties",
      locations: "Locations",
    }[itemType];
  }

  return {
    counterparties: "Contrapartes",
    locations: "Ubicaciones",
  }[itemType];
}

export function getDirectoryImportLabel(locale: string) {
  return getImportTypeLabel("directory", locale);
}
