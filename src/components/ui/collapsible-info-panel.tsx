"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

type CollapsibleInfoPanelProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  locale?: string;
  defaultOpen?: boolean;
  storageKey?: string;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      expand: "Show",
      collapse: "Hide",
    };
  }

  return {
    expand: "Mostrar",
    collapse: "Ocultar",
  };
}

export function CollapsibleInfoPanel({
  title,
  subtitle,
  icon,
  locale = "es-MX",
  defaultOpen = true,
  storageKey,
  className = "",
  contentClassName = "px-6 pb-6",
  children,
}: CollapsibleInfoPanelProps) {
  const copy = copyForLocale(locale);
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const savedValue = window.localStorage.getItem(storageKey);
      if (savedValue === "open") {
        setIsOpen(true);
        return;
      }

      if (savedValue === "closed") {
        setIsOpen(false);
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [defaultOpen, storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      return;
    }

    const panelStorageKey = storageKey;

    function openPanel(event: Event) {
      const detail = (event as CustomEvent<{ storageKey?: string }>).detail;

      if (detail?.storageKey !== panelStorageKey) {
        return;
      }

      setIsOpen(true);
      window.localStorage.setItem(panelStorageKey, "open");
    }

    window.addEventListener("fleteops:open-collapsible", openPanel);

    return () => {
      window.removeEventListener("fleteops:open-collapsible", openPanel);
    };
  }, [storageKey]);

  function togglePanel() {
    setIsOpen((current) => {
      const next = !current;

      if (storageKey && typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, next ? "open" : "closed");
      }

      return next;
    });
  }

  return (
    <article className={`min-w-0 overflow-hidden rounded-2xl border border-line bg-card shadow-sm ${className}`.trim()}>
      <button
        type="button"
        onClick={togglePanel}
        aria-expanded={isOpen}
        className="flex w-full min-w-0 items-start justify-between gap-4 px-4 py-5 text-left sm:px-6"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon ? <span className="text-accent">{icon}</span> : null}
            <h2 className="font-display text-xl font-semibold text-ink">
              {title}
            </h2>
          </div>
          {subtitle ? <p className="mt-2 text-sm text-muted/75">{subtitle}</p> : null}
        </div>

        <span className="inline-flex flex-shrink-0 items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-accent">
          {isOpen ? copy.collapse : copy.expand}
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </span>
      </button>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-90"
        }`}
      >
        <div className="min-w-0 overflow-hidden border-t border-line-2">
          <div className={`min-w-0 ${contentClassName}`.trim()}>{children}</div>
        </div>
      </div>
    </article>
  );
}
