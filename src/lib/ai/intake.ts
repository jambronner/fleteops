import { z } from "zod";

import { getAppUrl, getOpenRouterApiKey, getOpenRouterVisionModel } from "@/lib/env";

const intakeClassificationSchema = z.enum([
  "route_request",
  "carrier_invoice",
  "delivery_evidence",
  "other",
]);

const intakeActionSchema = z.enum([
  "create_route",
  "update_route",
  "attach_evidence",
  "ignore",
  "needs_review",
]);

const intakeClueSchema = z.object({
  customerName: z.string().nullable().optional(),
  serviceDate: z.string().nullable().optional(),
  locationName: z.string().nullable().optional(),
  carrierName: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  amountTotal: z.number().nullable().optional(),
  purchaseOrderNumber: z.string().nullable().optional(),
});

const intakeTargetSchema = z.object({
  routeReference: z.string().nullable().optional(),
  purchaseOrderNumber: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  locationName: z.string().nullable().optional(),
  serviceDate: z.string().nullable().optional(),
});

const intakeUpdateSchema = z.object({
  expectedCompletionDate: z.string().nullable().optional(),
  actualCompletionDate: z.string().nullable().optional(),
  serviceDate: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const intakeClassificationResultSchema = z.object({
  classification: intakeClassificationSchema,
  action: intakeActionSchema.default("needs_review"),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
  rationale: z.string(),
  clues: intakeClueSchema.default({}),
  target: intakeTargetSchema.default({}),
  updates: intakeUpdateSchema.default({}),
});

export type IntakeClassification = z.infer<typeof intakeClassificationSchema>;
export type IntakeAction = z.infer<typeof intakeActionSchema>;
export type IntakeClassificationResult = z.infer<typeof intakeClassificationResultSchema>;

export type IntakeClassificationInput = {
  locale: "es-MX" | "en";
  subject?: string | null;
  textBody?: string | null;
  attachmentNames?: string[];
  senderName?: string | null;
  senderAddress?: string | null;
};

export interface IntakeClassifierProvider {
  name: string;
  classify(args: IntakeClassificationInput): Promise<IntakeClassificationResult>;
}

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
  model: z.string().optional(),
  provider: z.string().optional(),
});

const intakeClassificationJsonSchema = {
  name: "inbound_intake_classification",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      classification: {
        type: "string",
        enum: ["route_request", "carrier_invoice", "delivery_evidence", "other"],
      },
      action: {
        type: "string",
        enum: ["create_route", "update_route", "attach_evidence", "ignore", "needs_review"],
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
      },
      needsReview: {
        type: "boolean",
      },
      rationale: {
        type: "string",
      },
      clues: {
        type: "object",
        additionalProperties: false,
        properties: {
          customerName: { type: ["string", "null"] },
          serviceDate: { type: ["string", "null"] },
          locationName: { type: ["string", "null"] },
          carrierName: { type: ["string", "null"] },
          invoiceNumber: { type: ["string", "null"] },
          amountTotal: { type: ["number", "null"] },
          purchaseOrderNumber: { type: ["string", "null"] },
        },
        required: [
          "customerName",
          "serviceDate",
          "locationName",
          "carrierName",
          "invoiceNumber",
          "amountTotal",
          "purchaseOrderNumber",
        ],
      },
      target: {
        type: "object",
        additionalProperties: false,
        properties: {
          routeReference: { type: ["string", "null"] },
          purchaseOrderNumber: { type: ["string", "null"] },
          customerName: { type: ["string", "null"] },
          locationName: { type: ["string", "null"] },
          serviceDate: { type: ["string", "null"] },
        },
        required: [
          "routeReference",
          "purchaseOrderNumber",
          "customerName",
          "locationName",
          "serviceDate",
        ],
      },
      updates: {
        type: "object",
        additionalProperties: false,
        properties: {
          expectedCompletionDate: { type: ["string", "null"] },
          actualCompletionDate: { type: ["string", "null"] },
          serviceDate: { type: ["string", "null"] },
          note: { type: ["string", "null"] },
        },
        required: [
          "expectedCompletionDate",
          "actualCompletionDate",
          "serviceDate",
          "note",
        ],
      },
    },
    required: [
      "classification",
      "action",
      "confidence",
      "needsReview",
      "rationale",
      "clues",
      "target",
      "updates",
    ],
  },
} as const;

