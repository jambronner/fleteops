import type { AppLocale } from "@/lib/i18n/config";
import type {
  ControlTowerStatus,
  DetectedException,
  ReconciliationEvaluation,
  RequirementEvaluation,
  ShipmentPacket,
  ShipmentSummary,
} from "@/lib/reconciliation/types";

type ReconciliationLocale = AppLocale | string;

function isEnglish(locale: ReconciliationLocale) {
  return locale === "en";
}

function requirementLabel(
  locale: ReconciliationLocale,
  code: RequirementEvaluation["code"],
) {
  const labels = isEnglish(locale)
    ? {
        purchase_order: "Client request on file",
        delivery_proof: "Execution proof or receipt",
        carrier_invoice: "Carrier invoice",
        quantity_match: "Quantity match",
        folio_return: "Signed folio returned",
      }
    : {
        purchase_order: "Solicitud del cliente registrada",
        delivery_proof: "Prueba de ejecución o recibo",
        carrier_invoice: "Factura del carrier",
        quantity_match: "Coincidencia de cantidades",
        folio_return: "Folio firmado devuelto",
      };

  return labels[code];
}

function hasDocument(packet: ShipmentPacket, types: ShipmentPacket["documents"][number]["type"][]) {
  return packet.documents.filter((document) => types.includes(document.type));
}

