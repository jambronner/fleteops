"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type ResetPasswordFormProps = {
  appHomePath: string;
  locale: string;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      title: "Set a new password",
      body: "Choose a new password for your invited workspace account.",
      passwordLabel: "New password",
      confirmLabel: "Confirm password",
      submit: "Save new password",
      saving: "Saving...",
      mismatch: "The passwords do not match.",
      tooShort: "Use at least 8 characters.",
      sessionMissing: "This recovery link is no longer active. Request a new one from the login page.",
      success: "Password updated. Redirecting...",
    };
  }

  return {
    title: "Crear nueva contraseña",
    body: "Elige una nueva contraseña para tu cuenta invitada del espacio de trabajo.",
    passwordLabel: "Nueva contraseña",
    confirmLabel: "Confirmar contraseña",
    submit: "Guardar nueva contraseña",
    saving: "Guardando...",
    mismatch: "Las contraseñas no coinciden.",
    tooShort: "Usa al menos 8 caracteres.",
    sessionMissing: "Esta liga de recuperación ya no está activa. Solicita una nueva desde login.",
    success: "Contraseña actualizada. Redirigiendo...",
  };
}

export function ResetPasswordForm({ appHomePath, locale }: ResetPasswordFormProps) {
  const copy = copyForLocale(locale);
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const missingClient = !supabase;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let active = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (!active) {
        return;
      }

      if (data.session?.user) {
        setReady(true);
      } else {
        setError(copy.sessionMissing);
      }
    };

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) {
        return;
      }

      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session?.user) {
        setReady(true);
        setError("");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [copy.sessionMissing, supabase]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!supabase) {
      setError(copy.sessionMissing);
      return;
    }

    if (password.length < 8) {
      setError(copy.tooShort);
      return;
    }

    if (password !== confirmPassword) {
      setError(copy.mismatch);
      return;
    }

    setSaving(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }

    setSuccess(copy.success);
    setSaving(false);
    router.replace(appHomePath);
  }

  return (
    <section className="rounded-3xl border border-line bg-card p-6 shadow-sm">
      <h2 className="font-display text-xl font-semibold text-ink">
        {copy.title}
      </h2>
      <p className="mt-2 text-sm leading-7 text-muted/75">{copy.body}</p>

      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">{copy.passwordLabel}</span>
          <input
            className="rounded-xl border border-line px-3 py-2.5"
            disabled={missingClient || !ready || saving}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-ink">{copy.confirmLabel}</span>
          <input
            className="rounded-xl border border-line px-3 py-2.5"
            disabled={missingClient || !ready || saving}
            onChange={(event) => setConfirmPassword(event.target.value)}
            type="password"
            value={confirmPassword}
          />
        </label>

        <button
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={missingClient || !ready || saving}
          type="submit"
        >
          {saving ? copy.saving : copy.submit}
        </button>
      </form>

      {missingClient ? <p className="mt-4 text-sm text-rose-700">{copy.sessionMissing}</p> : null}
      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
      {success ? <p className="mt-4 text-sm text-emerald-700">{success}</p> : null}
    </section>
  );
}
