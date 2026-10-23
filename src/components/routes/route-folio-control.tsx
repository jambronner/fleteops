"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Stamp, Undo2 } from "lucide-react";

import type { FolioRecord } from "@/lib/operations/folio";

type RouteFolioControlProps = {
  shipmentId: string;
  canRecord: boolean;
  folio: FolioRecord | null;
  locale: string;
};

const copyForLocale = (locale: string) =>
  locale === "en"
    ? {
        markReceived: "Folio returned",
        waive: "Waive",
        undo: "Undo",
        error: "Could not save the folio status.",
      }
    : {
        markReceived: "Folio devuelto",
        waive: "Dispensar",
        undo: "Deshacer",
        error: "No se pudo guardar el estado del folio.",
      };

export function RouteFolioControl({ shipmentId, canRecord, folio, locale }: RouteFolioControlProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busy = isSaving || isPending;
  const copy = copyForLocale(locale);

  if (!canRecord) {
    return null;
  }

  async function submit(status: "received" | "waived" | "clear") {
    setError("");
    setIsSaving(true);

    const response = await fetch(`/api/shipments/${shipmentId}/folio`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);

    setIsSaving(false);

    if (!response || !response.ok) {
      setError(copy.error);
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {folio ? (
        <button
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-muted transition hover:text-ink disabled:opacity-60"
          disabled={busy}
          onClick={() => submit("clear")}
          type="button"
        >
          <Undo2 className="h-3 w-3" />
          {copy.undo}
        </button>
      ) : (
        <>
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-accent/20 px-2 py-1 text-[11px] font-semibold text-accent transition hover:border-accent/40 hover:bg-tint disabled:opacity-60"
            disabled={busy}
            onClick={() => submit("received")}
            type="button"
          >
            <Stamp className="h-3 w-3" />
            {copy.markReceived}
          </button>
          <button
            className="rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-muted transition hover:text-ink disabled:opacity-60"
            disabled={busy}
            onClick={() => submit("waived")}
            type="button"
          >
            {copy.waive}
          </button>
        </>
      )}
      {error ? <span className="text-[11px] text-rose-700">{error}</span> : null}
    </span>
  );
}
