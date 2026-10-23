import { z } from "zod";

import { buildDocumentClassInstructions, inferDocumentClass } from "@/lib/documents/classification";
import type {
  DocumentExtractionProvider,
  DocumentExtractionResult,
  DocumentSemanticClass,
} from "@/lib/documents/types";
import { getAppUrl, getOpenRouterApiKey, getOpenRouterVisionModel } from "@/lib/env";

const extractionSchema = {
  name: "document_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      overallConfidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
      },
      needsReview: {
        type: "boolean",
      },
      facts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            factType: { type: "string" },
            valueText: { type: ["string", "null"] },
            valueNumber: { type: ["number", "null"] },
            valueDate: { type: ["string", "null"] },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1,
            },
            reasoning: { type: ["string", "null"] },
          },
          required: ["factType", "confidence", "valueText", "valueNumber", "valueDate", "reasoning"],
        },
      },
      normalizedText: { type: ["string", "null"] },
    },
    required: ["overallConfidence", "needsReview", "facts", "normalizedText"],
  },
} as const;

const openRouterResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      }),
    )
    .min(1),
  provider: z.string().optional(),
  model: z.string().optional(),
});

const parsedExtractionSchema = z.object({
  overallConfidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
  normalizedText: z.string().nullable(),
  facts: z.array(
    z.object({
      factType: z.string(),
      valueText: z.string().nullable(),
      valueNumber: z.number().nullable(),
      valueDate: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      reasoning: z.string().nullable(),
    }),
  ),
});

function buildUserPrompt(args: {
  language: string;
  documentClass: DocumentSemanticClass;
  contextText?: string | null;
}) {
  return [
    "Extract operational facts from this logistics document.",
    `Workspace language: ${args.language}.`,
    `Detected document class: ${args.documentClass}.`,
    "Document types may include purchase orders, delivery receipts, proof of delivery, or invoices.",
    "Prefer Mexico-specific date and numbering patterns.",
    "If a value is ambiguous, keep confidence low and mark needsReview instead of guessing.",
    buildDocumentClassInstructions(args.documentClass),
    args.contextText ? `Available channel context: ${args.contextText}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildFileContentPart(
  fileUrl: string,
  mimeType?: string | null,
  originalFileName?: string | null,
) {
  if (mimeType?.startsWith("image/")) {
    return {
      type: "image_url",
      image_url: {
        url: fileUrl,
      },
    };
  }

  return {
    type: "file",
    file: {
      filename: originalFileName ?? "document",
      file_data: fileUrl,
    },
  };
}

function isPdfRequest(request: { mimeType?: string | null; originalFileName?: string | null }) {
  const extension = request.originalFileName?.split(".").pop()?.toLowerCase() ?? "";
  return request.mimeType === "application/pdf" || extension === "pdf";
}

type OpenRouterPlugin = {
  id: string;
  pdf?: {
    engine: string;
  };
};

async function requestOpenRouterExtraction(args: {
  fileReference: string;
  request: {
    language?: string | null;
    mimeType?: string | null;
    originalFileName?: string | null;
  };
  documentClass: DocumentSemanticClass;
  contextText?: string | null;
  plugins?: OpenRouterPlugin[];
}) {
  const openRouterApiKey = getOpenRouterApiKey();
  const model = getOpenRouterVisionModel();
  const appUrl = getAppUrl();

  if (!openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is required to use the vision fallback provider.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterApiKey}`,
      "Content-Type": "application/json",
      ...(appUrl ? { "HTTP-Referer": appUrl } : {}),
      "X-Title": "FleteOps AI",
    },
    body: JSON.stringify({
      model,
      ...(args.plugins && args.plugins.length > 0 ? { plugins: args.plugins } : {}),
      response_format: {
        type: "json_schema",
        json_schema: extractionSchema,
      },
      messages: [
        {
          role: "system",
          content:
            "You extract fields from Spanish-language logistics documents. Return only the schema requested.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildUserPrompt({
                language: args.request.language ?? "es-MX",
                documentClass: args.documentClass,
                contextText: args.contextText,
              }),
            },
            buildFileContentPart(
              args.fileReference,
              args.request.mimeType,
              args.request.originalFileName,
            ),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    let providerMessage = `OpenRouter vision extraction failed with status ${response.status}.`;

    try {
      const errorPayload = (await response.json()) as {
        error?: {
          message?: string;
        };
      };

      if (errorPayload.error?.message) {
        providerMessage = `${providerMessage} ${errorPayload.error.message}`;
      }
    } catch {
      // Ignore response parsing failures and keep the base error message.
    }

    throw new Error(providerMessage);
  }

  return openRouterResponseSchema.parse(await response.json());
}

