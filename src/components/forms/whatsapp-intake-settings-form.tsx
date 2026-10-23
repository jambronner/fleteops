"use client";

import { Check, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

import { readActionResponse, type ActionResponse } from "@/lib/http/action-response";
import type { WhatsappIntakeChannel } from "@/lib/intake/channels";

type WhatsappIntakeSettingsCopy = {
  numberLabel: string;
  noNumber: string;
  readOnlyHint: string;
  edit: string;
  cancel: string;
  save: string;
  saving: string;
  saved: string;
  updateError: string;
  emptyTitle: string;
  emptyBody: string;
};

type WhatsappIntakeUpdateResponse = ActionResponse & {
  channel?: {
    phoneNumber?: string | null;
  };
};

type WhatsappIntakeSettingsFormProps = {
  channel: WhatsappIntakeChannel | null;
  canManage: boolean;
  copy: WhatsappIntakeSettingsCopy;
};

export function WhatsappIntakeSettingsForm({
  channel,
  canManage,
  copy,
}: WhatsappIntakeSettingsFormProps) {
  const router = useRouter();
  const [savedValue, setSavedValue] = useState(channel?.phoneNumber ?? "");
  const [draftValue, setDraftValue] = useState(channel?.phoneNumber ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, startTransition] = useTransition();

  if (!channel) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-blue-200 bg-tint p-4">
        <p className="text-sm font-semibold text-ink">{copy.emptyTitle}</p>
        <p className="mt-1 text-sm text-muted/75">{copy.emptyBody}</p>
      </div>
    );
  }

  const activeChannel = channel;

  function beginEditing() {
    setDraftValue(savedValue);
    setNotice("");
    setError("");
    setIsEditing(true);
  }

  function cancelEditing() {
    setDraftValue(savedValue);
    setError("");
    setIsEditing(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setNotice("");
    setError("");

    const response = await fetch("/api/settings/whatsapp-intake", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        channelId: activeChannel.id,
        phoneNumber: draftValue,
      }),
    });

    const result = (await readActionResponse(response, copy.updateError)) as WhatsappIntakeUpdateResponse;

    if (!response.ok || result.ok === false) {
      setError(result.error ?? copy.updateError);
      setIsSaving(false);
      return;
    }

    const nextValue = result.channel?.phoneNumber ?? draftValue;
    setSavedValue(nextValue);
    setDraftValue(nextValue);
    setNotice(copy.saved);
    setIsSaving(false);
    setIsEditing(false);

    startTransition(() => {
      router.refresh();
    });
  }

  const busy = isSaving || isRefreshing;

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-line bg-tint p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted/65">{copy.numberLabel}</p>
            <p className="mt-1 text-lg font-semibold text-ink">{savedValue || copy.noNumber}</p>
          </div>

          {canManage && !isEditing ? (
            <button
              aria-label={copy.edit}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card text-ink-2 shadow-sm transition hover:bg-surface"
              onClick={beginEditing}
              title={copy.edit}
              type="button"
            >
              <Pencil aria-hidden="true" size={16} />
            </button>
          ) : null}
        </div>

        {!canManage ? <p className="mt-3 text-sm text-muted/75">{copy.readOnlyHint}</p> : null}
      </div>

      {isEditing ? (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">{copy.numberLabel}</span>
            <input
              autoComplete="tel"
              autoFocus
              className="rounded-xl border border-line px-3 py-2.5 disabled:bg-tint disabled:text-muted/70"
              disabled={busy}
              inputMode="tel"
              onChange={(event) => setDraftValue(event.target.value)}
              placeholder="+12025550101"
              required
              type="tel"
              value={draftValue}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={busy}
              type="submit"
            >
              <Check aria-hidden="true" size={16} />
              {busy ? copy.saving : copy.save}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-ink-2 transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-70"
              disabled={busy}
              onClick={cancelEditing}
              type="button"
            >
              <X aria-hidden="true" size={16} />
              {copy.cancel}
            </button>
          </div>
        </form>
      ) : null}

      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
