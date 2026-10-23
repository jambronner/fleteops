"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

type ResizableSplitProps = {
  storageKey: string;
  defaultSideWidth?: number;
  minSideWidth?: number;
  maxSideWidth?: number;
  collapsible?: boolean;
  collapseLabel?: string;
  expandLabel?: string;
  collapsedSummary?: ReactNode;
  main: ReactNode;
  side: ReactNode;
};

// Collapse only exists on desktop; on mobile the panes stack and main always
// shows. Tracking the breakpoint lets us fully unmount `main` when collapsed
// (so e.g. its keyboard shortcuts cannot fire invisibly) without losing it
// on small screens.
const desktopQuery = "(min-width: 80rem)";

function subscribeToDesktop(onChange: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getIsDesktop() {
  return window.matchMedia(desktopQuery).matches;
}

function getIsDesktopServer() {
  return true;
}

export function ResizableSplit({
  storageKey,
  defaultSideWidth = 340,
  minSideWidth = 280,
  maxSideWidth = 560,
  collapsible = false,
  collapseLabel = "Collapse",
  expandLabel = "Expand",
  collapsedSummary,
  main,
  side,
}: ResizableSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sideWidth, setSideWidth] = useState(defaultSideWidth);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const isDesktop = useSyncExternalStore(subscribeToDesktop, getIsDesktop, getIsDesktopServer);

  const clamp = useCallback(
    (value: number) => Math.min(maxSideWidth, Math.max(minSideWidth, Math.round(value))),
    [minSideWidth, maxSideWidth],
  );

  useEffect(() => {
    const storedWidth = Number(window.localStorage.getItem(`split:${storageKey}`));

    if (Number.isFinite(storedWidth) && storedWidth > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only read of a persisted preference; localStorage is unavailable during SSR
      setSideWidth(clamp(storedWidth));
    }

    if (window.localStorage.getItem(`split:${storageKey}:collapsed`) === "1") {
      setCollapsed(true);
    }
  }, [storageKey, clamp]);

  const persistWidth = useCallback(
    (value: number) => {
      window.localStorage.setItem(`split:${storageKey}`, String(value));
    },
    [storageKey],
  );

  function setCollapsedPersistent(value: boolean) {
    setCollapsed(value);
    window.localStorage.setItem(`split:${storageKey}:collapsed`, value ? "1" : "0");
  }

  function startDrag(event: React.PointerEvent) {
    event.preventDefault();
    setDragging(true);

    const container = containerRef.current;

    function onMove(moveEvent: PointerEvent) {
      if (!container) {
        return;
      }

      setSideWidth(clamp(container.getBoundingClientRect().right - moveEvent.clientX));
    }

    function onUp(upEvent: PointerEvent) {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      if (container) {
        persistWidth(clamp(container.getBoundingClientRect().right - upEvent.clientX));
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function onHandleKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? 24 : -24;
    setSideWidth((current) => {
      const next = clamp(current + delta);
      persistWidth(next);
      return next;
    });
  }

  function resetWidth() {
    setSideWidth(defaultSideWidth);
    persistWidth(defaultSideWidth);
  }

  const isCollapsed = collapsible && collapsed && isDesktop;

  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-4 xl:flex-row xl:gap-0 ${dragging ? "select-none" : ""}`}
      ref={containerRef}
      style={{ ["--split-side" as string]: `${sideWidth}px` }}
    >
      {isCollapsed ? (
        <button
          aria-expanded={false}
          aria-label={expandLabel}
          className="flex w-11 flex-shrink-0 flex-col items-center gap-2.5 rounded-2xl border border-line bg-card py-3 shadow-sm transition hover:border-accent/40"
          onClick={() => setCollapsedPersistent(false)}
          title={expandLabel}
          type="button"
        >
          <PanelLeftOpen className="h-4 w-4 text-muted" />
          {collapsedSummary}
        </button>
      ) : (
        <>
          <div className="min-h-0 min-w-0 flex-1 max-xl:min-h-[560px]">{main}</div>

          <div
            aria-orientation="vertical"
            className="group relative hidden w-4 flex-shrink-0 cursor-col-resize flex-col items-center outline-none xl:flex"
            onDoubleClick={resetWidth}
            onKeyDown={onHandleKeyDown}
            onPointerDown={startDrag}
            role="separator"
            tabIndex={0}
          >
            {collapsible ? (
              <button
                aria-label={collapseLabel}
                className="z-10 mt-1 flex h-6 w-6 flex-shrink-0 cursor-pointer items-center justify-center rounded-md border border-line bg-card text-muted/60 shadow-sm transition hover:border-accent/40 hover:text-accent"
                onClick={() => setCollapsedPersistent(true)}
                onPointerDown={(event) => event.stopPropagation()}
                title={collapseLabel}
                type="button"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <div
              className={`my-2 w-[3px] flex-1 rounded-full transition-colors ${
                dragging ? "bg-accent/60" : "bg-transparent group-hover:bg-accent/30 group-focus-visible:bg-accent/50"
              }`}
            />
          </div>
        </>
      )}

      <div
        className={
          isCollapsed
            ? "min-h-0 min-w-0 flex-1 pl-4"
            : "min-h-0 flex-shrink-0 max-xl:w-full xl:w-[var(--split-side)]"
        }
      >
        {side}
      </div>
    </div>
  );
}