const monthLookup = new Map(
  Object.entries({
    jan: "01",
    january: "01",
    ene: "01",
    enero: "01",
    feb: "02",
    february: "02",
    febrero: "02",
    mar: "03",
    march: "03",
    marzo: "03",
    apr: "04",
    april: "04",
    abr: "04",
    abril: "04",
    may: "05",
    mayo: "05",
    jun: "06",
    june: "06",
    junio: "06",
    jul: "07",
    july: "07",
    julio: "07",
    aug: "08",
    august: "08",
    ago: "08",
    agosto: "08",
    sep: "09",
    sept: "09",
    september: "09",
    septiembre: "09",
    oct: "10",
    october: "10",
    octubre: "10",
    nov: "11",
    november: "11",
    noviembre: "11",
    dec: "12",
    december: "12",
    dic: "12",
    diciembre: "12",
  }),
);

function cleanNullable(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function collectContent(args: IntakeClassificationInput) {
  return [args.subject, args.textBody, ...(args.attachmentNames ?? []), args.senderName, args.senderAddress]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function inferInvoiceNumber(text: string) {
  const match = text.match(/\b(?:fac(?:tura)?|invoice|folio|ref(?:erencia)?)[:\s#-]*([a-z0-9-]{4,})/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function inferAmount(text: string) {
  const match = text.match(/\b(?:mxn|\$)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (!match?.[1]) {
    return null;
  }

  const numericValue = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeYear(value?: string | null) {
  if (!value) {
    return null;
  }

  return value.length === 2 ? `20${value}` : value;
}

function validIsoDate(year?: string | null, month?: string | null, day?: string | null) {
  if (!year || !month || !day) {
    return null;
  }

  const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${isoDate}T00:00:00Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return isoDate;
}

function uniqueDates(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function extractServiceDateCandidates(text: string) {
  const isoDateMatches = [...text.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)].map((match) =>
    validIsoDate(match[1], match[2], match[3]),
  );
  const regionalDateMatches = [...text.matchAll(/(?<![\d/-])(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?![\d/-])/g)].map(
    (match) => {
      const day = match[1];
      const month = match[2];
      const year = normalizeYear(match[3]) ?? String(new Date().getFullYear());

      return validIsoDate(year, month, day);
    },
  );
  const englishMonthDateMatches = [
    ...text.matchAll(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{2,4}))?\b/gi,
    ),
  ].map((match) =>
    validIsoDate(
      normalizeYear(match[3]) ?? String(new Date().getFullYear()),
      monthLookup.get(match[1]?.toLowerCase() ?? ""),
      match[2],
    ),
  );
  const spanishMonthDateMatches = [
    ...text.matchAll(
      /\b(\d{1,2})(?:\s+de)?\s+(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:tiembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)(?:\s+de)?\s*(\d{2,4})?\b/gi,
    ),
  ].map((match) =>
    validIsoDate(
      normalizeYear(match[3]) ?? String(new Date().getFullYear()),
      monthLookup.get(match[2]?.toLowerCase() ?? ""),
      match[1],
    ),
  );

  return uniqueDates([
    ...isoDateMatches,
    ...regionalDateMatches,
    ...englishMonthDateMatches,
    ...spanishMonthDateMatches,
  ]);
}

function inferServiceDate(text: string) {
  const dateCandidates = extractServiceDateCandidates(text);

  if (dateCandidates.length > 0) {
    return dateCandidates[0];
  }

  const isoDateMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

  if (isoDateMatch) {
    return validIsoDate(isoDateMatch[1], isoDateMatch[2], isoDateMatch[3]);
  }

  const regionalDateMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);

  if (regionalDateMatch) {
    return validIsoDate(
      normalizeYear(regionalDateMatch[3]) ?? String(new Date().getFullYear()),
      regionalDateMatch[2],
      regionalDateMatch[1],
    );
  }

  const englishMonthDateMatch = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{2,4}))?\b/i,
  );

  if (englishMonthDateMatch) {
    return validIsoDate(
      normalizeYear(englishMonthDateMatch[3]) ?? String(new Date().getFullYear()),
      monthLookup.get(englishMonthDateMatch[1]?.toLowerCase() ?? ""),
      englishMonthDateMatch[2],
    );
  }

  const spanishMonthDateMatch = text.match(
    /\b(\d{1,2})(?:\s+de)?\s+(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:tiembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)(?:\s+de)?\s*(\d{2,4})?\b/i,
  );

  if (spanishMonthDateMatch) {
    return validIsoDate(
      normalizeYear(spanishMonthDateMatch[3]) ?? String(new Date().getFullYear()),
      monthLookup.get(spanishMonthDateMatch[2]?.toLowerCase() ?? ""),
      spanishMonthDateMatch[1],
    );
  }

  return null;
}

