"use client";

import { useState } from "react";

import type { DigestFrequency } from "@/lib/digest/preferences";

type DigestSettingsFormProps = {
  currentFrequency: DigestFrequency;
  fieldLabel: string;
  optionLabels: Record<DigestFrequency, string>;
  saveLabel: string;
  savingLabel: string;
  successMessage: string;
  errorMessage: string;
};

export function DigestSettingsForm({
  currentFrequency,
  fieldLabel,
  optionLabels,
  saveLabel,
  savingLabel,
  successMessage,
  errorMessage,
}: DigestSettingsFormProps) {
  const [frequency, setFrequency] = useState(currentFrequency);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");
    setIsSaving(true);

    const response = await fetch("/api/settings/digest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ frequency }),
    }).catch(() => null);

    setIsSaving(false);

    if (!response || !response.ok) {
      setError(errorMessage);
      return;
    }

    setNotice(successMessage);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium text-ink">{fieldLabel}</span>
        <select
          className="rounded-xl border border-line px-3 py-2.5"
          onChange={(event) => setFrequency(event.target.value as DigestFrequency)}
          value={frequency}
        >
          <option value="daily">{optionLabels.daily}</option>
          <option value="weekly">{optionLabels.weekly}</option>
          <option value="off">{optionLabels.off}</option>
        </select>
      </label>

      <button
        className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSaving}
        type="submit"
      >
        {isSaving ? savingLabel : saveLabel}
      </button>

      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-rose-700">{error}</p>}
    </form>
  );
}
