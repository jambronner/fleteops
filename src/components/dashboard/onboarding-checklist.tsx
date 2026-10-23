"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Circle, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { OnboardingChecklist, OnboardingStepId } from "@/lib/onboarding/checklist";
import { createDismissController, type DismissRequestState } from "@/lib/onboarding/dismiss-state";

type OnboardingChecklistProps = {
  locale: string;
  steps: Array<{ id: OnboardingStepId; done: boolean }>;
  completed: number;
  total: number;
};

type OnboardingChecklistAction = () => Promise<unknown> | null | undefined;

type OnboardingChecklistPresentationProps = {
  checklist: OnboardingChecklist;
  locale: string;
  requestState: DismissRequestState;
  onDismiss: OnboardingChecklistAction;
  onRetry: OnboardingChecklistAction;
};

const stepHrefs: Record<OnboardingStepId, string> = {
  channel: "/settings",
  route: "/routes",
  evidence: "/evidence",
  team: "/settings",
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      title: "Getting started",
      progress: (completed: number, total: number) => `${completed} of ${total}`,
      dismiss: "Hide checklist",
      failure: "We couldn't hide the checklist.",
      retry: "Try again",
      retrying: "Trying again…",
      steps: {
        channel: "Connect WhatsApp or email",
        route: "Create or import the first route",
        evidence: "Link the first evidence",
        team: "Invite your team",
      } satisfies Record<OnboardingStepId, string>,
    };
  }

  return {
    title: "Primeros pasos",
    progress: (completed: number, total: number) => `${completed} de ${total}`,
    dismiss: "Ocultar lista",
    failure: "No pudimos ocultar la lista.",
    retry: "Intentar de nuevo",
    retrying: "Intentando de nuevo…",
    steps: {
      channel: "Conecta WhatsApp o correo",
      route: "Crea o importa la primera ruta",
      evidence: "Liga la primera evidencia",
      team: "Invita a tu equipo",
    } satisfies Record<OnboardingStepId, string>,
  };
}

export function OnboardingChecklistPresentation({
  checklist,
  locale,
  requestState,
  onDismiss,
  onRetry,
}: OnboardingChecklistPresentationProps) {
  const copy = copyForLocale(locale);
  const { steps, completed, total } = checklist;
  const retryPending = requestState.status === "pending" && requestState.retry;
  const failureVisible = requestState.status === "failure" || retryPending;
  const dismissPending = requestState.status === "pending";

  if (requestState.status === "success") {
    return null;
  }

  return (
    <section className="flex-shrink-0 rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-sm font-semibold text-ink">{copy.title}</h2>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted">
          {copy.progress(completed, total)}
        </span>
        <div className="h-1.5 max-w-40 flex-1 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${Math.round((completed / total) * 100)}%` }}
          />
        </div>
        <button
          aria-label={copy.dismiss}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-muted/50 transition hover:bg-surface hover:text-muted"
          disabled={dismissPending}
          onClick={() => {
            void onDismiss();
          }}
          title={copy.dismiss}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step) =>
          step.done ? (
            <div
              className="flex items-center gap-2.5 rounded-xl border border-line-2 bg-tint px-3 py-2.5"
              key={step.id}
            >
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
              <span className="truncate text-sm text-muted/70">{copy.steps[step.id]}</span>
            </div>
          ) : (
            <Link
              className="group flex items-center gap-2.5 rounded-xl border border-line bg-card px-3 py-2.5 transition hover:border-accent/40 hover:shadow-sm"
              href={stepHrefs[step.id] as never}
              key={step.id}
            >
              <Circle className="h-4 w-4 flex-shrink-0 text-muted/40" />
              <span className="truncate text-sm font-medium text-ink">{copy.steps[step.id]}</span>
              <ArrowUpRight className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-muted/30 transition group-hover:text-accent" />
            </Link>
          ),
        )}
      </div>

      {failureVisible ? (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800" role="alert">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{copy.failure}</p>
            {retryPending ? <p className="mt-0.5 text-xs text-red-700">{copy.retrying}</p> : null}
          </div>
          {requestState.status === "failure" && requestState.retry ? (
            <button
              className="flex-shrink-0 rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={Boolean(retryPending)}
              onClick={() => {
                void onRetry();
              }}
              type="button"
            >
              {copy.retry}
            </button>
          ) : retryPending ? (
            <button
              className="flex-shrink-0 rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled
              type="button"
            >
              {copy.retry}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function OnboardingChecklist({ locale, steps, completed, total }: OnboardingChecklistProps) {
  const [requestState, setRequestState] = useState<DismissRequestState>({ status: "idle" });
  const controller = useMemo(
    () =>
      createDismissController({
        request: () => fetch("/api/onboarding/dismiss", { method: "POST" }),
        onStateChange: setRequestState,
      }),
    [],
  );

  return (
    <OnboardingChecklistPresentation
      checklist={{ steps, completed, total }}
      locale={locale}
      onDismiss={controller.dismiss}
      onRetry={controller.retry}
      requestState={requestState}
    />
  );
}