function inferPurchaseOrderNumber(text: string) {
  const match = text.match(
    /\b(?:orden\s+de\s+compra|purchase\s+order|po|oc)[:#\s-]*([a-z0-9][a-z0-9._-]{2,})\b/i,
  );

  return match?.[1]?.toUpperCase() ?? null;
}

function inferRequestedRouteAction(text: string) {
  const hasUpdateIntent =
    /\b(change|changed|update|updated|set|move|reschedule|postpone|modify|cambiar|cambio|modificar|actualizar|reprogramar)\b/i.test(
      text,
    );
  const hasDateContext =
    /\b(date|fecha|delivery|entrega|completion|completado|finalizaci[oó]n|service|servicio)\b/i.test(text);
  const inferredDate = inferServiceDate(text);

  if (!hasUpdateIntent || !hasDateContext) {
    return {
      action: "create_route" as const,
      updates: {},
      needsReview: false,
    };
  }

  const targetsActualCompletion =
    /\b(actual|completed|delivered|real|recibido|entregado|completado|finalizado)\b/i.test(text);
  const note = text.length > 280 ? `${text.slice(0, 277)}...` : text;

  return {
    action: "update_route" as const,
    updates: {
      expectedCompletionDate: targetsActualCompletion ? null : inferredDate,
      actualCompletionDate: targetsActualCompletion ? inferredDate : null,
      serviceDate: null,
      note,
    },
    needsReview: !inferredDate,
  };
}

function inferRouteRequestClues(args: IntakeClassificationInput) {
  const haystack = [args.subject, args.textBody].filter(Boolean).join(" ");
  const dateCandidates = extractServiceDateCandidates(haystack);
  const serviceDate = dateCandidates.length === 1 ? dateCandidates[0] : null;
  return {
    customerName: cleanNullable(args.senderName),
    serviceDate,
    locationName: null,
    carrierName: null,
    invoiceNumber: null,
    amountTotal: null,
    purchaseOrderNumber: inferPurchaseOrderNumber(haystack),
  };
}

function inferCarrierInvoiceClues(args: IntakeClassificationInput) {
  const haystack = [args.subject, args.textBody].filter(Boolean).join(" ");
  return {
    customerName: null,
    serviceDate: inferServiceDate(haystack),
    locationName: null,
    carrierName: cleanNullable(args.senderName),
    invoiceNumber: inferInvoiceNumber(haystack),
    amountTotal: inferAmount(haystack),
    purchaseOrderNumber: inferPurchaseOrderNumber(haystack),
  };
}

function inferDeliveryEvidenceClues(args: IntakeClassificationInput) {
  return {
    customerName: cleanNullable(args.senderName),
    serviceDate: inferServiceDate(args.textBody ?? args.subject ?? ""),
    locationName: null,
    carrierName: null,
    invoiceNumber: null,
    amountTotal: null,
    purchaseOrderNumber: inferPurchaseOrderNumber([args.subject, args.textBody].filter(Boolean).join(" ")),
  };
}

export const heuristicIntakeClassifier: IntakeClassifierProvider = {
  name: "heuristic_intake",
  async classify(args) {
    const content = collectContent(args);
    const action = inferRequestedRouteAction([args.subject, args.textBody].filter(Boolean).join(" "));
    const purchaseOrderNumber = inferPurchaseOrderNumber([args.subject, args.textBody].filter(Boolean).join(" "));

    if (/\b(factura|invoice|cfdi|xml|pdf de factura|adjunto factura)\b/i.test(content)) {
      return intakeClassificationResultSchema.parse({
        classification: "carrier_invoice",
        action: "attach_evidence",
        confidence: 0.72,
        needsReview: false,
        rationale:
          args.locale === "en"
            ? "The content references an invoice or tax document, so it should enter the carrier invoice review flow."
            : "El contenido hace referencia a una factura o CFDI, así que debe entrar al flujo de revisión de factura carrier.",
        clues: inferCarrierInvoiceClues(args),
        target: {
          routeReference: null,
          purchaseOrderNumber,
          customerName: null,
          locationName: null,
          serviceDate: inferServiceDate(content),
        },
        updates: {},
      });
    }

    if (/\b(entrega|delivered|pod|recibido|recibo|rechazo|firma|evidencia|foto)\b/i.test(content)) {
      return intakeClassificationResultSchema.parse({
        classification: "delivery_evidence",
        action: "attach_evidence",
        confidence: 0.67,
        needsReview: false,
        rationale:
          args.locale === "en"
            ? "The content looks like proof, confirmation, or exception context for a completed delivery."
            : "El contenido parece prueba, confirmación o contexto de excepción para una entrega realizada.",
        clues: inferDeliveryEvidenceClues(args),
        target: {
          routeReference: null,
          purchaseOrderNumber,
          customerName: cleanNullable(args.senderName),
          locationName: null,
          serviceDate: inferServiceDate(content),
        },
        updates: {},
      });
    }

    if (/\b(entregar|delivery|ruta|route|pickup|recoleccion|recolección|mañana|tomorrow|hoy|today|camion|camión)\b/i.test(content)) {
      const routeClues = inferRouteRequestClues(args);
      const dateCandidates = extractServiceDateCandidates([args.subject, args.textBody].filter(Boolean).join(" "));

      return intakeClassificationResultSchema.parse({
        classification: "route_request",
        action: action.action,
        confidence: 0.61,
        needsReview: action.needsReview || dateCandidates.length > 1,
        rationale:
          args.locale === "en"
            ? "The message looks like an operational request to move goods on a route or service date."
            : "El mensaje parece una solicitud operativa para mover mercancía en una ruta o fecha de servicio.",
        clues: routeClues,
        target: {
          routeReference: null,
          purchaseOrderNumber,
          customerName: cleanNullable(args.senderName),
          locationName: null,
          serviceDate: routeClues.serviceDate,
        },
        updates: action.updates,
      });
    }

    return intakeClassificationResultSchema.parse({
      classification: "other",
      action: "ignore",
      confidence: 0.35,
      needsReview: true,
      rationale:
        args.locale === "en"
          ? "The content does not confidently map to a route request, carrier invoice, or delivery evidence."
          : "El contenido no se puede mapear con confianza a solicitud de ruta, factura carrier o evidencia de entrega.",
      clues: {},
      target: {},
      updates: {},
    });
  },
};

function buildClassifierPrompt(args: IntakeClassificationInput) {
  return [
    "Classify this inbound logistics message for FleteOps.",
    `Locale: ${args.locale}.`,
    "Return exactly one classification:",
    "- route_request: a customer/operator is asking for a pickup, delivery, route, truck, or operational movement to be created or changed.",
    "- carrier_invoice: the message is about a carrier/supplier invoice, CFDI, payment request, or bill for transport services.",
    "- delivery_evidence: the message proves or explains execution, delivery, receipt, rejection, signature, photo evidence, or POD.",
    "- other: noise, chatter, unrelated messages, or anything not actionable for route reconciliation.",
    "Also return one action:",
    "- create_route: the message asks for a new pickup, delivery, route, or truck movement.",
    "- update_route: the message asks to change an existing route, date, status, location, carrier, or route detail.",
    "- attach_evidence: the message or attachments provide proof, a PO, a carrier invoice, a receipt, or other evidence for a route.",
    "- ignore: the message is irrelevant noise.",
    "- needs_review: the message is operationally relevant but too ambiguous or risky to act on without a person.",
    "Prefer not to ingest noise. Mark needsReview true when context is thin, ambiguous, or the message could affect money.",
    "Use Mexico logistics context. If a date is explicit, return every date as YYYY-MM-DD. If a date is relative but cannot be resolved safely, leave it null.",
    "For update_route, fill updates only for values explicitly requested by the sender. Use expectedCompletionDate for scheduled/requested delivery dates; use actualCompletionDate only when the message clearly says the delivery actually happened or was completed.",
    "For update_route, fill target with route reference, PO/OC number, customer/location, or service date when present. If no target signal is present, keep the field null and mark needsReview true.",
    "Do not invent company, carrier, location, invoice, amount, or date values.",
    args.senderName || args.senderAddress
      ? `Sender: ${[args.senderName, args.senderAddress].filter(Boolean).join(" <")}${args.senderName && args.senderAddress ? ">" : ""}`
      : null,
    args.subject ? `Subject: ${args.subject}` : null,
    args.attachmentNames?.length ? `Attachment names: ${args.attachmentNames.join(", ")}` : null,
    args.textBody ? `Message body:\n${args.textBody.slice(0, 6000)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export const openRouterIntakeClassifier: IntakeClassifierProvider = {
  name: "openrouter_intake",
  async classify(args) {
    const openRouterApiKey = getOpenRouterApiKey();

    if (!openRouterApiKey) {
      return heuristicIntakeClassifier.classify(args);
    }

    const appUrl = getAppUrl();
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
        ...(appUrl ? { "HTTP-Referer": appUrl } : {}),
        "X-Title": "FleteOps",
      },
      body: JSON.stringify({
        model: getOpenRouterVisionModel(),
        response_format: {
          type: "json_schema",
          json_schema: intakeClassificationJsonSchema,
        },
        messages: [
          {
            role: "system",
            content:
              "You are a conservative logistics intake classifier. Return only the requested JSON schema.",
          },
          {
            role: "user",
            content: buildClassifierPrompt(args),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter intake classification failed with status ${response.status}.`);
    }

    const payload = openRouterResponseSchema.parse(await response.json());
    return intakeClassificationResultSchema.parse(JSON.parse(payload.choices[0]?.message.content ?? "{}"));
  },
};

export async function classifyInboundIntake(
  args: IntakeClassificationInput,
  provider: IntakeClassifierProvider = openRouterIntakeClassifier,
) {
  try {
    return await provider.classify(args);
  } catch {
    return heuristicIntakeClassifier.classify(args);
  }
}
