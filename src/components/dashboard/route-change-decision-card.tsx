"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Check, ExternalLink, Sparkles, X } from "lucide-react";

import { useToast } from "@/components/ui/toast-provider";
import {
  changedRouteDateFields,
  parseRouteChangeProposal,
} from "@/lib/review-tasks/route-change-proposal";
import {
  getReviewTaskSourceContext,
  type ReviewTaskSourceContext,
} from "@/lib/review-tasks/source-context";

type RouteChangeDecisionCardProps = {
  task: {
    id: string;
    title: string;
    metadata: Record<string, unknown> | null;
  };
  locale: string;
  canManage: boolean;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      badge: "AI change",
      approve: "Approve",
      approving: "Approving…",
      reject: "Reject",
      rejecting: "Rejecting…",
      openRoute: "Open route",
      source: "Source",
      noValue: "Not set",
      readOnly: "An admin or operator must decide this change.",
      approvedTitle: "Route updated",
      approvedBody: "The proposed values were applied and recorded in the audit log.",
      rejectedTitle: "Change rejected",
      rejectedBody: "The route stayed unchanged and the decision was recorded.",
      failedTitle: "Could not save decision",
      failedBody: "Review the route and try again.",
      fields: {
        pickupDate: "Pickup date",
        deliveryDateExpected: "Expected delivery",
        deliveryDateActual: "Actual delivery",
      },
    };
  }

  return {
    badge: "Cambio de IA",
    approve: "Aprobar",
    approving: "Aprobando…",
    reject: "Rechazar",
    rejecting: "Rechazando…",
    openRoute: "Abrir ruta",
    source: "Fuente",
    noValue: "Sin definir",
    readOnly: "Un admin u operador debe decidir este cambio.",
    approvedTitle: "Ruta actualizada",
    approvedBody: "Los valores propuestos se aplicaron y quedaron en la bitácora.",
    rejectedTitle: "Cambio rechazado",
    rejectedBody: "La ruta quedó igual y la decisión se registró.",
    failedTitle: "No se pudo guardar la decisión",
    failedBody: "Revisa la ruta e intenta de nuevo.",
    fields: {
      pickupDate: "Fecha de recolección",
      deliveryDateExpected: "Entrega esperada",
      deliveryDateActual: "Entrega real",
    },
  };
}

function formatDate(value: string | null, locale: string, fallback: string) {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function sourceLabel(source: ReviewTaskSourceContext) {
  return source.subject ?? source.sender ?? source.label;
}

export function RouteChangeDecisionCard({ task, locale, canManage }: RouteChangeDecisionCardProps) {
  const proposal = parseRouteChangeProposal(task.metadata);
  const copy = copyForLocale(locale);
  const router = useRouter();
  const { showToast } = useToast();
  const [pendingDecision, setPendingDecision] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  const [decided, setDecided] = useState(false);
  const [, startTransition] = useTransition();

  if (!proposal || decided) {
    return null;
  }

  const rows = changedRouteDateFields(proposal);
  const source = getReviewTaskSourceContext(task.metadata, locale);

  async function decide(decision: "approve" | "reject") {
    setPendingDecision(decision);
    setError("");

    try {
      const response = await fetch(`/api/review-tasks/${task.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? copy.failedBody);
      }

      setDecided(true);
      showToast({
        title: decision === "approve" ? copy.approvedTitle : copy.rejectedTitle,
        message: decision === "approve" ? copy.approvedBody : copy.rejectedBody,
        variant: "success",
      });
      startTransition(() => router.refresh());
    } catch (decisionError) {
      const message = decisionError instanceof Error ? decisionError.message : copy.failedBody;
      setError(message);
      showToast({ title: copy.failedTitle, message, variant: "error" });
    } finally {
      setPendingDecision(null);
    }
  }

  return (
    <section
      aria-labelledby={`route-change-${task.id}`}
      className="rounded-xl border border-l-[3px] border-line border-l-violet-400 bg-violet-50/40 px-4 py-3"
    >
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink" id={`route-change-${task.id}`}>
              {proposal.routeReference}
            </h3>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
              {copy.badge}
            </span>
            <span className="text-[11px] font-medium text-muted/60">
              {Math.round(proposal.confidence * 100)}%
            </span>
          </div>

          <div className="mt-2 grid gap-1.5">
            {rows.map((row) => (
              <div
                className="grid grid-cols-[minmax(105px,0.9fr)_1fr_auto_1fr] items-center gap-2 rounded-lg bg-card/85 px-3 py-2 text-xs"
                key={row.field}
              >
                <span className="font-medium text-muted/75">{copy.fields[row.field]}</span>
                <span className="truncate text-muted line-through decoration-muted/40">
                  {formatDate(row.current, locale, copy.noValue)}
                </span>
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-violet-500" />
                <span className="truncate font-semibold text-ink">
                  {formatDate(row.proposed, locale, copy.noValue)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted/65">
            <span className="max-w-full truncate">
              {copy.source}: {sourceLabel(source)}
            </span>
            <Link
              className="inline-flex items-center gap-1 font-semibold text-accent"
              href={`/routes/${proposal.routeResolution.shipmentId}`}
            >
              {copy.openRoute}
              <ExternalLink aria-hidden="true" className="h-3 w-3" />
            </Link>
          </div>

          {error ? (
            <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">
              {error}
            </p>
          ) : null}

          {canManage ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-contrast shadow-sm transition hover:bg-accent/90 disabled:cursor-wait disabled:opacity-60"
                disabled={Boolean(pendingDecision)}
                onClick={() => void decide("approve")}
                type="button"
              >
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                {pendingDecision === "approve" ? copy.approving : copy.approve}
              </button>
              <button
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3.5 py-2 text-xs font-semibold text-muted transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-wait disabled:opacity-60"
                disabled={Boolean(pendingDecision)}
                onClick={() => void decide("reject")}
                type="button"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
                {pendingDecision === "reject" ? copy.rejecting : copy.reject}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted/70">{copy.readOnly}</p>
          )}
        </div>
      </div>
    </section>
  );
}
