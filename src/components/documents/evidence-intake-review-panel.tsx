"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, FileUp, Mail, MessageCircle, Route, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { RouteChangeDecisionCard } from "@/components/dashboard/route-change-decision-card";
import { useToast } from "@/components/ui/toast-provider";
import type { EvidenceIntakeReviewTask } from "@/lib/documents/repository";
import { getIntakeReviewTaskAction, getIntakeReviewTaskAnchor } from "@/lib/review-tasks/actions";
import { parseRouteChangeProposal } from "@/lib/review-tasks/route-change-proposal";
import { getReviewTaskSourceContext, type ReviewTaskSourceKind } from "@/lib/review-tasks/source-context";

type EvidenceIntakeReviewPanelProps = {
  locale: string;
  tasks: EvidenceIntakeReviewTask[];
  canManage: boolean;
  canDecideRouteChanges: boolean;
};

function recordValue(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function reviewTaskContext(metadata: Record<string, unknown> | null) {
  const attachment = recordValue(metadata?.attachment);
  const email = recordValue(metadata?.email);
  const classification = recordValue(metadata?.classification);
  const updates = recordValue(classification?.updates) ?? recordValue(metadata?.proposedUpdates);
  const target = recordValue(classification?.target);

  return {
    fileName: stringValue(attachment?.fileName),
    sender: stringValue(email?.fromAddress) ?? stringValue(email?.fromName),
    subject: stringValue(email?.subject) ?? stringValue(email?.forwardedSubject),
    action: stringValue(metadata?.action),
    rationale: stringValue(classification?.rationale),
    updateRows: Object.entries(updates ?? {})
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
      .map(([key, value]) => ({
        key,
        value: String(value),
      })),
    targetRows: Object.entries(target ?? {})
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
      .map(([key, value]) => ({
        key,
        value: String(value),
      })),
  };
}

function formatFieldLabel(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function truncateMiddle(value: string, maxLength = 64) {
  if (value.length <= maxLength) {
    return value;
  }

  const sliceLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, sliceLength)}...${value.slice(-sliceLength)}`;
}

function SourceIcon({ kind }: { kind: ReviewTaskSourceKind }) {
  if (kind === "whatsapp") {
    return <MessageCircle className="h-3 w-3" />;
  }

  if (kind === "upload" || kind === "manual" || kind === "import") {
    return <FileUp className="h-3 w-3" />;
  }

  return <Mail className="h-3 w-3" />;
}

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      title: "Needs intake review",
      subtitle: "Some incoming files could not be imported automatically.",
      dismiss: "Dismiss notice",
      dismissing: "Dismissing...",
      dismissedTitle: "Notice dismissed",
      dismissedBody: "The item was removed from the active review queue.",
      failedTitle: "Could not dismiss notice",
      failedBody: "Try again in a moment.",
      readOnly: "Only admins and operators can dismiss intake notices.",
      markReviewed: "Mark reviewed",
      markingReviewed: "Marking...",
      proposedUpdate: "Proposed update",
      targetSignal: "Target signal",
      aiRationale: "Why it needs review",
      openRoutes: "Open routes to apply manually",
      openReview: "Review details",
      source: "Source",
      from: "From",
      subject: "Subject",
      conversation: "Conversation",
      event: "Event",
    };
  }

  return {
    title: "Requiere revisión de entrada",
    subtitle: "Algunos archivos entrantes no se pudieron importar automáticamente.",
    dismiss: "Descartar aviso",
    dismissing: "Descartando...",
    dismissedTitle: "Aviso descartado",
    dismissedBody: "El elemento salió de la cola activa de revisión.",
    failedTitle: "No se pudo descartar el aviso",
    failedBody: "Intenta otra vez en un momento.",
    readOnly: "Solo admins y operadores pueden descartar avisos de entrada.",
    markReviewed: "Marcar revisado",
    markingReviewed: "Marcando...",
    proposedUpdate: "Cambio propuesto",
    targetSignal: "Señal de ruta",
    aiRationale: "Por qué requiere revisión",
    openRoutes: "Abrir rutas para aplicar manualmente",
    openReview: "Revisar detalles",
    source: "Fuente",
    from: "De",
    subject: "Asunto",
    conversation: "Conversación",
    event: "Evento",
  };
}

export function EvidenceIntakeReviewPanel({
  locale,
  tasks: initialTasks,
  canManage,
  canDecideRouteChanges,
}: EvidenceIntakeReviewPanelProps) {
  const copy = copyForLocale(locale);
  const router = useRouter();
  const { showToast } = useToast();
  const [tasks, setTasks] = useState(initialTasks);
  const [dismissingTaskId, setDismissingTaskId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the connected editing draft synchronized with refreshed external state.
    setTasks(initialTasks);
  }, [initialTasks]);

  if (tasks.length === 0) {
    return null;
  }

  async function dismissTask(taskId: string) {
    setDismissingTaskId(taskId);

    try {
      const response = await fetch(`/api/review-tasks/${taskId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? copy.failedBody);
      }

      setTasks((current) => current.filter((task) => task.id !== taskId));
      showToast({
        title: copy.dismissedTitle,
        message: copy.dismissedBody,
        variant: "success",
      });
      startTransition(() => router.refresh());
    } catch (error) {
      showToast({
        title: copy.failedTitle,
        message: error instanceof Error ? error.message : copy.failedBody,
        variant: "error",
      });
    } finally {
      setDismissingTaskId(null);
    }
  }

  return (
    <article className="rounded-2xl border border-amber-200 bg-amber-50/70 shadow-sm">
      <div className="flex items-center justify-between border-b border-amber-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-sm font-semibold text-ink">
              {copy.title}
            </h2>
            <p className="mt-0.5 text-xs text-amber-800">{copy.subtitle}</p>
            {!canManage ? <p className="mt-1 text-xs text-amber-800/80">{copy.readOnly}</p> : null}
          </div>
        </div>
        <span className="rounded-full bg-card px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2 p-4">
        {tasks.map((task) => {
          const routeChangeProposal = parseRouteChangeProposal(task.metadata);

          if (routeChangeProposal) {
            return (
              <RouteChangeDecisionCard
                canManage={canDecideRouteChanges}
                key={task.id}
                locale={locale}
                task={task}
              />
            );
          }

          const context = reviewTaskContext(task.metadata);
          const source = getReviewTaskSourceContext(task.metadata, locale);
          const action = getIntakeReviewTaskAction(task);
          const reviewHref = action.href.startsWith("/evidence#") && action.kind === "route_update"
            ? "/routes"
            : action.href;
          const reviewLabel = action.href.startsWith("/evidence#") && action.kind === "route_update"
            ? copy.openRoutes
            : action.label;
          const isDismissing = dismissingTaskId === task.id;

          return (
            <div
              className="scroll-mt-4 rounded-xl border border-amber-100 bg-card px-4 py-3"
              id={getIntakeReviewTaskAnchor(task.id)}
              key={task.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{task.title}</p>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-700">
                      {task.priority}
                    </span>
                  </div>
                  {task.details ? (
                    <p className="mt-2 text-sm leading-5 text-muted/80">{task.details}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted/65">
                    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-1 font-semibold text-ink">
                      <SourceIcon kind={source.kind} />
                      {copy.source}: {source.label}
                    </span>
                    {source.sender ? (
                      <span className="rounded-full bg-tint px-2 py-1" title={source.sender}>
                        {copy.from}: {truncateMiddle(source.sender)}
                      </span>
                    ) : null}
                    {source.subject ? (
                      <span className="rounded-full bg-tint px-2 py-1" title={source.subject}>
                        {copy.subject}: {truncateMiddle(source.subject)}
                      </span>
                    ) : null}
                    {source.conversationId ? (
                      <span className="rounded-full bg-tint px-2 py-1" title={source.conversationId}>
                        {copy.conversation}: {truncateMiddle(source.conversationId)}
                      </span>
                    ) : null}
                    {source.eventId ? (
                      <span className="rounded-full bg-tint px-2 py-1" title={source.eventId}>
                        {copy.event}: {truncateMiddle(source.eventId)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {context.action === "update_route" ? (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {context.updateRows.length > 0 ? (
                    <div className="rounded-xl bg-amber-50/70 px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase text-amber-800">
                        {copy.proposedUpdate}
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {context.updateRows.map((row) => (
                          <p className="text-xs leading-5 text-muted/80" key={row.key}>
                            <span className="font-semibold text-ink">{formatFieldLabel(row.key)}:</span>{" "}
                            {row.value}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {context.targetRows.length > 0 ? (
                    <div className="rounded-xl bg-tint px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase text-muted/75">
                        {copy.targetSignal}
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {context.targetRows.map((row) => (
                          <p className="text-xs leading-5 text-muted/80" key={row.key}>
                            <span className="font-semibold text-ink">{formatFieldLabel(row.key)}:</span>{" "}
                            {row.value}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {context.rationale ? (
                <div className="mt-3 rounded-xl bg-tint px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase text-muted/75">
                    {copy.aiRationale}
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-muted/80">{context.rationale}</p>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-muted/65">
                {context.fileName ? (
                  <span className="rounded-full bg-surface px-2 py-1">{context.fileName}</span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-accent-contrast shadow-sm shadow-accent/20 transition hover:bg-accent/90"
                  href={reviewHref}
                >
                  <Route className="h-3.5 w-3.5" />
                  {reviewLabel}
                  <ArrowUpRight className="h-3 w-3" />
                </Link>

                {canManage ? (
                  <button
                    className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-card px-3.5 py-2 text-xs font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isDismissing}
                    onClick={() => dismissTask(task.id)}
                    type="button"
                  >
                    {isDismissing ? (
                      <CheckCircle2 className="h-3.5 w-3.5 animate-pulse" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                    {isDismissing ? copy.markingReviewed : copy.markReviewed}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
