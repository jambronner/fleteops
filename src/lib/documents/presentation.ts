type SummaryFieldKey =
  | "purchaseOrderNumber"
  | "invoiceNumber"
  | "shipmentReference"
  | "sellerName"
  | "buyerName"
  | "supplierName"
  | "companyName"
  | "invoiceAmount"
  | "totalAmount"
  | "purchaseDate"
  | "invoiceDate"
  | "deliveryDate"
  | "shippingDestination"
  | "billingAddress"
  | "receiverName";

export type DocumentSummaryField = {
  key: SummaryFieldKey | null;
  rawLabel: string;
  value: string;
};

export type SummaryFactInput = {
  factType?: string | null;
  valueText?: string | null;
  valueNumber?: string | number | null;
  valueDate?: string | Date | null;
};

export type DocumentPresentationSummary = {
  fields: DocumentSummaryField[];
  lineItemCount: number;
  normalizedText: string | null;
};

const labelAliases: Record<string, SummaryFieldKey> = {
  "purchase order": "purchaseOrderNumber",
  "purchase order number": "purchaseOrderNumber",
  "purchase order no": "purchaseOrderNumber",
  "order number": "purchaseOrderNumber",
  "po number": "purchaseOrderNumber",
  "orden de compra": "purchaseOrderNumber",
  "invoice no": "invoiceNumber",
  "invoice number": "invoiceNumber",
  "factura": "invoiceNumber",
  "shipment reference": "shipmentReference",
  "shipment number": "shipmentReference",
  "route reference": "shipmentReference",
  seller: "sellerName",
  "seller name": "sellerName",
  buyer: "buyerName",
  "supplier name": "supplierName",
  "proveedor": "supplierName",
  "buyer name": "buyerName",
  "company name": "companyName",
  "empresa": "companyName",
  amount: "invoiceAmount",
  "invoice amount": "invoiceAmount",
  "amount without vat": "invoiceAmount",
  "importe sin iva": "invoiceAmount",
  "amount total": "totalAmount",
  total: "totalAmount",
  "total amount": "totalAmount",
  "purchase date": "purchaseDate",
  "purchase order date": "purchaseDate",
  "invoice date": "invoiceDate",
  "fecha de compra": "purchaseDate",
  "delivery date": "deliveryDate",
  "store name": "shippingDestination",
  "delivery point": "shippingDestination",
  "delivery location": "shippingDestination",
  "shipping destination": "shippingDestination",
  destination: "shippingDestination",
  envio: "shippingDestination",
  "ship to": "shippingDestination",
  billing: "billingAddress",
  "billing address": "billingAddress",
  facturacion: "billingAddress",
  "receiver name": "receiverName",
};

const summaryPriority: SummaryFieldKey[] = [
  "purchaseOrderNumber",
  "invoiceNumber",
  "shipmentReference",
  "sellerName",
  "supplierName",
  "buyerName",
  "companyName",
  "invoiceAmount",
  "totalAmount",
  "purchaseDate",
  "invoiceDate",
  "deliveryDate",
  "shippingDestination",
  "billingAddress",
  "receiverName",
];

