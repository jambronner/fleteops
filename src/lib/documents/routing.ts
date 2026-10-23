import type {
  DocumentExtractionRequest,
  DocumentInputClass,
  DocumentRoutingDecision,
} from "@/lib/documents/types";

const spreadsheetExtensions = new Set(["csv", "xls", "xlsx"]);
const digitalDocumentExtensions = new Set(["pdf", "doc", "docx", "rtf", "txt"]);
const spreadsheetMimeTypes = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const digitalDocumentMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/plain",
]);

const scannedFilenameHints = ["scan", "scanner", "cam", "captura", "foto"];

function getFileExtension(fileName?: string | null) {
  if (!fileName || !fileName.includes(".")) {
    return "";
  }

  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function isPhotoMimeType(mimeType?: string | null) {
  return mimeType?.startsWith("image/") ?? false;
}

function looksScanned(request: DocumentExtractionRequest) {
  const fileName = request.originalFileName?.toLowerCase() ?? "";
  const hasScannedHint = scannedFilenameHints.some((hint) => fileName.includes(hint));

  return (request.detectedScanConfidence ?? 0) >= 0.65 || hasScannedHint;
}

export function classifyDocumentInput(request: DocumentExtractionRequest): DocumentInputClass {
  const extension = getFileExtension(request.originalFileName);
  const mimeType = request.mimeType?.toLowerCase() ?? "";

  if (request.forceVisionFallback) {
    return "photo";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  if (isPhotoMimeType(mimeType)) {
    return "photo";
  }

  if (spreadsheetMimeTypes.has(mimeType) || spreadsheetExtensions.has(extension)) {
    return "spreadsheet";
  }

  if (mimeType === "application/pdf" || extension === "pdf") {
    return looksScanned(request) ? "scanned_document" : "digital_document";
  }

  if (digitalDocumentMimeTypes.has(mimeType) || digitalDocumentExtensions.has(extension)) {
    return "digital_document";
  }

  return "other";
}

export function decideDocumentRouting(request: DocumentExtractionRequest): DocumentRoutingDecision {
  const inputClass = classifyDocumentInput(request);
  const reasons: string[] = [];

  if (request.forceVisionFallback) {
    reasons.push("Vision fallback was explicitly requested.");

    return {
      inputClass,
      primaryProvider: "openrouter_vision",
      strategy: "vision_extract",
      shouldFallbackToVision: false,
      reviewThreshold: 0.8,
      reasons,
    };
  }

  if (inputClass === "photo") {
    reasons.push("Image input is routed directly to the vision extraction fallback.");

    return {
      inputClass,
      primaryProvider: "openrouter_vision",
      strategy: "vision_extract",
      shouldFallbackToVision: false,
      reviewThreshold: 0.82,
      reasons,
    };
  }

  if (inputClass === "scanned_document") {
    reasons.push("Scanned PDFs go to Docling with OCR before escalating to vision.");

    return {
      inputClass,
      primaryProvider: "docling",
      fallbackProvider: "openrouter_vision",
      strategy: "ocr_parse",
      shouldFallbackToVision: true,
      reviewThreshold: 0.78,
      reasons,
    };
  }

  if (inputClass === "spreadsheet") {
    reasons.push("Structured spreadsheets stay on the deterministic Docling path.");

    return {
      inputClass,
      primaryProvider: "docling",
      strategy: "native_parse",
      shouldFallbackToVision: false,
      reviewThreshold: 0.92,
      reasons,
    };
  }

  if (inputClass === "digital_document") {
    reasons.push("Native digital documents start with Docling extraction.");

    return {
      inputClass,
      primaryProvider: "docling",
      fallbackProvider: "openrouter_vision",
      strategy: "native_parse",
      shouldFallbackToVision: true,
      reviewThreshold: 0.84,
      reasons,
    };
  }

  if (inputClass === "audio") {
    reasons.push("Audio attachments need a dedicated transcription flow before extraction.");

    return {
      inputClass,
      primaryProvider: "openrouter_vision",
      strategy: "vision_extract",
      shouldFallbackToVision: false,
      reviewThreshold: 0.9,
      reasons,
    };
  }

  reasons.push("Unknown file types default to vision-assisted extraction for review.");

  return {
    inputClass,
    primaryProvider: "openrouter_vision",
    strategy: "vision_extract",
    shouldFallbackToVision: false,
    reviewThreshold: 0.8,
    reasons,
  };
}
