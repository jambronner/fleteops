"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { readActionResponse } from "@/lib/http/action-response";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type SupabaseEmailAuthToolsProps = {
  appHomePath: string;
  locale: string;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      magicTitle: "Email link",
      magicBody: "Send a one-time sign-in link if you do not want to use your password right now.",
      resetTitle: "Forgot password?",
      resetBody: "Send a recovery email so you can choose a new password.",
      emailLabel: "Email",
      sendMagicLink: "Send magic link",
      sendResetLink: "Send reset link",
      sending: "Sending...",
      magicSent: "Check your email for the sign-in link.",
      resetSent: "Check your email for the password reset link.",
    };
  }

  return {
    magicTitle: "Liga por correo",
    magicBody: "Envía una liga de acceso de un solo uso si no quieres usar tu contraseña en este momento.",
    resetTitle: "¿Olvidaste tu contraseña?",
    resetBody: "Envía un correo de recuperación para elegir una contraseña nueva.",
    emailLabel: "Correo",
    sendMagicLink: "Enviar magic link",
    sendResetLink: "Enviar liga de recuperación",
    sending: "Enviando...",
    magicSent: "Revisa tu correo para abrir la liga de acceso.",
    resetSent: "Revisa tu correo para abrir la liga de recuperación.",
  };
}

export function SupabaseEmailAuthTools({ appHomePath, locale }: SupabaseEmailAuthToolsProps) {
  const copy = copyForLocale(locale);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [magicEmail, setMagicEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [magicStatus, setMagicStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resetStatus, setResetStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [magicError, setMagicError] = useState("");
  const [resetError, setResetError] = useState("");

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let active = true;

    const syncFromSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (!active || !data.session) {
        return;
      }

      if (pathname === "/login") {
        router.replace(appHomePath);
      }
    };

    void syncFromSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!active) {
        return;
      }

      if (event === "PASSWORD_RECOVERY") {
        router.replace("/auth/reset-password");
      }

      if (event === "SIGNED_IN" && pathname === "/login") {
        router.replace(appHomePath);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [appHomePath, pathname, router, supabase]);

  async function submitAction(args: { email: string; endpoint: string; mode: "magic" | "reset" }) {
    const email = args.email.trim();

    if (!email) {
      if (args.mode === "magic") {
        setMagicError(locale === "en" ? "Enter your email first." : "Primero escribe tu correo.");
        setMagicStatus("error");
      } else {
        setResetError(locale === "en" ? "Enter your email first." : "Primero escribe tu correo.");
        setResetStatus("error");
      }
      return;
    }

    if (args.mode === "magic") {
      setMagicStatus("sending");
      setMagicError("");
    } else {
      setResetStatus("sending");
      setResetError("");
    }

    try {
      const body = new URLSearchParams();
      body.set("email", email);

      const response = await fetch(args.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
      const fallbackError =
        args.mode === "magic"
          ? locale === "en"
            ? "Unable to send magic link."
            : "No se pudo enviar la liga de acceso."
          : locale === "en"
            ? "Unable to send reset email."
            : "No se pudo enviar el correo de recuperación.";

      const payload = await readActionResponse(response, fallbackError);

      if (!response.ok) {
        if (args.mode === "magic") {
          setMagicStatus("error");
          setMagicError(payload.error ?? fallbackError);
        } else {
          setResetStatus("error");
          setResetError(payload.error ?? fallbackError);
        }
        return;
      }

      if (args.mode === "magic") {
        setMagicStatus("sent");
      } else {
        setResetStatus("sent");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error.";
      if (args.mode === "magic") {
        setMagicStatus("error");
        setMagicError(message);
      } else {
        setResetStatus("error");
        setResetError(message);
      }
    }
  }

  return (
    <>
      <section className="rounded-3xl border border-line bg-card p-6 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-ink">
          {copy.magicTitle}
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted/75">{copy.magicBody}</p>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">{copy.emailLabel}</span>
            <input
              className="rounded-xl border border-line px-3 py-2.5"
              onChange={(event) => setMagicEmail(event.target.value)}
              type="email"
              value={magicEmail}
            />
          </label>
        </div>

        <button
          className="mt-5 rounded-xl border border-accent/20 bg-surface px-5 py-2.5 text-sm font-semibold text-ink-2 transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={magicStatus === "sending"}
          onClick={() => void submitAction({ email: magicEmail, endpoint: "/api/auth/supabase/magic-link", mode: "magic" })}
          type="button"
        >
          {magicStatus === "sending" ? copy.sending : copy.sendMagicLink}
        </button>

        {magicStatus === "sent" ? <p className="mt-4 text-sm text-emerald-700">{copy.magicSent}</p> : null}
        {magicError ? <p className="mt-4 text-sm text-rose-700">{magicError}</p> : null}
      </section>

      <section className="rounded-3xl border border-line bg-card p-6 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-ink">
          {copy.resetTitle}
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted/75">{copy.resetBody}</p>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">{copy.emailLabel}</span>
            <input
              className="rounded-xl border border-line px-3 py-2.5"
              onChange={(event) => setResetEmail(event.target.value)}
              type="email"
              value={resetEmail}
            />
          </label>
        </div>

        <button
          className="mt-5 rounded-xl border border-accent/20 bg-surface px-5 py-2.5 text-sm font-semibold text-ink-2 transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={resetStatus === "sending"}
          onClick={() => void submitAction({ email: resetEmail, endpoint: "/api/auth/supabase/reset-password", mode: "reset" })}
          type="button"
        >
          {resetStatus === "sending" ? copy.sending : copy.sendResetLink}
        </button>

        {resetStatus === "sent" ? <p className="mt-4 text-sm text-emerald-700">{copy.resetSent}</p> : null}
        {resetError ? <p className="mt-4 text-sm text-rose-700">{resetError}</p> : null}
      </section>
    </>
  );
}
