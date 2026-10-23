"use client";

import {
  Ban,
  CheckCircle2,
  CircleSlash,
  MessageCircle,
  RotateCcw,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast-provider";
import { getWhatsappParticipantDisplayName } from "@/lib/partners/display";
import type { WhatsappSourceRecord, WhatsappSourceReviewSnapshot } from "@/lib/whatsapp/sources";

type WhatsappSourcesDirectoryPanelProps = {
  locale: string;
  canManage: boolean;
  snapshot: WhatsappSourceReviewSnapshot;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      emptyTitle: "No decided WhatsApp sources yet",
      emptyBody: "Sources appear here after they are trusted, ignored, or blocked.",
      sourceStatus: {
        active: "Trusted",
        unclaimed: "Needs review",
        ignored: "Ignored",
        blocked: "Blocked",
      },
      metrics: {
        trusted: "Trusted",
        ignored: "Ignored",
        blocked: "Blocked",
        mapped: "Mapped",
      },
      actions: {
        ignore: "Ignore",
        block: "Block",
        reviewAgain: "Review again",
      },
      direct: "Direct chat",
      group: "Group",
      participants: "Participants",
      mapped: "Mapped",
      unmatched: "Unmatched",
      noParticipants: "No participants reported yet.",
      unknownName: "Unknown participant",
      sourceUpdated: "WhatsApp source updated.",
      movedToReview: "Source moved back to review.",
      updateError: "Unable to update WhatsApp source.",
    };
  }

  return {
    emptyTitle: "Aún no hay fuentes de WhatsApp decididas",
    emptyBody: "Las fuentes aparecen aquí después de confiar, ignorar o bloquear.",
    sourceStatus: {
      active: "Confiable",
      unclaimed: "Requiere revisión",
      ignored: "Ignorada",
      blocked: "Bloqueada",
    },
    metrics: {
      trusted: "Confiables",
      ignored: "Ignoradas",
      blocked: "Bloqueadas",
      mapped: "Mapeados",
    },
    actions: {
      ignore: "Ignorar",
      block: "Bloquear",
      reviewAgain: "Revisar otra vez",
    },
    direct: "Chat directo",
    group: "Grupo",
    participants: "Participantes",
    mapped: "Mapeado",
    unmatched: "Sin mapear",
    noParticipants: "Todavía no hay participantes reportados.",
    unknownName: "Participante desconocido",
    sourceUpdated: "Fuente de WhatsApp actualizada.",
    movedToReview: "Fuente devuelta a revisión.",
    updateError: "No se pudo actualizar la fuente de WhatsApp.",
  };
}

function statusClasses(status: WhatsappSourceRecord["status"]) {
  switch (status) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "blocked":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "ignored":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function actionButtonClasses(status: WhatsappSourceRecord["status"]) {
  if (status === "blocked") {
    return "border-rose-200 bg-card text-rose-600 hover:bg-rose-50";
  }

  if (status === "ignored") {
    return "border-slate-200 bg-card text-slate-600 hover:bg-slate-50";
  }

  return "border-line bg-card text-accent hover:bg-surface";
}

async function readError(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return String(payload.error ?? fallback);
  } catch {
    return fallback;
  }
}

