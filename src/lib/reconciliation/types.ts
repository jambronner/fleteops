export type ShipmentLifecycle = "planned" | "in_transit" | "delivered";

export type EvidenceDocumentType =
  | "customer_po"
  | "retailer_receipt"
  | "pod"
  | "carrier_invoice"
  | "broker_invoice"
  | "photo"
  | "voice_note";

export type EvidenceChannel = "whatsapp" | "email" | "upload" | "manual" | "import";

export type RequirementCode =
  | "purchase_order"
  | "delivery_proof"
  | "carrier_invoice"
  | "quantity_match"
  | "folio_return";

export type RequirementStatus = "matched" | "missing" | "rejected" | "not_required_yet";

export type ReconciliationStatus = "pending_docs" | "ready_for_review" | "approved" | "blocked";

export type ControlTowerStatus = "inTransit" | "pendingDocs" | "needsReview" | "ready" | "blocked";

export type ExceptionSeverity = "low" | "medium" | "high" | "critical";

export type ShipmentDocument = {
  id: string;
  type: EvidenceDocumentType;
  title: string;
  sourceChannel: EvidenceChannel;
  uploadedAt: string;
  issuingParty: string;
  extractedFacts: string[];
};

export type ShipmentMessage = {
  id: string;
  sentAt: string;
  senderName: string;
  senderRole: "driver" | "carrier_ops" | "shipper_ops" | "customer_contact" | "system";
  messageType: "text" | "image" | "audio" | "document";
  body: string;
};

export type OperatorDecision = {
  verdict: "approved" | "hold";
  note?: string | null;
  decidedByName?: string | null;
  decidedAt: string;
};

export type ShipmentPacket = {
  id: string;
  tenantId: string;
  shipmentReference: string;
  brokerName: string;
  customerName: string;
  shipperName: string;
  destinationName: string;
  routeLabel: string;
  lifecycle: ShipmentLifecycle;
  poNumber?: string;
  expectedDeliveryDate: string;
  actualDeliveryDate?: string;
  expectedQuantity: number;
  deliveredQuantity?: number;
  expectedCarrierInvoiceAmount?: number;
  carrierInvoiceAmount?: number;
  /** Workspace gates carrier payment on the physical folio return. */
  folioRequired?: boolean;
  /** Recorded folio return state; null/undefined means not yet recorded. */
  folioStatus?: "received" | "waived" | null;
  documents: ShipmentDocument[];
  messages: ShipmentMessage[];
  /** Recorded operator verdict; overrides the computed pay/hold state. */
  decision?: OperatorDecision | null;
};

export type RequirementEvaluation = {
  code: RequirementCode;
  label: string;
  status: RequirementStatus;
  reason: string;
  supportingDocumentIds: string[];
};

export type DetectedException = {
  id: string;
  type: string;
  severity: ExceptionSeverity;
  summary: string;
  blocking: boolean;
};

export type ShipmentSummary = {
  happened: string;
  missing: string;
  wrong: string;
  nextAction: string;
};

export type ReconciliationEvaluation = {
  status: ReconciliationStatus;
  controlTowerStatus: ControlTowerStatus;
  confidenceScore: number;
  requirements: RequirementEvaluation[];
  exceptions: DetectedException[];
  summary: ShipmentSummary;
};

export type ShipmentDetail = {
  packet: ShipmentPacket;
  evaluation: ReconciliationEvaluation;
};

export type DashboardSnapshot = {
  shipments: ShipmentDetail[];
  metrics: {
    activeShipments: number;
    reviewQueue: number;
    documentsMissing: number;
    readyToInvoice: number;
  };
  intakeActionQueue: Array<{
    id: string;
    title: string;
    details: string | null;
    priority: "low" | "normal" | "high" | "urgent";
    subjectType: string;
    subjectId: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>;
  exceptionQueue: Array<DetectedException & { shipmentId: string; shipmentReference: string }>;
  documentQueue: Array<{
    shipmentId: string;
    shipmentReference: string;
    customerName: string;
    missingLabels: string[];
  }>;
};
