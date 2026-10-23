export type ExtractionJobInput = {
  tenantId: string;
  documentId: string;
  language: "es-MX" | "en";
  mimeType?: string | null;
};

export type ExtractedFactCandidate = {
  factType: string;
  valueText?: string;
  valueNumber?: number;
  valueDate?: string;
  confidence: number;
  reasoning?: string;
};

export type ShipmentSummaryInput = {
  tenantId: string;
  shipmentId: string;
  locale: "es-MX" | "en";
};

export const aiOperatingRules = {
  extraction: [
    "Prefer Spanish and Mexico-specific document patterns.",
    "Never discard raw evidence.",
    "Return confidence for every extracted fact.",
    "Escalate ambiguous values to operator review instead of guessing.",
  ],
  summaries: [
    "Explain what happened, what is missing, what is wrong, and what needs action.",
    "Write operator-facing summaries in Spanish for the customer workspace.",
    "Keep the workflow deterministic outside the model boundary.",
  ],
} as const;