function buildRequirements(packet: ShipmentPacket, locale: ReconciliationLocale): RequirementEvaluation[] {
  const poDocuments = hasDocument(packet, ["customer_po"]);
  const deliveryProofDocuments = hasDocument(packet, ["pod", "retailer_receipt"]);
  const carrierInvoiceDocuments = hasDocument(packet, ["carrier_invoice"]);
  const qtyKnown = typeof packet.deliveredQuantity === "number";
  const qtyMatched = qtyKnown && packet.deliveredQuantity === packet.expectedQuantity;
  const english = isEnglish(locale);

  const requirements: RequirementEvaluation[] = [
    {
      code: "purchase_order",
      label: requirementLabel(locale, "purchase_order"),
      status: packet.poNumber || poDocuments.length > 0 ? "matched" : "missing",
      reason:
        packet.poNumber || poDocuments.length > 0
          ? english
            ? `A client request reference ${packet.poNumber ?? "detected in evidence"} is available for this route.`
            : `Existe una referencia de solicitud ${packet.poNumber ?? "detectada en evidencia"} para esta ruta.`
          : english
            ? "There is still no linked client request or commercial reference for this route."
            : "Todavía no existe una solicitud o referencia comercial ligada a esta ruta.",
      supportingDocumentIds: poDocuments.map((document) => document.id),
    },
    {
      code: "delivery_proof",
      label: requirementLabel(locale, "delivery_proof"),
      status:
        packet.lifecycle !== "delivered"
          ? "not_required_yet"
          : deliveryProofDocuments.length > 0
            ? "matched"
            : "missing",
      reason:
        packet.lifecycle !== "delivered"
          ? english
            ? "The route is still in progress, so final execution proof is not required yet."
            : "La ruta sigue en curso, así que la evidencia final todavía no es exigible."
          : deliveryProofDocuments.length > 0
            ? english
              ? "Execution evidence is available for review."
              : "Existe evidencia de ejecución lista para revisión."
            : english
              ? "Execution proof, signed receipt, or similar support is still missing."
              : "Todavía falta una prueba de ejecución, recibo firmado u otro soporte equivalente.",
      supportingDocumentIds: deliveryProofDocuments.map((document) => document.id),
    },
    {
      code: "carrier_invoice",
      label: requirementLabel(locale, "carrier_invoice"),
      status:
        packet.lifecycle !== "delivered"
          ? "not_required_yet"
          : carrierInvoiceDocuments.length > 0
            ? "matched"
            : "missing",
      reason:
        packet.lifecycle !== "delivered"
          ? english
            ? "The carrier invoice is expected after route completion."
            : "La factura del carrier se espera después del cierre de la ruta."
          : carrierInvoiceDocuments.length > 0
            ? english
              ? "The carrier invoice has already been received."
              : "La factura del carrier ya fue recibida."
            : english
              ? "The carrier invoice has not been received yet."
              : "Aún no se recibe la factura del carrier.",
      supportingDocumentIds: carrierInvoiceDocuments.map((document) => document.id),
    },
    {
      code: "quantity_match",
      label: requirementLabel(locale, "quantity_match"),
      status:
        !qtyKnown
          ? "not_required_yet"
          : qtyMatched
            ? "matched"
            : "rejected",
      reason:
        !qtyKnown
          ? english
            ? "This internal quantity check unlocks once execution evidence includes quantity detail."
            : "Este check interno de cantidades se habilita cuando la evidencia de ejecución ya incluye detalle de cantidades."
          : qtyMatched
            ? english
              ? "The execution signal matches the planned route well enough to proceed."
              : "La señal de ejecución coincide con la ruta planeada y puede avanzar."
            : english
              ? `The execution signal differs from the plan: expected ${packet.expectedQuantity} and found ${packet.deliveredQuantity}.`
              : `La señal de ejecución difiere de lo planeado: se esperaban ${packet.expectedQuantity} y se encontraron ${packet.deliveredQuantity}.`,
      supportingDocumentIds: deliveryProofDocuments.map((document) => document.id),
    },
  ];

  // Physical folio return is a workspace-level payment gate ("no folio, no
  // carrier payment"): the driver must hand back the signed printed delivery
  // document before the invoice is payable. Only evaluated when the workspace
  // opted in, so tenants without the practice never see the requirement.
  if (packet.folioRequired) {
    const folioSatisfied = packet.folioStatus === "received" || packet.folioStatus === "waived";

    requirements.push({
      code: "folio_return",
      label: requirementLabel(locale, "folio_return"),
      status:
        packet.lifecycle !== "delivered"
          ? "not_required_yet"
          : folioSatisfied
            ? "matched"
            : "missing",
      reason:
        packet.lifecycle !== "delivered"
          ? english
            ? "The signed folio is expected back after route completion."
            : "El folio firmado se espera de regreso después del cierre de la ruta."
          : packet.folioStatus === "received"
            ? english
              ? "The signed folio was returned and recorded."
              : "El folio firmado ya fue devuelto y registrado."
            : packet.folioStatus === "waived"
              ? english
                ? "The folio requirement was waived for this route."
                : "El requisito de folio fue dispensado para esta ruta."
              : english
                ? "The signed folio has not been returned; carrier payment stays gated until it is recorded."
                : "El folio firmado no ha sido devuelto; el pago al carrier queda detenido hasta registrarlo.",
      supportingDocumentIds: [],
    });
  }

  return requirements;
}

