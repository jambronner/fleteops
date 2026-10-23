"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type LocaleSettingsFormProps = {
  currentLocale: "en" | "es-MX";
  localeLabels: Record<string, string>;
  fieldLabel: string;
  saveLabel: string;
  savingLabel: string;
  successMessage: string;
  errorMessage: string;
};

export function LocaleSettingsForm({
  currentLocale,
  localeLabels,
  fieldLabel,
  saveLabel,
  savingLabel,
  successMessage,
  errorMessage,
}: LocaleSettingsFormProps) {
  const router = useRouter();
  const [locale, setLocale] = useState(currentLocale);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");

    const response = await fetch("/api/settings/preferences", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ locale }),
    });

    if (!response.ok) {
      setError(errorMessage);
      return;
    }

    setNotice(successMessage);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium text-ink">{fieldLabel}</span>
        <select
          className="rounded-xl border border-line px-3 py-2.5"
          onChange={(event) => setLocale(event.target.value as "en" | "es-MX")}
          value={locale}
        >
          <option value="es-MX">{localeLabels["es-MX"] ?? "Español"}</option>
          <option value="en">{localeLabels.en ?? "English"}</option>
        </select>
      </label>

      <button
        className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isPending}
        type="submit"
      >
        {isPending ? savingLabel : saveLabel}
      </button>

      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-rose-700">{error}</p>}
    </form>
  );
}
