import type {
  DocumentExtractionRequest,
  DocumentIntakeContext,
  DocumentSemanticClass,
} from "@/lib/documents/types";

export type InferredDocumentClass = {
  documentClass: DocumentSemanticClass;
  confidence: number;
  reasons: string[];
};

const purchaseOrderDocumentTypes = new Set(["customer_po", "shipper_po"]);
const invoiceDocumentTypes = new Set(["carrier_invoice", "broker_invoice", "vendor_invoice", "credit_note"]);
const podDocumentTypes = new Set(["pod", "retailer_receipt"]);
const spreadsheetDocumentTypes = new Set(["spreadsheet_import"]);
const imageDocumentTypes = new Set(["photo"]);

function cleanText(value?: string | null) {
  return value?.trim() ?? "";
}

function collectContextText(context?: DocumentIntakeContext | null) {
  return [
    context?.subject,
    context?.textBody,
    context?.senderName,
    context?.senderAddress,
    context?.messageCaption,
    context?.threadSnippet,
    ...(context?.attachmentNames ?? []),
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(" ");
}

function collectInferenceText(request: Pick<DocumentExtractionRequest, "originalFileName" | "documentType" | "intakeContext">) {
  return [request.originalFileName ?? "", request.documentType ?? "", collectContextText(request.intakeContext)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function pushReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

export function inferDocumentClass(
  request: Pick<
    DocumentExtractionRequest,
    "documentType" | "mimeType" | "originalFileName" | "sourceChannel" | "intakeContext"
  >,
): InferredDocumentClass {
  const reasons: string[] = [];
  const text = collectInferenceText(request);
  const mimeType = request.mimeType?.toLowerCase() ?? "";
  const documentType = request.documentType ?? null;

  if (documentType && purchaseOrderDocumentTypes.has(documentType)) {
    pushReason(reasons, "Existing document type already maps to purchase order.");
    return {
      documentClass: "purchase_order",
      confidence: 0.96,
      reasons,
    };
  }

  if (documentType && invoiceDocumentTypes.has(documentType)) {
    pushReason(reasons, "Existing document type already maps to invoice.");
    return {
      documentClass: "invoice",
      confidence: 0.95,
      reasons,
    };
  }

  if (documentType && podDocumentTypes.has(documentType)) {
    pushReason(reasons, "Existing document type already maps to proof of delivery.");
    return {
      documentClass: "proof_of_delivery",
      confidence: 0.94,
      reasons,
    };
  }

  if (documentType && spreadsheetDocumentTypes.has(documentType)) {
    pushReason(reasons, "Existing document type already maps to structured spreadsheet intake.");
    return {
      documentClass: "spreadsheet_manifest",
      confidence: 0.97,
      reasons,
    };
  }

  if (/\b(orden de compra|purchase order|po number|oc-\d+|oc\s*[:#-]|orden compra)\b/i.test(text)) {
    pushReason(reasons, "Content contains strong purchase-order language.");
    return {
      documentClass: "purchase_order",
      confidence: 0.9,
      reasons,
    };
  }

  if (/\b(factura|invoice|cfdi|xml|folio fiscal|nota de credito|credit note)\b/i.test(text)) {
    pushReason(reasons, "Content contains strong invoice language.");
    return {
      documentClass: "invoice",
      confidence: 0.88,
      reasons,
    };
  }

  if (/\b(pod|proof of delivery|recibido|recibi|recibí|firma|signed|entrega|delivered|rechazo)\b/i.test(text)) {
    pushReason(reasons, "Content contains delivery confirmation or receipt language.");
    return {
      documentClass: "proof_of_delivery",
      confidence: 0.84,
      reasons,
    };
  }

  if (documentType && imageDocumentTypes.has(documentType)) {
    pushReason(reasons, "Image was uploaded manually without a stronger semantic match.");
    return {
      documentClass: "delivery_photo",
      confidence: 0.74,
      reasons,
    };
  }

  if (mimeType.startsWith("image/")) {
    pushReason(reasons, "Image input defaults to delivery photo until another class is clear.");
    return {
      documentClass: "delivery_photo",
      confidence: 0.68,
      reasons,
    };
  }

  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType === "text/csv") {
    pushReason(reasons, "Spreadsheet-like MIME type detected.");
    return {
      documentClass: "spreadsheet_manifest",
      confidence: 0.9,
      reasons,
    };
  }

  pushReason(reasons, "No high-confidence semantic class was inferred from the current channel context.");

  return {
    documentClass: "generic_document",
    confidence: 0.4,
    reasons,
  };
}

export function buildDocumentClassInstructions(documentClass: DocumentSemanticClass) {
  const commonRules = [
    "Populate the facts array with the highest-confidence operational fields using only these stable factType values when applicable: `po_number`, `invoice_number`, `shipment_reference`, `delivery_date`, `receiver_name`, `store_name`, `qty_expected`, `qty_delivered`, `qty_rejected`, `amount_total`, or `other`.",
    "Do not invent new factType names outside that list. Put extra context into normalizedText instead.",
    "Return normalizedText as one field per line using the exact format `Label: value`.",
    "If line items exist, format them as `Line item 1 qty: ...`, `Line item 1 description: ...`, `Line item 1 unit price: ...`, and `Line item 1 total: ...`.",
    "Do not return prose paragraphs when the document contains table-like or form-like structure.",
  ];

  switch (documentClass) {
    case "purchase_order":
      return [
        "Treat this as a purchase order unless the document clearly contradicts that assumption.",
        "Prioritize purchase order number, order date, seller, buyer, billing address, shipping destination, delivery terms, payment terms, total amount, and line items.",
        "When possible, facts should include `po_number`, `delivery_date` when a delivery date is visible, `store_name` for the delivery point, `qty_expected`, and `amount_total`.",
        "If a handwritten completion note exists, include it in normalizedText with labels like `Receiver name:` and `Delivery date:` when possible.",
        ...commonRules,
      ].join(" ");
    case "invoice":
      return [
        "Treat this as an invoice or credit-note style financial document unless the document clearly contradicts that assumption.",
        "Prioritize invoice number, invoice date, seller, buyer, total amount, tax details, and any shipment or route reference.",
        "When possible, facts should include `invoice_number`, `shipment_reference`, `delivery_date`, and `amount_total`.",
        ...commonRules,
      ].join(" ");
    case "proof_of_delivery":
      return [
        "Treat this as proof of delivery or signed receipt unless the document clearly contradicts that assumption.",
        "Prioritize receiver name, delivery date, store or destination, quantity received, quantity rejected, and any exception note.",
        "When possible, facts should include `delivery_date`, `receiver_name`, `store_name`, `qty_delivered`, and `qty_rejected`.",
        ...commonRules,
      ].join(" ");
    case "delivery_photo":
      return [
        "Treat this as delivery-supporting visual evidence.",
        "If the image is actually a photographed form, convert the visible fields into labeled lines instead of returning a free-form paragraph.",
        "Prioritize any visible order number, location, date, signature, receiver, quantity, amount, and exception note.",
        "When possible, facts should include `po_number` or `invoice_number` if visible, plus `delivery_date`, `receiver_name`, `store_name`, `qty_delivered`, `qty_rejected`, and `amount_total`.",
        ...commonRules,
      ].join(" ");
    case "spreadsheet_manifest":
      return [
        "Treat this as a structured sheet or manifest-like document.",
        "Prioritize route references, dates, locations, counterparties, quantities, and totals.",
        "When possible, facts should include `shipment_reference`, `delivery_date`, `store_name`, `qty_expected`, `qty_delivered`, and `amount_total`.",
        ...commonRules,
      ].join(" ");
    default:
      return [
        "Treat this as a general logistics document.",
        "Return the highest-signal operational fields in labeled lines instead of a prose block whenever the layout supports it.",
        ...commonRules,
      ].join(" ");
  }
}

/**
 * Maps an inferred semantic class to the stored document type for channel
 * intake (email attachments, WhatsApp media). Shared so every intake channel
 * classifies incoming files the same way.
 */
export function mapSemanticClassToDocumentType(args: {
  semanticClass: DocumentSemanticClass;
  mimeType?: string | null;
}) {
  switch (args.semanticClass) {
    case "purchase_order":
      return "customer_po" as const;
    case "invoice":
      return "carrier_invoice" as const;
    case "proof_of_delivery":
      return "pod" as const;
    case "delivery_photo":
      return "photo" as const;
    case "spreadsheet_manifest":
      return "spreadsheet_import" as const;
    default:
      if ((args.mimeType ?? "").toLowerCase().includes("pdf")) {
        return "pdf" as const;
      }

      return "other" as const;
  }
}
