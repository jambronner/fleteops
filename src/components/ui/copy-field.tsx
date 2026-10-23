"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CopyFieldProps = {
  value: string;
  copyLabel: string;
};

export function CopyField({ value, copyLabel }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);

      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }

      resetTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions/insecure context): leave the value selectable.
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-tint px-3 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{value}</code>
      <button
        aria-label={copyLabel}
        className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-line bg-card text-muted transition hover:border-accent/40 hover:text-accent"
        onClick={() => {
          void handleCopy();
        }}
        title={copyLabel}
        type="button"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
