"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, PauseCircle, Undo2 } from "lucide-react";

import type { OperatorDecision } from "@/lib/reconciliation/types";

type RouteDecisionActionsCopy = {
  approve: string;
  hold: string;
  holdNotePlaceholder: string;
  confirmHold: string;
  cancel: string;
  undo: string;
  approvedReceipt: string;
  heldReceipt: string;
  approveBlocked: string;
  error: string;
};

type RouteDecisionActionsProps = {
  shipmentId: string;
  decision: OperatorDecision | null;
  canDecide: boolean;
  canApprove: boolean;
  approvalBlockedReason: string;
  copy: RouteDecisionActionsCopy;
  decidedAtLabel: string | null;
};

export function RouteDecisionActions({
  shipmentId,
  decision,
  canDecide,
  canApprove,
  approvalBlockedReason,
  copy,
  decidedAtLabel,
}: RouteDecisionActionsProps) {
  const router = useRouter();
  const [holdOpen, setHoldOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busy = isSaving || isPending;

  async function submit(verdict: "approved" | "hold" | "clear", verdictNote?: string) {
    setError("");
    setIsSaving(true);

    const response = await fetch(`/api/shipments/${shipmentId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verdict, ...(verdictNote?.trim() ? { note: verdictNote.trim() } : {}) }),
    }).catch(() => null);

    setIsSaving(false);

    if (!response || !response.ok) {
      setError(copy.error);
      return;
    }

    setHoldOpen(false);
    setNote("");
    startTransition(() => {
      router.refresh();
    });
  }

  if (decision) {
    const receipt = (decision.verdict === "approved" ? copy.approvedReceipt : copy.heldReceipt).replace(
      "{name}",
      decision.decidedByName ?? "—",
    );

    return (
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            decision.verdict === "approved"
              ? "bg-emerald-100 text-emerald-800"
              : "bg-rose-100 text-rose-800"
          }`}
        >
          {decision.verdict === "approved" ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <PauseCircle className="h-3.5 w-3.5" />
          )}
          {receipt}
          {decidedAtLabel ? <span className="font-normal opacity-75">· {decidedAtLabel}</span> : null}
        </span>
        {decision.note ? <span className="text-xs text-muted/80">{decision.note}</span> : null}
        {canDecide ? (
          <button
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted/70 transition hover:text-ink disabled:opacity-60"
            disabled={busy}
            onClick={() => submit("clear")}
            type="button"
          >
            <Undo2 className="h-3.5 w-3.5" />
            {copy.undo}
          </button>
        ) : null}
        {error && <p className="w-full text-xs text-rose-700">{error}</p>}
      </div>
    );
  }

  if (!canDecide) {
    return null;
  }

  return (
    <div className="mt-4">
      {holdOpen ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-9 w-64 max-w-full rounded-lg border border-line bg-card px-3 text-sm text-ink"
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder={copy.holdNotePlaceholder}
            value={note}
          />
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
            disabled={busy}
            onClick={() => submit("hold", note)}
            type="button"
          >
            <PauseCircle className="h-3.5 w-3.5" />
            {copy.confirmHold}
          </button>
          <button
            className="inline-flex h-9 items-center rounded-lg border border-line bg-card px-3 text-xs font-semibold text-muted transition hover:text-ink disabled:opacity-60"
            disabled={busy}
            onClick={() => {
              setHoldOpen(false);
              setNote("");
              setError("");
            }}
            type="button"
          >
            {copy.cancel}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-transparent bg-emerald-600 px-3.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700 disabled:hover:bg-emerald-50"
            aria-describedby={!canApprove ? "payment-approval-blocked" : undefined}
            disabled={busy || !canApprove}
            onClick={() => submit("approved")}
            title={!canApprove ? approvalBlockedReason : undefined}
            type="button"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {copy.approve}
          </button>
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3.5 text-xs font-semibold text-ink-2 transition hover:border-rose-200 hover:text-rose-700 disabled:opacity-60"
            disabled={busy}
            onClick={() => setHoldOpen(true)}
            type="button"
          >
            <PauseCircle className="h-3.5 w-3.5" />
            {copy.hold}
          </button>
          {!canApprove ? (
            <p
              className="w-full text-xs text-amber-800"
              id="payment-approval-blocked"
            >
              {approvalBlockedReason}
            </p>
          ) : null}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
