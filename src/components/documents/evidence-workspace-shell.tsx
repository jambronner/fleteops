"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, History, Inbox, Upload } from "lucide-react";

export type EvidenceWorkspaceView = "triage" | "review" | "recent" | "upload";

type EvidenceWorkspaceShellProps = {
  locale: string;
  inboxCount: number;
  reviewCount: number;
  recentCount: number;
  canUpload: boolean;
  initialView?: EvidenceWorkspaceView;
  triage: ReactNode;
  review: ReactNode;
  recent: ReactNode;
  upload: ReactNode;
};

const views: Array<{
  id: EvidenceWorkspaceView;
  icon: typeof Inbox;
}> = [
  { id: "triage", icon: Inbox },
  { id: "review", icon: AlertTriangle },
  { id: "recent", icon: History },
  { id: "upload", icon: Upload },
];

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      triage: "Triage",
      review: "Intake review",
      recent: "Recent",
      upload: "Upload",
      workspaceLabel: "Evidence workspace views",
    };
  }

  return {
    triage: "Clasificar",
    review: "Revisión de entrada",
    recent: "Reciente",
    upload: "Cargar",
    workspaceLabel: "Vistas del workspace de evidencia",
  };
}

export function EvidenceWorkspaceShell({
  locale,
  inboxCount,
  reviewCount,
  recentCount,
  canUpload,
  initialView = "triage",
  triage,
  review,
  recent,
  upload,
}: EvidenceWorkspaceShellProps) {
  const copy = copyForLocale(locale);
  const availableViews = canUpload ? views : views.filter((view) => view.id !== "upload");
  const safeInitialView = availableViews.some((view) => view.id === initialView) ? initialView : "triage";
  const [activeView, setActiveView] = useState<EvidenceWorkspaceView>(safeInitialView);
  const tabRefs = useRef<Partial<Record<EvidenceWorkspaceView, HTMLButtonElement | null>>>({});

  useEffect(() => {
    function revealHashTarget() {
      if (!window.location.hash.startsWith("#review-task-")) {
        return;
      }

      setActiveView("review");
    }

    revealHashTarget();
    window.addEventListener("hashchange", revealHashTarget);
    return () => window.removeEventListener("hashchange", revealHashTarget);
  }, []);

  useEffect(() => {
    if (activeView !== "review" || !window.location.hash.startsWith("#review-task-")) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document.querySelector(window.location.hash)?.scrollIntoView({ block: "start" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeView]);

  const counts: Partial<Record<EvidenceWorkspaceView, number>> = {
    triage: inboxCount,
    review: reviewCount,
    recent: recentCount,
  };

  const panels: Record<EvidenceWorkspaceView, ReactNode> = {
    triage,
    review,
    recent,
    upload,
  };

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentView: EvidenceWorkspaceView) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const currentIndex = availableViews.findIndex((view) => view.id === currentView);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + availableViews.length) % availableViews.length;
    const nextView = availableViews[nextIndex]?.id ?? "triage";

    setActiveView(nextView);
    tabRefs.current[nextView]?.focus();
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-line/90 bg-card shadow-[0_22px_70px_-46px_rgba(1,26,98,0.55)]">
      <div className="flex-shrink-0 border-b border-line-2 bg-card px-2 py-2 sm:px-3">
        <div
          aria-label={copy.workspaceLabel}
          className="grid w-full grid-cols-2 gap-1 sm:flex sm:w-auto sm:items-center"
          role="tablist"
        >
          {availableViews.map((view) => {
            const Icon = view.icon;
            const selected = activeView === view.id;
            const count = counts[view.id];

            return (
              <button
                aria-controls={`evidence-panel-${view.id}`}
                aria-selected={selected}
                className={`inline-flex h-9 w-full items-center justify-start gap-2 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:w-auto ${
                  selected
                    ? "bg-accent text-accent-contrast shadow-sm shadow-accent/20"
                    : "text-muted hover:bg-tint hover:text-ink"
                } ${view.id === "upload" ? "sm:ml-2" : ""}`}
                id={`evidence-tab-${view.id}`}
                key={view.id}
                onClick={() => setActiveView(view.id)}
                onKeyDown={(event) => onTabKeyDown(event, view.id)}
                ref={(node) => {
                  tabRefs.current[view.id] = node;
                }}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {copy[view.id]}
                {typeof count === "number" ? (
                  <span
                    className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] tabular-nums ${
                      selected ? "bg-card/20 text-accent-contrast" : "bg-surface text-muted"
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div
        aria-labelledby={`evidence-tab-${activeView}`}
        className={`min-h-0 flex-1 ${activeView === "triage" ? "overflow-hidden" : "overflow-y-auto bg-tint/45 p-3 sm:p-4"}`}
        id={`evidence-panel-${activeView}`}
        role="tabpanel"
      >
        <div
          className={
            activeView === "triage"
              ? "h-full min-h-0"
              : activeView === "upload"
                ? "mx-auto w-full max-w-3xl"
                : "mx-auto w-full max-w-[1500px]"
          }
        >
          {panels[activeView]}
        </div>
      </div>
    </section>
  );
}