export const openRouterVisionProvider: DocumentExtractionProvider = {
  name: "openrouter_vision",
  async extract({ request }): Promise<DocumentExtractionResult> {
    const openRouterApiKey = getOpenRouterApiKey();

    if (!openRouterApiKey) {
      throw new Error("OPENROUTER_API_KEY is required to use the vision fallback provider.");
    }

    const fileReference = request.fileDataUrl ?? request.fileUrl;
    const inferredClass =
      request.inferredDocumentClass ??
      inferDocumentClass({
        documentType: request.documentType ?? null,
        mimeType: request.mimeType ?? null,
        originalFileName: request.originalFileName ?? null,
        sourceChannel: request.sourceChannel,
        intakeContext: request.intakeContext ?? null,
      }).documentClass;
    const contextText = [
      request.intakeContext?.subject,
      request.intakeContext?.textBody,
      request.intakeContext?.senderName,
      request.intakeContext?.senderAddress,
      request.intakeContext?.messageCaption,
      request.intakeContext?.threadSnippet,
      ...(request.intakeContext?.attachmentNames ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (!fileReference) {
      throw new Error("A fileUrl is required for the vision fallback provider.");
    }

    const isPdf = isPdfRequest(request);
    let payload;

    try {
      // Gemini accepts PDFs natively, which avoids the flaky Cloudflare PDF parser path.
      payload = await requestOpenRouterExtraction({
        fileReference,
        request,
        documentClass: inferredClass,
        contextText,
      });
    } catch (error) {
      const shouldRetryWithNativePlugin =
        isPdf &&
        error instanceof Error &&
        error.message.includes("status 400");

      if (!shouldRetryWithNativePlugin) {
        throw error;
      }

      payload = await requestOpenRouterExtraction({
        fileReference,
        request,
        documentClass: inferredClass,
        contextText,
        plugins: [
          {
            id: "file-parser",
            pdf: {
              engine: "native",
            },
          },
        ],
      });
    }

    const rawContent = payload.choices[0]?.message.content ?? "{}";
    const parsed = parsedExtractionSchema.parse(JSON.parse(rawContent));

    return {
      provider: "openrouter_vision",
      model: payload.model ?? getOpenRouterVisionModel(),
      status: parsed.needsReview ? "needs_review" : "completed",
      overallConfidence: parsed.overallConfidence,
      needsReview: parsed.needsReview,
      facts: parsed.facts.map((fact) => ({
        factType: fact.factType,
        valueText: fact.valueText ?? undefined,
        valueNumber: fact.valueNumber ?? undefined,
        valueDate: fact.valueDate ?? undefined,
        confidence: fact.confidence,
        reasoning: fact.reasoning ?? undefined,
      })),
      artifacts: [
        {
          artifactType: "normalized_text",
          storageType: "inline_text",
          mimeType: "text/plain",
          language: request.language ?? "es-MX",
          textContent: parsed.normalizedText ?? null,
        },
        {
          artifactType: "provider_raw",
          storageType: "inline_json",
          jsonContent: {
            response: payload,
          },
          metadata: {
            normalizedBy: "fleteops-openrouter-vision-adapter",
          },
        },
      ],
      metadata: {
        provider: payload.provider ?? null,
        inferredDocumentClass: inferredClass,
      },
    };
  },
};
