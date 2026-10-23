"use client";

import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type UserMenuProps = {
  fullName: string;
  email: string;
  role: string;
  workspaceName: string;
  locale: string;
};

export function UserMenu({ fullName, email, role, workspaceName, locale }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const copy =
    locale === "en"
      ? { settings: "Settings", signOut: "Sign out", menuLabel: "Account menu" }
      : { settings: "Configuración", signOut: "Salir", menuLabel: "Menú de cuenta" };
  const initial = (fullName || email).charAt(0).toUpperCase();

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
        aria-label={copy.menuLabel}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-muted text-sm font-bold text-white transition hover:opacity-90"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {initial}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-[60] mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-card shadow-xl">
          <div className="border-b border-line-2 px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{fullName}</p>
            <p className="mt-0.5 truncate text-xs text-muted/70">{email}</p>
            <p className="mt-1 truncate text-[11px] text-muted/60">
              {workspaceName} · {role}
            </p>
          </div>
          <div className="p-1.5">
            <Link
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink transition hover:bg-tint"
              href="/settings"
              onClick={() => setOpen(false)}
            >
              <Settings className="h-4 w-4 text-muted/70" />
              {copy.settings}
            </Link>
            <form action="/api/auth/signout" method="post">
              <button
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink transition hover:bg-tint"
                type="submit"
              >
                <LogOut className="h-4 w-4 text-muted/70" />
                {copy.signOut}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
