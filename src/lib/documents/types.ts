import type { ExtractedFactCandidate } from "@/lib/ai/contracts";

export type ExtractionProviderName = "docling" | "openrouter_vision";

export type DocumentInputClass =
  | "digital_document"
  | "scanned_document"
  | "photo"
  | "spreadsheet"
  | "audio"
  | "other";

export type DocumentSemanticClass =
  | "purchase_order"
  | "invoice"
  | "proof_of_delivery"
  | "delivery_photo"
  | "spreadsheet_manifest"
  | "generic_document";

export type DocumentIntakeContext = {
  subject?: string | null;
  textBody?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
  attachmentNames?: string[] | null;
  messageCaption?: string | null;
  threadSnippet?: string | null;
};

export type DocumentExtractionStrategy = "native_parse" | "ocr_parse" | "vision_extract";

export type DocumentArtifactType =
  | "ocr_text"
  | "markdown"
  | "layout_json"
  | "provider_raw"
  | "normalized_text"
  | "preview_image";

export type DocumentArtifactStorageType =
  | "inline_text"
  | "inline_json"
  | "object_storage"
  | "external_url";

export type DocumentExtractionArtifact = {
  artifactType: DocumentArtifactType;
  storageType: DocumentArtifactStorageType;
  mimeType?: string | null;
  language?: string | null;
  fileUrl?: string | null;
  textContent?: string | null;
  jsonContent?: Record<string, unknown> | null;
  byteSize?: number | null;
  pageFrom?: number | null;
  pageTo?: number | null;
  metadata?: Record<string, unknown>;
};

export type DocumentExtractionRequest = {
  tenantId: string;
  documentId: string;
  fileUrl?: string | null;
  fileDataUrl?: string | null;
  documentType?: string | null;
  mimeType?: string | null;
  originalFileName?: string | null;
  language?: string | null;
  sourceChannel?: "upload" | "whatsapp" | "email" | "manual" | "api" | "spreadsheet_import";
  trigger?: "upload" | "whatsapp_ingest" | "email_ingest" | "manual_retry" | "operator_request" | "workflow";
  pageCount?: number | null;
  forceVisionFallback?: boolean;
  detectedScanConfidence?: number | null;
  intakeContext?: DocumentIntakeContext | null;
  inferredDocumentClass?: DocumentSemanticClass | null;
};

export type DocumentRoutingDecision = {
  inputClass: DocumentInputClass;
  primaryProvider: ExtractionProviderName;
  fallbackProvider?: ExtractionProviderName;
  strategy: DocumentExtractionStrategy;
  shouldFallbackToVision: boolean;
  reviewThreshold: number;
  reasons: string[];
};

export type DocumentExtractionResultStatus = "completed" | "needs_review" | "failed";

export type DocumentExtractionResult = {
  provider: ExtractionProviderName;
  model?: string | null;
  status: DocumentExtractionResultStatus;
  overallConfidence?: number | null;
  needsReview: boolean;
  artifacts: DocumentExtractionArtifact[];
  facts: ExtractedFactCandidate[];
  metadata?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export interface DocumentExtractionProvider {
  name: ExtractionProviderName;
  extract(args: {
    request: DocumentExtractionRequest;
    decision: DocumentRoutingDecision;
  }): Promise<DocumentExtractionResult>;
}
