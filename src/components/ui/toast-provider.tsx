"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "info";

type ToastInput = {
  title: string;
  message?: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastRecord = ToastInput & {
  id: string;
  variant: ToastVariant;
  durationMs: number;
};

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function iconForVariant(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return CheckCircle2;
    case "error":
      return AlertCircle;
    default:
      return Info;
  }
}

function toneClassesForVariant(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return {
        container: "border-emerald-200 bg-emerald-50/95 text-emerald-900 shadow-emerald-500/10",
        icon: "bg-card text-emerald-600",
        close: "text-emerald-700 hover:bg-emerald-100",
      };
    case "error":
      return {
        container: "border-rose-200 bg-rose-50/95 text-rose-900 shadow-rose-500/10",
        icon: "bg-card text-rose-600",
        close: "text-rose-700 hover:bg-rose-100",
      };
    default:
      return {
        container: "border-blue-200 bg-card/95 text-ink shadow-ink/10",
        icon: "bg-surface text-accent",
        close: "text-muted hover:bg-surface",
      };
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((toast: ToastInput) => {
    const record: ToastRecord = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: toast.title,
      message: toast.message,
      variant: toast.variant ?? "info",
      durationMs: toast.durationMs ?? (toast.variant === "error" ? 6500 : 4200),
    };

    setToasts((current) => [...current.slice(-3), record]);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        dismissToast(toast.id);
      }, toast.durationMs),
    );

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [dismissToast, toasts]);

  const value = useMemo(
    () => ({
      showToast,
      dismissToast,
    }),
    [dismissToast, showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        aria-atomic="false"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-[80] flex justify-center px-4 sm:top-5 sm:justify-end sm:px-6"
      >
        <div className="flex w-full max-w-md flex-col gap-3">
          {toasts.map((toast) => {
            const Icon = iconForVariant(toast.variant);
            const tone = toneClassesForVariant(toast.variant);

            return (
              <div
                key={toast.id}
                role={toast.variant === "error" ? "alert" : "status"}
                className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-sm transition ${tone.container}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${tone.icon}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{toast.title}</p>
                    {toast.message ? <p className="mt-1 text-sm leading-5 opacity-85">{toast.message}</p> : null}
                  </div>

                  <button
                    aria-label="Dismiss notification"
                    className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition ${tone.close}`}
                    onClick={() => dismissToast(toast.id)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider.");
  }

  return context;
}
