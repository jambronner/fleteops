"use client";

import { useState } from "react";

import { readActionResponse } from "@/lib/http/action-response";

type PasswordResetRequestProps = {
  locale: string;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      email: "Email",
      send: "Send recovery email",
      sending: "Sending...",
      sent:
        "If this email belongs to an invited account, a recovery link is on its way.",
      error: "We could not send a recovery email right now. Try again shortly.",
    };
  }

  return {
    email: "Correo",
    send: "Enviar correo de recuperación",
    sending: "Enviando...",
    sent:
      "Si este correo pertenece a una cuenta invitada, la liga de recuperación ya va en camino.",
    error:
      "No pudimos enviar el correo de recuperación. Intenta de nuevo en un momento.",
  };
}

export function PasswordResetRequest({
  locale,
}: PasswordResetRequestProps) {
  const copy = copyForLocale(locale);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");

    const body = new URLSearchParams({ email: email.trim() });
    const response = await fetch("/api/auth/supabase/reset-password", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }).catch(() => null);

    if (!response) {
      setStatus("error");
      return;
    }

    const payload = await readActionResponse(response, copy.error);
    setStatus(response.ok && payload.ok !== false ? "sent" : "error");
  }

  return (
    <form className="mt-3 grid gap-2 text-left" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="password-reset-email">
        {copy.email}
      </label>
      <input
        autoComplete="email"
        className="h-10 rounded-xl border border-line bg-card px-3 text-ink"
        id="password-reset-email"
        name="email"
        onChange={(event) => setEmail(event.target.value)}
        placeholder={copy.email}
        required
        type="email"
        value={email}
      />
      <button
        className="h-10 rounded-xl bg-ink px-3 text-sm font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-60"
        disabled={status === "sending" || status === "sent"}
        type="submit"
      >
        {status === "sending" ? copy.sending : copy.send}
      </button>
      {status === "sent" ? (
        <p className="text-xs leading-5 text-emerald-700" role="status">
          {copy.sent}
        </p>
      ) : null}
      {status === "error" ? (
        <p className="text-xs leading-5 text-rose-700" role="alert">
          {copy.error}
        </p>
      ) : null}
    </form>
  );
}