function buildExceptions(
  packet: ShipmentPacket,
  requirements: RequirementEvaluation[],
  locale: ReconciliationLocale,
): DetectedException[] {
  const exceptions: DetectedException[] = [];
  const deliveryProofRequirement = requirements.find((item) => item.code === "delivery_proof");
  const carrierInvoiceRequirement = requirements.find((item) => item.code === "carrier_invoice");
  const quantityRequirement = requirements.find((item) => item.code === "quantity_match");
  const english = isEnglish(locale);

  if (packet.lifecycle === "delivered" && deliveryProofRequirement?.status === "missing") {
    exceptions.push({
      id: `${packet.id}-missing-pod`,
      type: "missing_pod",
      severity: "high",
      summary: english
        ? "The route is marked complete, but there is no supporting proof of execution."
        : "La ruta aparece como completada, pero no existe soporte suficiente de ejecución.",
      blocking: true,
    });
  }

  if (packet.lifecycle === "delivered" && carrierInvoiceRequirement?.status === "missing") {
    exceptions.push({
      id: `${packet.id}-carrier-invoice`,
      type: "invoice_missing",
      severity: "medium",
      summary: english
        ? "Carrier invoice is still missing before finance can move forward."
        : "Todavía falta la factura del carrier para que finanzas pueda avanzar.",
      blocking: false,
    });
  }

  if (quantityRequirement?.status === "rejected" && typeof packet.deliveredQuantity === "number") {
    exceptions.push({
      id: `${packet.id}-qty-mismatch`,
      type: packet.deliveredQuantity > packet.expectedQuantity ? "qty_over" : "qty_short",
      severity: "high",
      summary: english
        ? `There is a difference of ${Math.abs(packet.deliveredQuantity - packet.expectedQuantity)} units versus expected.`
        : `Existe una diferencia de ${Math.abs(packet.deliveredQuantity - packet.expectedQuantity)} unidades contra lo esperado.`,
      blocking: true,
    });
  }

  if (
    typeof packet.expectedCarrierInvoiceAmount === "number" &&
    typeof packet.carrierInvoiceAmount === "number"
  ) {
    const variance = Math.abs(packet.carrierInvoiceAmount - packet.expectedCarrierInvoiceAmount);
    const varianceRatio = variance / Math.max(packet.expectedCarrierInvoiceAmount, 1);

    if (varianceRatio >= 0.08) {
      exceptions.push({
        id: `${packet.id}-invoice-variance`,
        type: "payment_mismatch",
      severity: varianceRatio >= 0.15 ? "high" : "medium",
      summary: english
          ? `Carrier invoice differs ${varianceRatio >= 0.15 ? "materially" : "above tolerance"} from the expected route amount.`
          : `La factura del carrier difiere ${varianceRatio >= 0.15 ? "de forma material" : "por arriba de tolerancia"} del monto esperado para la ruta.`,
        blocking: varianceRatio >= 0.15,
      });
    }
  }

  return exceptions;
}

function buildConfidenceScore(requirements: RequirementEvaluation[], exceptions: DetectedException[]) {
  const dueRequirements = requirements.filter((item) => item.status !== "not_required_yet");
  const matchedCount = dueRequirements.filter((item) => item.status === "matched").length;
  const baseScore = dueRequirements.length === 0 ? 0.7 : matchedCount / dueRequirements.length;
  const penalty = exceptions.reduce((total, exception) => {
    if (exception.severity === "critical") return total + 0.2;
    if (exception.severity === "high") return total + 0.12;
    if (exception.severity === "medium") return total + 0.06;
    return total + 0.03;
  }, 0);

  return Math.max(0.45, Math.min(0.98, Number((baseScore - penalty).toFixed(2))));
}

function buildStatus(
  packet: ShipmentPacket,
  requirements: RequirementEvaluation[],
  exceptions: DetectedException[],
  confidenceScore: number,
): ReconciliationEvaluation["status"] {
  const dueRequirements = requirements.filter((item) => item.status !== "not_required_yet");
  const hasMissing = dueRequirements.some((item) => item.status === "missing");
  const hasRejected = dueRequirements.some((item) => item.status === "rejected");
  const hasBlockingException = exceptions.some((item) => item.blocking);

  if (hasRejected || hasBlockingException) {
    return "blocked";
  }

  if (hasMissing) {
    return "pending_docs";
  }

  if (packet.lifecycle !== "delivered") {
    return "ready_for_review";
  }

  if (exceptions.length > 0 || confidenceScore < 0.92) {
    return "ready_for_review";
  }

  return "approved";
}

function mapControlTowerStatus(
  lifecycle: ShipmentPacket["lifecycle"],
  status: ReconciliationEvaluation["status"],
): ControlTowerStatus {
  if (status === "blocked") return "blocked";
  if (lifecycle === "in_transit") return "inTransit";
  if (status === "pending_docs") return "pendingDocs";
  if (status === "ready_for_review") return "needsReview";
  return "ready";
}

