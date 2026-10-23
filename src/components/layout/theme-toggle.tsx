"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const subscribers = new Set<() => void>();

function subscribe(onChange: () => void) {
  subscribers.add(onChange);
  return () => {
    subscribers.delete(onChange);
  };
}

function getIsDark() {
  return document.documentElement.classList.contains("dark");
}

function getIsDarkServer() {
  return false;
}

type ThemeToggleProps = {
  locale: string;
};

export function ThemeToggle({ locale }: ThemeToggleProps) {
  const isDark = useSyncExternalStore(subscribe, getIsDark, getIsDarkServer);
  const label =
    locale === "en"
      ? isDark
        ? "Switch to light theme"
        : "Switch to dark theme"
      : isDark
        ? "Cambiar a tema claro"
        : "Cambiar a tema oscuro";

  function toggle() {
    const next = !getIsDark();
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("theme", next ? "dark" : "light");

    for (const notify of subscribers) {
      notify();
    }
  }

  return (
    <button
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-tint text-muted transition hover:border-accent/40 hover:text-accent"
      onClick={toggle}
      title={label}
      type="button"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