export function WhatsappSourcesDirectoryPanel({
  locale,
  canManage,
  snapshot,
}: WhatsappSourcesDirectoryPanelProps) {
  const copy = copyForLocale(locale);
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const sources = snapshot.directorySources;
  const trustedCount = sources.filter((source) => source.status === "active").length;
  const ignoredCount = sources.filter((source) => source.status === "ignored").length;
  const blockedCount = sources.filter((source) => source.status === "blocked").length;

  async function updateSourceStatus(sourceId: string, status: WhatsappSourceRecord["status"]) {
    setBusyKey(`${sourceId}:${status}`);

    try {
      const response = await fetch(`/api/whatsapp/sources/${sourceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, copy.updateError));
      }

      showToast({
        title: status === "unclaimed" ? copy.movedToReview : copy.sourceUpdated,
        variant: "success",
      });
      startTransition(() => router.refresh());
    } catch (error) {
      showToast({
        title: error instanceof Error ? error.message : copy.updateError,
        variant: "error",
      });
    } finally {
      setBusyKey(null);
    }
  }

  const metricItems = [
    { label: copy.metrics.trusted, value: trustedCount },
    { label: copy.metrics.ignored, value: ignoredCount },
    { label: copy.metrics.blocked, value: blockedCount },
    { label: copy.metrics.mapped, value: snapshot.directoryMetrics.mappedParticipants },
  ];

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {metricItems.map((item) => (
          <div key={item.label} className="rounded-xl border border-line bg-tint px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted/55">
              {item.label}
            </p>
            <p className="mt-1 text-xl font-bold text-ink">{item.value}</p>
          </div>
        ))}
      </div>

      {sources.length === 0 ? (
        <div className="rounded-xl border border-dashed border-blue-200 bg-tint px-5 py-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-card text-accent shadow-sm">
              <MessageCircle className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink">{copy.emptyTitle}</h3>
              <p className="mt-1 text-sm leading-6 text-muted/75">{copy.emptyBody}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => {
            const SourceIcon = source.isGroup ? UsersRound : MessageCircle;
            const actions =
              source.status === "active"
                ? [
                    { status: "ignored" as const, label: copy.actions.ignore, icon: CircleSlash },
                    { status: "blocked" as const, label: copy.actions.block, icon: Ban },
                  ]
                : source.status === "ignored"
                  ? [
                      { status: "unclaimed" as const, label: copy.actions.reviewAgain, icon: RotateCcw },
                      { status: "blocked" as const, label: copy.actions.block, icon: Ban },
                    ]
                  : source.status === "blocked"
                    ? [
                        { status: "unclaimed" as const, label: copy.actions.reviewAgain, icon: RotateCcw },
                        { status: "ignored" as const, label: copy.actions.ignore, icon: CircleSlash },
                      ]
                    : [];

            return (
              <section
                key={source.id}
                className="overflow-hidden rounded-xl border border-line bg-card shadow-sm"
              >
                <div className="flex flex-col gap-3 border-b border-line-2 bg-tint px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-card text-accent shadow-sm">
                        <SourceIcon className="h-4 w-4" />
                      </span>
                      <h3 className="min-w-0 truncate text-sm font-semibold text-ink">
                        {source.displayName ?? source.externalConversationId}
                      </h3>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClasses(source.status)}`}>
                        {copy.sourceStatus[source.status]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted/60">
                      {source.isGroup ? copy.group : copy.direct} · {source.externalConversationId}
                    </p>
                  </div>

                  {canManage && actions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {actions.map((action) => {
                        const Icon = action.icon;

                        return (
                          <button
                            key={action.status}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${actionButtonClasses(action.status)}`}
                            disabled={isPending || busyKey === `${source.id}:${action.status}`}
                            onClick={() => updateSourceStatus(source.id, action.status)}
                            type="button"
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {action.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted/55">
                      {copy.participants}
                    </p>
                    <p className="text-xs font-medium text-muted/55">
                      {source.mappedParticipantCount}/{source.participantCount}
                    </p>
                  </div>

                  {source.participants.length === 0 ? (
                    <p className="rounded-lg bg-tint px-4 py-3 text-sm text-muted/70">
                      {copy.noParticipants}
                    </p>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-2">
                      {source.participants.map((participant) => {
                        const phoneNumber = participant.phoneNumber ?? participant.participantKey;
                        const participantDisplayName = getWhatsappParticipantDisplayName({
                          unknownLabel: copy.unknownName,
                          participant,
                        });

                        return (
                          <div
                            key={participant.participantKey}
                            className="rounded-lg border border-line-2 bg-card px-3 py-2"
                          >
                            <div className="flex min-w-0 items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-ink">
                                  {participantDisplayName}
                                </p>
                                <p className="mt-0.5 truncate font-mono text-xs text-muted/65">
                                  {phoneNumber}
                                </p>
                              </div>
                              <span
                                className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  participant.contact
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-amber-50 text-amber-700"
                                }`}
                              >
                                {participant.contact ? <CheckCircle2 className="h-3 w-3" /> : null}
                                {participant.contact ? copy.mapped : copy.unmatched}
                              </span>
                            </div>
                            {participant.contact ? (
                              <p className="mt-1 truncate text-xs text-emerald-800/70">
                                {[participant.contact.label, participant.contact.organizationName]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
