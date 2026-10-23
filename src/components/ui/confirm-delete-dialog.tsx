"use client";

import { X } from "lucide-react";

type ConfirmDeleteDialogProps = {
  title: string;
  body: string;
  warning: string;
  recordLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  deletingLabel: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDeleteDialog({
  title,
  body,
  warning,
  recordLabel,
  confirmLabel,
  cancelLabel,
  deletingLabel,
  isDeleting,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/28 p-4 backdrop-blur-sm">
      <div
        aria-describedby="confirm-delete-description confirm-delete-warning"
        aria-labelledby="confirm-delete-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-2xl shadow-ink/15"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="confirm-delete-title" className="font-display text-lg font-semibold text-ink">
              {title}
            </p>
            <p id="confirm-delete-description" className="mt-2 text-sm text-muted/80">{body}</p>
          </div>
          <button
            aria-label={cancelLabel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted transition hover:bg-surface"
            disabled={isDeleting}
            onClick={onCancel}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-xl bg-tint px-4 py-3">
          <p className="text-sm font-semibold text-ink">{recordLabel}</p>
          <p id="confirm-delete-warning" className="mt-1 text-xs text-muted/75">{warning}</p>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isDeleting}
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isDeleting}
            onClick={onConfirm}
            type="button"
          >
            {isDeleting ? deletingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
