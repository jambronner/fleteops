"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type AccountSetupFormProps = {
  appHomePath: string;
  email: string;
  initialFullName: string;
  locale: string;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      title: "Finish your account",
      body: "Add your name and, if needed, set a password for this invited workspace account.",
      fullName: "Full name",
      password: "New password",
      passwordHint: "Leave blank if you signed in with OAuth or already set a password.",
      submit: "Continue to workspace",
      saving: "Saving...",
      tooShort: "Use at least 8 characters for a new password.",
      missingClient: "Supabase auth is not configured in this browser session.",
    };
  }

  return {
    title: "Termina tu cuenta",
    body: "Agrega tu nombre y, si hace falta, crea una contraseña para esta cuenta invitada.",
    fullName: "Nombre completo",
    password: "Nueva contraseña",
    passwordHint: "Déjala vacía si entraste con OAuth o ya tienes contraseña.",
    submit: "Continuar al espacio",
    saving: "Guardando...",
    tooShort: "Usa al menos 8 caracteres para una nueva contraseña.",
    missingClient: "Supabase auth no está configurado en esta sesión del navegador.",
  };
}

export function AccountSetupForm({ appHomePath, email, initialFullName, locale }: AccountSetupFormProps) {
  const copy = copyForLocale(locale);
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [fullName, setFullName] = useState(initialFullName);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!supabase) {
      setError(copy.missingClient);
      return;
    }

    if (password && password.length < 8) {
      setError(copy.tooShort);
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        full_name: fullName.trim() || email,
      },
      ...(password ? { password } : {}),
    });

    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }

    router.replace(appHomePath);
  }

  return (
    <form className="mt-7 grid gap-4" onSubmit={handleSubmit}>
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">{copy.title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{copy.body}</p>
      </div>
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium text-ink">{copy.fullName}</span>
        <input
          className="h-12 rounded-xl border border-line bg-tint px-3 text-ink"
          onChange={(event) => setFullName(event.target.value)}
          required
          value={fullName}
        />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium text-ink">{copy.password}</span>
        <input
          className="h-12 rounded-xl border border-line bg-tint px-3 text-ink"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
        <span className="text-xs text-muted/75">{copy.passwordHint}</span>
      </label>
      <button
        className="h-12 rounded-xl bg-accent text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 disabled:cursor-not-allowed disabled:opacity-70"
        disabled={saving}
        type="submit"
      >
        {saving ? copy.saving : copy.submit}
      </button>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </form>
  );
}
