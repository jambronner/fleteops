"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, Search } from "lucide-react";

import { resolveSearchableSelectorKeydown } from "@/components/ui/searchable-selector-keyboard";

export type SearchableSelectOption = {
  value: string;
  label: string;
  description?: string | null;
};

type SearchableSelectInputProps = {
  locale: string;
  name: string;
  label: string;
  options: SearchableSelectOption[];
  defaultValue?: string;
  placeholder: string;
  emptyMessage: string;
  searchHint?: string;
  createLabel?: string;
  onCreateOption?: (query: string) => Promise<SearchableSelectOption>;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function fuzzyScore(option: SearchableSelectOption, query: string) {
  const normalizedQuery = normalize(query);
  const haystack = normalize(`${option.label} ${option.description ?? ""}`);

  if (!normalizedQuery) {
    return 0;
  }

  if (haystack === normalizedQuery) {
    return 100;
  }

  if (haystack.startsWith(normalizedQuery)) {
    return 80;
  }

  if (haystack.includes(normalizedQuery)) {
    return 60;
  }

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const matchedTokens = queryTokens.filter((token) => haystack.includes(token)).length;

  return matchedTokens > 0 ? matchedTokens * 10 : -1;
}

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      searching: "Saving and selecting...",
      searchPlaceholderPrefix: "Search",
      typeToCreate: "Type to search or create",
      createDefault: "Add new",
    };
  }

  return {
    searching: "Guardando y seleccionando...",
    searchPlaceholderPrefix: "Buscar",
    typeToCreate: "Escribe para buscar o crear",
    createDefault: "Agregar nuevo",
  };
}

export function SearchableSelectInput({
  locale,
  name,
  label,
  options,
  defaultValue = "",
  placeholder,
  emptyMessage,
  createLabel,
  onCreateOption,
}: SearchableSelectInputProps) {
  const reactId = useId();
  const copy = copyForLocale(locale);
  const blurTimeoutRef = useRef<number | null>(null);
  const [selectedValue, setSelectedValue] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isCreating, setIsCreating] = useState(false);
  const [localError, setLocalError] = useState("");
  const listboxId = `${reactId}-listbox`;

  const selectedOption = useMemo(
    () => options.find((option) => option.value === selectedValue) ?? null,
    [options, selectedValue],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the connected editing draft synchronized with refreshed external state.
    setSelectedValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the connected editing draft synchronized with refreshed external state.
    setQuery(selectedOption?.label ?? "");
  }, [selectedOption?.label]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const filteredOptions = useMemo(() => {
    if (!query.trim()) {
      return options.slice(0, 8);
    }

    return [...options]
      .map((option) => ({
        option,
        score: fuzzyScore(option, query),
      }))
      .filter((item) => item.score >= 0)
      .sort((left, right) => right.score - left.score || left.option.label.localeCompare(right.option.label))
      .slice(0, 8)
      .map((item) => item.option);
  }, [options, query]);

  const canCreate =
    Boolean(onCreateOption) &&
    Boolean(query.trim()) &&
    !options.some((option) => normalize(option.label) === normalize(query));
  const itemCount = filteredOptions.length + (canCreate ? 1 : 0);
  const activeOptionId = !isOpen || activeIndex < 0 || activeIndex >= itemCount
    ? undefined
    : `${reactId}-option-${activeIndex}`;

  function commitSelection(option: SearchableSelectOption) {
    setSelectedValue(option.value);
    setQuery(option.label);
    setLocalError("");
    setIsOpen(false);
    setActiveIndex(-1);
  }

  async function handleCreate() {
    if (!onCreateOption || !query.trim() || isCreating) {
      return;
    }

    setIsCreating(true);
    setLocalError("");

    try {
      const created = await onCreateOption(query.trim());
      commitSelection(created);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      setLocalError(error instanceof Error ? error.message : (locale === "en" ? "Unable to create option." : "No se pudo crear la opción."));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="grid gap-1.5 text-sm">
      <label className="font-medium text-ink" htmlFor={reactId}>{label}</label>
      <div className="relative">
        <input name={name} type="hidden" value={selectedValue} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/45" />
          <input
            autoComplete="off"
            className="w-full rounded-xl border border-line bg-card px-10 py-2.5 text-sm text-ink shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
            id={reactId}
            role="combobox"
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={isOpen}
            onBlur={() => {
              blurTimeoutRef.current = window.setTimeout(() => {
                setIsOpen(false);
                setActiveIndex(-1);
                if (selectedOption) {
                  setQuery(selectedOption.label);
                }
              }, 120);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedValue("");
              setLocalError("");
              setIsOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => {
              setIsOpen(true);
              setActiveIndex(-1);
            }}
            onKeyDown={(event) => {
              const decision = resolveSearchableSelectorKeydown({
                key: event.key,
                isOpen,
                activeIndex,
                itemCount,
              });

              if (!decision.handled) {
                return;
              }

              event.preventDefault();
              setActiveIndex(decision.nextActiveIndex);

              if (decision.action === "open") {
                setIsOpen(true);
              } else if (decision.action === "close") {
                setIsOpen(false);
              } else if (decision.action === "select") {
                if (canCreate && activeIndex === 0) {
                  void handleCreate();
                } else {
                  const optionIndex = activeIndex - (canCreate ? 1 : 0);
                  const option = filteredOptions[optionIndex];

                  if (option) {
                    commitSelection(option);
                  }
                }
              }
            }}
            placeholder={placeholder}
            value={query}
          />
        </div>

        {localError ? <p className="mt-1 text-xs text-rose-700">{localError}</p> : null}

        {isOpen ? (
          <div
            className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-line bg-card shadow-2xl shadow-ink/10"
            id={listboxId}
            role="listbox"
          >
            {canCreate ? (
              <button
                aria-selected={false}
                className={`flex w-full items-center justify-between gap-3 border-b border-line-2 bg-tint px-4 py-3 text-left text-sm transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-70 ${activeIndex === 0 ? "bg-surface" : ""}`}
                disabled={isCreating}
                id={`${reactId}-option-0`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void handleCreate()}
                role="option"
                type="button"
              >
                <span className="flex items-center gap-2 text-ink">
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin text-accent" /> : <Plus className="h-4 w-4 text-accent" />}
                  <span>
                    {(createLabel ?? copy.createDefault)}{" "}
                    <span className="font-semibold">&quot;{query.trim()}&quot;</span>
                  </span>
                </span>
                <span className="text-xs text-muted/70">
                  {isCreating ? copy.searching : copy.typeToCreate}
                </span>
              </button>
            ) : null}

            <div className="max-h-64 overflow-y-auto p-2">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option, index) => {
                  const isSelected = option.value === selectedValue;
                  const optionIndex = index + (canCreate ? 1 : 0);

                  return (
                    <button
                      key={option.value}
                      aria-selected={isSelected}
                      className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface ${activeIndex === optionIndex ? "bg-surface" : ""}`}
                      id={`${reactId}-option-${optionIndex}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => commitSelection(option)}
                      role="option"
                      type="button"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink">{option.label}</p>
                        {option.description ? (
                          <p className="mt-0.5 text-xs text-muted/70">{option.description}</p>
                        ) : null}
                      </div>
                      {isSelected ? <Check className="mt-0.5 h-4 w-4 text-accent" /> : null}
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-3 text-sm text-muted/75">{emptyMessage}</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
