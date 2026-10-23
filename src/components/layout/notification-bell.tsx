"use client";

import Link from "next/link";
import { Bell, FileText, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type NotificationItem = {
  id: string;
  title: string;
  detail: string | null;
  href: string;
  kind: "intake" | "whatsapp";
};

type NotificationBellProps = {
  items: NotificationItem[];
  locale: string;
};

export function NotificationBell({ items, locale }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const copy =
    locale === "en"
      ? { label: "Notifications", empty: "Nothing needs review.", viewAll: "Open dashboard" }
      : { label: "Notificaciones", empty: "Nada por revisar.", viewAll: "Abrir dashboard" };

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-label={copy.label}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-tint text-muted transition hover:border-accent/40 hover:text-accent"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Bell className="h-4 w-4" />
        {items.length > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 font-mono text-[10px] font-bold text-white">
            {items.length > 9 ? "9+" : items.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-[60] mt-2 w-80 overflow-hidden rounded-2xl border border-line bg-card shadow-xl">
          <div className="max-h-96 overflow-y-auto p-2">
            {items.length > 0 ? (
              items.map((item) => (
                <Link
                  className="flex gap-3 rounded-xl px-3 py-2.5 transition hover:bg-tint"
                  href={item.href as never}
                  key={item.id}
                  onClick={() => setOpen(false)}
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
                      item.kind === "whatsapp" ? "bg-sky-50 text-sky-600" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {item.kind === "whatsapp" ? (
                      <MessageCircle className="h-3.5 w-3.5" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                    {item.detail ? (
                      <span className="mt-0.5 block truncate text-xs text-muted/70">{item.detail}</span>
                    ) : null}
                  </span>
                </Link>
              ))
            ) : (
              <p className="px-3 py-5 text-center text-sm text-muted/70">{copy.empty}</p>
            )}
          </div>
          <Link
            className="block border-t border-line-2 px-4 py-2.5 text-center text-xs font-semibold text-accent transition hover:bg-tint"
            href="/dashboard"
            onClick={() => setOpen(false)}
          >
            {copy.viewAll}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
