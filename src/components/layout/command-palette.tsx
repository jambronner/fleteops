"use client";

import { FileText, Route, Search, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export type SearchResult = {
  id: string;
  label: string;
  detail: string | null;
  href: string;
  group: "routes" | "directory" | "documents";
};

type CommandPaletteProps = {
  locale: string;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      trigger: "Search…",
      placeholder: "Routes, clients, locations, files…",
      empty: "No matches.",
      groups: { routes: "Routes", directory: "Directory", documents: "Files" },
      actions: [
        { label: "New route", href: "/routes", icon: "route" as const },
        { label: "Upload evidence", href: "/evidence", icon: "upload" as const },
      ],
    };
  }

  return {
    trigger: "Buscar…",
    placeholder: "Rutas, clientes, ubicaciones, archivos…",
    empty: "Sin coincidencias.",
    groups: { routes: "Rutas", directory: "Directorio", documents: "Archivos" },
    actions: [
      { label: "Nueva ruta", href: "/routes", icon: "route" as const },
      { label: "Subir evidencia", href: "/evidence", icon: "upload" as const },
    ],
  };
}

function feedbackCopyForLocale(locale: string) {
  if (locale === "en") {
    return { empty: "No matches.", error: "Search is temporarily unavailable." };
  }

  return { empty: "Sin coincidencias.", error: "La búsqueda no está disponible temporalmente." };
}

const groupOrder = ["routes", "directory", "documents"] as const;

const subscribeNoop = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Increments the supplied sequence counter exactly once and returns the new
 * value. The returned request identity is captured by the live query effect
 * and used to guard every state mutation, so a response or failure from an
 * earlier query cannot mutate results, error, active index, or loading once a
 * later query has begun (including during its debounce window).
 */
export function beginCommandPaletteRequest(sequence: { current: number }): number {
  sequence.current += 1;
  return sequence.current;
}

/**
 * Requests command-palette search results for the supplied query. Rejects
 * (rather than returning an empty array) for a non-2xx response, a rejected
 * JSON parse, a missing or non-array `results` field, or a rejected fetch.
 */
export async function requestCommandPaletteResults(
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<SearchResult[]> {
  const response = await fetcher(`/api/search?q=${encodeURIComponent(query)}`);

  if (!response.ok) {
    throw new Error("Search is temporarily unavailable.");
  }

  let payload: { results?: SearchResult[] };

  try {
    payload = (await response.json()) as { results?: SearchResult[] };
  } catch {
    throw new Error("Search is temporarily unavailable.");
  }

  if (!Array.isArray(payload.results)) {
    throw new Error("Search is temporarily unavailable.");
  }

  return payload.results;
}

export function CommandPaletteSearchFeedback(props: {
  error: boolean;
  loading: boolean;
  locale: string;
}): React.ReactNode {
  const copy = feedbackCopyForLocale(props.locale);
  const className = "px-3 py-6 text-center text-sm text-muted/70";

  if (props.error) {
    return (
      <p className={className} role="alert">
        {copy.error}
      </p>
    );
  }

  if (props.loading) {
    return <p className={className}>…</p>;
  }

  return <p className={className}>{copy.empty}</p>;
}

export function CommandPalette({ locale }: CommandPaletteProps) {
  const copy = copyForLocale(locale);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(subscribeNoop, getClientSnapshot, getServerSnapshot);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  const flatItems = useMemo(() => {
    if (query.trim().length < 2) {
      return copy.actions.map((action) => ({
        id: action.href + action.label,
        label: action.label,
        detail: null,
        href: action.href,
        group: "actions" as const,
        icon: action.icon,
      }));
    }

    return groupOrder.flatMap((group) =>
      results
        .filter((result) => result.group === group)
        .map((result) => ({ ...result, icon: undefined })),
    );
  }, [copy.actions, query, results]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActiveIndex(0);
    setError(false);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }

      if (event.key === "Escape") {
        close();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // A new eligible query supersedes any in-flight request immediately. The
    // request identity is captured synchronously, before the short-query branch
    // and before scheduling the debounce, so a response or failure from an
    // earlier query is stale the moment this effect re-runs — including during
    // the new query's debounce window.
    const seq = beginCommandPaletteRequest(requestSeqRef);

    const trimmed = query.trim();

    if (trimmed.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear stale remote search results when the query becomes too short.
      setResults([]);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);

    debounceRef.current = setTimeout(async () => {
      try {
        const payload = await requestCommandPaletteResults(trimmed);

        if (seq !== requestSeqRef.current) {
          return;
        }

        setResults(payload);
        setActiveIndex(0);
      } catch {
        if (seq !== requestSeqRef.current) {
          return;
        }

        setResults([]);
        setError(true);
      } finally {
        if (seq !== requestSeqRef.current) {
          return;
        }

        setLoading(false);
      }
    }, 180);
  }, [query]);

  function navigate(href: string) {
    close();
    router.push(href as Parameters<typeof router.push>[0]);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, flatItems.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && flatItems[activeIndex]) {
      event.preventDefault();
      navigate(flatItems[activeIndex].href);
    }
  }

  let renderedGroup: string | null = null;

  return (
    <>
      <button
        className="hidden h-9 w-64 items-center gap-2 rounded-xl border border-line bg-tint px-3 text-sm text-muted/70 transition hover:border-accent/40 hover:bg-card md:flex"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Search className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="flex-1 text-left">{copy.trigger}</span>
        <kbd className="rounded border border-line bg-card px-1.5 font-mono text-[10px] text-muted/70">
          ⌘K
        </kbd>
      </button>
      <button
        aria-label={copy.trigger}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-tint text-muted transition hover:border-accent/40 hover:text-accent md:hidden"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Search className="h-4 w-4" />
      </button>

      {open && mounted ? (
        createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-ink/30 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-line-2 px-4">
              <Search className="h-4 w-4 flex-shrink-0 text-muted/60" />
              <input
                className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted/50"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={copy.placeholder}
                ref={inputRef}
                value={query}
              />
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {flatItems.length > 0 ? (
                flatItems.map((item, index) => {
                  const showGroupHeader = item.group !== "actions" && item.group !== renderedGroup;
                  renderedGroup = item.group;

                  return (
                    <div key={`${item.group}-${item.id}`}>
                      {showGroupHeader ? (
                        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted/50">
                          {copy.groups[item.group as keyof typeof copy.groups]}
                        </p>
                      ) : null}
                      <button
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                          index === activeIndex ? "bg-surface text-ink" : "text-ink hover:bg-tint"
                        }`}
                        onClick={() => navigate(item.href)}
                        onMouseEnter={() => setActiveIndex(index)}
                        type="button"
                      >
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-surface text-accent">
                          {item.group === "routes" || item.icon === "route" ? (
                            <Route className="h-3.5 w-3.5" />
                          ) : item.icon === "upload" ? (
                            <Upload className="h-3.5 w-3.5" />
                          ) : (
                            <FileText className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                        {item.detail ? (
                          <span className="flex-shrink-0 truncate text-xs text-muted/60">{item.detail}</span>
                        ) : null}
                      </button>
                    </div>
                  );
                })
              ) : (
                <CommandPaletteSearchFeedback error={error} loading={loading} locale={locale} />
              )}
            </div>
          </div>
        </div>,
        document.body,
        )
      ) : null}
    </>
  );
}
