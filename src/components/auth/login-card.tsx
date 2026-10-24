import Image from "next/image";

import { GoogleIdentitySignIn } from "@/components/auth/google-identity-sign-in";
import { PasswordResetRequest } from "@/components/auth/password-reset-request";

type LoginCardProps = {
  appHomePath: string;
  errorMessage: string | null;
  googleClientId?: string | null;
  locale: string;
  statusMessage?: string | null;
};

function copyForLocale(locale: string) {
  if (locale === "en") {
    return {
      eyebrow: "Invite-only workspace access",
      title: "Workspace sign in",
      subtitle: "Use the account your workspace admin invited. Access is granted by workspace membership, not by public signup.",
      email: "Email",
      password: "Password",
      fullName: "Full name",
      signIn: "Sign in",
      create: "Create invited account",
      createHint: "Use this only after an admin has invited your email.",
      forgot: "Forgot password?",
      magic: "Email me a sign-in link",
      divider: "or continue with",
      checkInvite: "Need access? Ask your workspace admin for an invite.",
    };
  }

  return {
    eyebrow: "Acceso por invitación",
    title: "Entrar al espacio",
    subtitle: "Usa la cuenta que invitó tu admin. El acceso depende de tu membresía, no de registro público.",
    email: "Correo",
    password: "Contraseña",
    fullName: "Nombre completo",
    signIn: "Entrar",
    create: "Crear cuenta invitada",
    createHint: "Úsalo solo después de que un admin invite tu correo.",
    forgot: "¿Olvidaste tu contraseña?",
    magic: "Enviarme una liga de acceso",
    divider: "o continúa con",
    checkInvite: "¿Necesitas acceso? Pide una invitación al admin del espacio.",
  };
}

export function LoginCard({ appHomePath, errorMessage, googleClientId, locale, statusMessage = null }: LoginCardProps) {
  const copy = copyForLocale(locale);

  return (
    <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-4 py-0">
      <section className="w-full max-w-[440px] rounded-[1.75rem] border border-surface-2 bg-card px-6 py-5 shadow-[0_24px_80px_rgba(1,26,98,0.12)] sm:px-8">
        <div className="flex flex-col items-center text-center">
          <Image
            alt="FleteOps"
            className="h-9 w-auto object-contain"
            height={121}
            priority
            src="/logo.svg"
            width={437}
          />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-accent">{copy.eyebrow}</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink">
            {copy.title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">{copy.subtitle}</p>
        </div>

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}
        {statusMessage ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {statusMessage}
          </div>
        ) : null}

        <form action="/api/auth/supabase/sign-in" className="mt-5 grid gap-3" method="post">
          <input name="next" type="hidden" value={appHomePath} />
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">{copy.email}</span>
            <input
              autoComplete="email"
              className="h-11 rounded-xl border border-line bg-tint px-3 text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
              name="email"
              required
              type="email"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">{copy.password}</span>
            <input
              autoComplete="current-password"
              className="h-11 rounded-xl border border-line bg-tint px-3 text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
              name="password"
              required
              type="password"
            />
          </label>
          <button
            className="mt-1 h-11 rounded-xl bg-accent text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent-strong focus:outline-none focus:ring-4 focus:ring-accent/20"
            type="submit"
          >
            {copy.signIn}
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3 text-sm">
          <details className="group max-w-full">
            <summary className="cursor-pointer list-none font-semibold text-accent hover:text-accent-strong">
              {copy.forgot}
            </summary>
            <PasswordResetRequest locale={locale} />
          </details>
          <details className="group max-w-full text-right">
            <summary className="cursor-pointer list-none font-semibold text-ink-2 hover:text-accent">
              {copy.magic}
            </summary>
            <form action="/api/auth/supabase/magic-link" className="mt-3 grid gap-2 text-left" method="post">
              <label className="sr-only" htmlFor="magic-link-email">
                {copy.email}
              </label>
              <input
                className="h-10 rounded-xl border border-line bg-card px-3 text-ink"
                id="magic-link-email"
                name="email"
                placeholder={copy.email}
                required
                type="email"
              />
              <button className="h-10 rounded-xl bg-ink px-3 text-sm font-semibold text-surface" type="submit">
                {copy.magic}
              </button>
            </form>
          </details>
        </div>

        {googleClientId ? (
          <div className="mt-5">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-surface-2" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted/70">{copy.divider}</span>
              <div className="h-px flex-1 bg-surface-2" />
            </div>
            <div className="mt-3 grid gap-3">
              <GoogleIdentitySignIn appHomePath={appHomePath} clientId={googleClientId} locale={locale} />
            </div>
          </div>
        ) : null}

        <details className="mt-5 rounded-2xl border border-surface-2 bg-tint px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink">{copy.create}</summary>
          <p className="mt-2 text-sm leading-6 text-muted">{copy.createHint}</p>
          <form action="/api/auth/supabase/sign-up" className="mt-4 grid gap-3" method="post">
            <input name="next" type="hidden" value={appHomePath} />
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.fullName}</span>
              <input className="h-11 rounded-xl border border-line px-3" name="fullName" required />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.email}</span>
              <input className="h-11 rounded-xl border border-line px-3" name="email" required type="email" />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-ink">{copy.password}</span>
              <input className="h-11 rounded-xl border border-line px-3" name="password" required type="password" />
            </label>
            <button className="h-11 rounded-xl bg-ink text-sm font-semibold text-surface" type="submit">
              {copy.create}
            </button>
          </form>
        </details>

        <p className="mt-4 text-center text-xs leading-5 text-muted/75">{copy.checkInvite}</p>
      </section>
    </main>
  );
}