function buildSummary(
  packet: ShipmentPacket,
  requirements: RequirementEvaluation[],
  exceptions: DetectedException[],
  status: ReconciliationEvaluation["status"],
  locale: ReconciliationLocale,
): ShipmentSummary {
  const missingLabels = requirements
    .filter((item) => item.status === "missing")
    .map((item) => item.label.toLowerCase());
  const blockingException = exceptions.find((item) => item.blocking);
  const english = isEnglish(locale);

  return {
    happened:
      packet.lifecycle === "delivered"
        ? english
          ? `Route ${packet.shipmentReference} has a completion signal and ${packet.documents.length} linked evidence items.`
          : `La ruta ${packet.shipmentReference} ya tiene una señal de cierre y ${packet.documents.length} evidencias asociadas.`
        : english
          ? `Route ${packet.shipmentReference} is still in progress with ${packet.messages.length} WhatsApp messages captured.`
          : `La ruta ${packet.shipmentReference} sigue en curso con ${packet.messages.length} mensajes capturados desde WhatsApp.`,
    missing:
      missingLabels.length > 0
        ? english
          ? `Still missing ${missingLabels.join(", ")} before this route feels complete.`
          : `Todavía faltan ${missingLabels.join(", ")} para que esta ruta quede completa.`
        : english
          ? "There are no pending evidence requirements for this route."
          : "No hay requisitos pendientes de evidencia para esta ruta.",
    wrong: blockingException
      ? blockingException.summary
      : exceptions.length > 0
        ? exceptions[0].summary
        : english
          ? "No blocking discrepancies are detected right now."
          : "No se detectan discrepancias bloqueantes en este momento.",
    nextAction:
      status === "blocked"
        ? english
          ? "Pause here, review the route with ops, and fix the discrepancy before closing it."
          : "Pausa aquí, revisa la ruta con operaciones y corrige la discrepancia antes de cerrarla."
        : status === "pending_docs"
          ? english
            ? "Request the missing information from the carrier, ops team, or customer and review again."
            : "Solicita la información faltante al carrier, al equipo operativo o al cliente y revisa de nuevo."
          : status === "ready_for_review"
            ? english
              ? "Do a quick review of the route details and confirm that the signals line up."
              : "Haz una revisión rápida del detalle de la ruta y confirma que las señales sí cuadran."
            : english
              ? "This route looks aligned and ready for the next step."
              : "Esta ruta se ve alineada y lista para el siguiente paso.",
  };
}

/**
 * A recorded operator verdict outranks the computed state: approving marks the
 * route ready with an approved status, holding blocks it. The underlying
 * requirements and exceptions stay visible so the receipts remain inspectable.
 */
function applyOperatorDecision(
  evaluation: ReconciliationEvaluation,
  packet: ShipmentPacket,
  locale: ReconciliationLocale,
): ReconciliationEvaluation {
  const decision = packet.decision;

  if (!decision) {
    return evaluation;
  }

  const english = isEnglish(locale);

  if (decision.verdict === "approved") {
    return {
      ...evaluation,
      status: "approved",
      controlTowerStatus: "ready",
      summary: {
        ...evaluation.summary,
        nextAction: english
          ? "Carrier payment approved — ready to close out."
          : "Pago al carrier aprobado — lista para cerrar.",
      },
    };
  }

  return {
    ...evaluation,
    status: "blocked",
    controlTowerStatus: "blocked",
    summary: {
      ...evaluation.summary,
      nextAction:
        decision.note ??
        (english
          ? "Held by the team until the next review."
          : "En hold por decisión del equipo hasta nueva revisión."),
    },
  };
}

export function evaluateShipmentPacket(
  packet: ShipmentPacket,
  locale: ReconciliationLocale = "es-MX",
): ReconciliationEvaluation {
  const requirements = buildRequirements(packet, locale);
  const exceptions = buildExceptions(packet, requirements, locale);
  const confidenceScore = buildConfidenceScore(requirements, exceptions);
  const status = buildStatus(packet, requirements, exceptions, confidenceScore);

  const evaluation: ReconciliationEvaluation = {
    status,
    controlTowerStatus: mapControlTowerStatus(packet.lifecycle, status),
    confidenceScore,
    requirements,
    exceptions,
    summary: buildSummary(packet, requirements, exceptions, status, locale),
  };

  return applyOperatorDecision(evaluation, packet, locale);
}
