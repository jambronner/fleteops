"use client";

import { useId } from "react";
import { Paperclip, RefreshCcw } from "lucide-react";

type FilePickerInputProps = {
  accept?: string;
  disabled?: boolean;
  file: File | null;
  fileDisplayName?: string | null;
  locale: string;
  onFileChange: (file: File | null) => void;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      choose: "Choose file",
      replace: "Change",
      empty: "No file selected",
    };
  }

  return {
    choose: "Elegir archivo",
    replace: "Cambiar",
    empty: "Ningún archivo seleccionado",
  };
}

export function FilePickerInput({ accept, disabled = false, file, fileDisplayName = null, locale, onFileChange }: FilePickerInputProps) {
  const inputId = useId();
  const copy = copyForLocale(locale);
  const displayName = file?.name ?? fileDisplayName;

  return (
    <div className="flex min-h-[52px] min-w-0 max-w-full flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-3 py-2.5 sm:flex-nowrap">
      <input
        accept={accept}
        className="sr-only"
        disabled={disabled}
        id={inputId}
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        type="file"
      />

      <label
        className="inline-flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-accent transition hover:bg-surface disabled:cursor-not-allowed"
        htmlFor={inputId}
      >
        {displayName ? <RefreshCcw className="h-3.5 w-3.5" /> : <Paperclip className="h-3.5 w-3.5" />}
        {displayName ? copy.replace : copy.choose}
      </label>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${displayName ? "font-medium text-ink" : "text-muted/60"}`}>
          {displayName ?? copy.empty}
        </p>
      </div>
    </div>
  );
}