function normalizeLabel(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function humanizeFactType(factType: string) {
  return factType
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function canonicalizeSummaryKey(label: string): SummaryFieldKey | null {
  return labelAliases[normalizeLabel(label)] ?? null;
}

function dedupeFieldId(field: DocumentSummaryField) {
  return `${normalizeLabel(field.rawLabel)}::${field.value.trim().toLowerCase()}`;
}

export function extractNormalizedTextFromArtifacts(
  artifacts: Array<{ artifactType?: string | null; textContent?: string | null }> | null | undefined,
) {
  if (!Array.isArray(artifacts)) {
    return null;
  }

  const normalizedTextArtifact = artifacts.find((artifact) => artifact.artifactType === "normalized_text");
  return typeof normalizedTextArtifact?.textContent === "string" ? normalizedTextArtifact.textContent : null;
}

function buildSummaryFromNormalizedText(normalizedText: string): DocumentPresentationSummary {
  const lines = normalizedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const lineItemNumbers = new Set<string>();
  const prioritizedFields = new Map<SummaryFieldKey, DocumentSummaryField>();
  const supplementalFields: DocumentSummaryField[] = [];

  for (const line of lines) {
    const lineItemMatch = line.match(/^line item\s+(\d+)\s+/i);

    if (lineItemMatch) {
      lineItemNumbers.add(lineItemMatch[1]);
    }

    const separatorIndex = line.indexOf(":");

    if (separatorIndex <= 0) {
      continue;
    }

    const rawLabel = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!value) {
      continue;
    }

    if (lineItemMatch) {
      continue;
    }

    const key = canonicalizeSummaryKey(rawLabel);
    const field = {
      key,
      rawLabel,
      value,
    } satisfies DocumentSummaryField;

    if (key) {
      if (!prioritizedFields.has(key)) {
        prioritizedFields.set(key, field);
      }
      continue;
    }

    supplementalFields.push(field);
  }

  const fields = summaryPriority
    .map((key) => prioritizedFields.get(key))
    .filter((field): field is DocumentSummaryField => Boolean(field));

  const usedValues = new Set(fields.map((field) => `${field.rawLabel}::${field.value}`));

  for (const field of supplementalFields) {
    if (fields.length >= 6) {
      break;
    }

    const dedupeKey = `${field.rawLabel}::${field.value}`;

    if (usedValues.has(dedupeKey)) {
      continue;
    }

    fields.push(field);
    usedValues.add(dedupeKey);
  }

  return {
    fields,
    lineItemCount: lineItemNumbers.size,
    normalizedText,
  };
}

function buildSummaryFromFacts(facts: SummaryFactInput[]): DocumentPresentationSummary {
  const seenValues = new Set<string>();
  const fields: DocumentSummaryField[] = [];

  for (const fact of facts) {
    const value =
      (typeof fact.valueText === "string" && fact.valueText.trim()) ||
      (fact.valueNumber != null ? String(fact.valueNumber) : "") ||
      (fact.valueDate ? String(fact.valueDate) : "");

    if (!value || seenValues.has(value)) {
      continue;
    }

    seenValues.add(value);
    fields.push({
      key: fact.factType && fact.factType !== "other" ? canonicalizeSummaryKey(fact.factType) : null,
      rawLabel:
        fact.factType && fact.factType !== "other" ? humanizeFactType(fact.factType) : `Detected value ${fields.length + 1}`,
      value,
    });

    if (fields.length >= 6) {
      break;
    }
  }

  return {
    fields,
    lineItemCount: 0,
    normalizedText: null,
  };
}

function mergeSummaryFields(args: {
  keyedPreferred: DocumentSummaryField[];
  keyedFallback: DocumentSummaryField[];
  supplementalPreferred: DocumentSummaryField[];
  supplementalFallback: DocumentSummaryField[];
}) {
  const prioritizedFields = new Map<SummaryFieldKey, DocumentSummaryField>();

  for (const field of [...args.keyedPreferred, ...args.keyedFallback]) {
    if (!field.key || prioritizedFields.has(field.key)) {
      continue;
    }

    prioritizedFields.set(field.key, field);
  }

  const mergedFields = summaryPriority
    .map((key) => prioritizedFields.get(key))
    .filter((field): field is DocumentSummaryField => Boolean(field));

  const seenSupplemental = new Set(mergedFields.map((field) => dedupeFieldId(field)));

  for (const field of [...args.supplementalPreferred, ...args.supplementalFallback]) {
    if (mergedFields.length >= 6) {
      break;
    }

    const fieldId = dedupeFieldId(field);

    if (seenSupplemental.has(fieldId)) {
      continue;
    }

    mergedFields.push(field);
    seenSupplemental.add(fieldId);
  }

  return mergedFields;
}

export function buildDocumentPresentationSummary(args: {
  normalizedText?: string | null;
  facts?: SummaryFactInput[] | null;
}) {
  const normalizedSummary =
    typeof args.normalizedText === "string" && args.normalizedText.trim()
      ? buildSummaryFromNormalizedText(args.normalizedText)
      : null;
  const factSummary = Array.isArray(args.facts) && args.facts.length > 0 ? buildSummaryFromFacts(args.facts) : null;

  if (!normalizedSummary && !factSummary) {
    return {
      fields: [],
      lineItemCount: 0,
      normalizedText: null,
    } satisfies DocumentPresentationSummary;
  }

  if (normalizedSummary && !factSummary) {
    return normalizedSummary;
  }

  if (factSummary && !normalizedSummary) {
    return factSummary;
  }

  if (!normalizedSummary || !factSummary) {
    return {
      fields: [],
      lineItemCount: 0,
      normalizedText: null,
    } satisfies DocumentPresentationSummary;
  }

  const mergedNormalizedSummary = normalizedSummary;
  const mergedFactSummary = factSummary;

  return {
    fields: mergeSummaryFields({
      keyedPreferred: mergedFactSummary.fields.filter((field) => Boolean(field.key)),
      keyedFallback: mergedNormalizedSummary.fields.filter((field) => Boolean(field.key)),
      supplementalPreferred: mergedNormalizedSummary.fields.filter((field) => !field.key),
      supplementalFallback: mergedFactSummary.fields.filter((field) => !field.key),
    }),
    lineItemCount: Math.max(mergedNormalizedSummary.lineItemCount, mergedFactSummary.lineItemCount),
    normalizedText: mergedNormalizedSummary.normalizedText,
  } satisfies DocumentPresentationSummary;
}
