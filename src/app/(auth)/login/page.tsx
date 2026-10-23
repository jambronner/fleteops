import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { LoginCard } from "@/components/auth/login-card";
import { getAppHomePathForHost } from "@/lib/app-routing";
import { getOptionalSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getRequestDictionary } from "@/lib/i18n/server";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    status?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  db: "Database is not configured yet.",
  invalid: "The sign-in form was invalid.",
  "invite-required": "Ask a workspace admin to invite this email before creating an account.",
  "workspace-exists": "That workspace slug is already in use.",
  "not-found": "No active membership matched that email and workspace.",
};

const statusMessages: Record<string, string> = {
  "magic-link-sent": "Check your email for the sign-in link.",
  "check-email": "Check your email to confirm the account, then return here to sign in.",
};

// Personalized by session cookie: never statically prerender or cache.
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getOptionalSession();
  const requestHeaders = await headers();
  const appHomePath = getAppHomePathForHost(requestHeaders.get("host"));

  if (session) {
    redirect(appHomePath);
  }

  const { dictionary, locale } = await getRequestDictionary();
  const params = await searchParams;
  const errorMessage = params.error ? errorMessages[params.error] ?? "Unable to sign in." : null;
  const statusMessage = params.status ? statusMessages[params.status] ?? null : null;
  const usingSupabaseAuth = env.AUTH_PROVIDER === "supabase";

  if (usingSupabaseAuth) {
    return (
      <LoginCard
        appHomePath={appHomePath}
        errorMessage={errorMessage}
        googleClientId={env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}
        locale={locale}
        statusMessage={statusMessage}
      />
    );
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-3xl bg-[linear-gradient(135deg,_#011a62_0%,_#1a3580_45%,_#3d5b8f_100%)] p-8 text-white shadow-xl md:p-10">
        <p className="font-mono text-[10px] uppercase tracking-widest text-blue-300/70">
          {dictionary.appName}
        </p>
        <h1 className="mt-4 font-display text-4xl font-bold leading-tight">
          {dictionary.auth.title}
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-blue-100/80">{dictionary.auth.subtitle}</p>
        <div className="mt-8 rounded-2xl border border-white/10 bg-card/6 px-5 py-4 text-sm text-blue-100/75">
          <p>
            {dictionary.settings.languageTitle}: {dictionary.common.locales[locale] ?? locale}
          </p>
          <p className="mt-1">
            {locale === "en"
              ? "Sessions stay tied to a single workspace."
              : "Cada sesión queda ligada a un solo espacio de trabajo."}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        {errorMessage && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}

        <form
              action="/api/auth/local/session"
              className="rounded-3xl border border-line bg-card p-6 shadow-sm"
              method="post"
            >
              <input name="mode" type="hidden" value="create-workspace" />
              <h2 className="font-display text-xl font-semibold text-ink">
                {dictionary.auth.createWorkspaceTitle}
              </h2>
              <p className="mt-2 text-sm text-muted/75">{dictionary.auth.createWorkspaceBody}</p>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-ink">{dictionary.auth.fields.fullName}</span>
                  <input className="rounded-xl border border-line px-3 py-2.5" name="fullName" required />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-ink">{dictionary.auth.fields.email}</span>
                  <input className="rounded-xl border border-line px-3 py-2.5" name="email" required type="email" />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-ink">{dictionary.auth.fields.workspaceName}</span>
                  <input className="rounded-xl border border-line px-3 py-2.5" name="workspaceName" required />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-ink">{dictionary.auth.fields.workspaceSlug}</span>
                  <input className="rounded-xl border border-line px-3 py-2.5" name="workspaceSlug" required />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-ink">{dictionary.auth.fields.role}</span>
                    <select className="rounded-xl border border-line px-3 py-2.5" name="role">
                      <option value="admin">admin</option>
                      <option value="operator">operator</option>
                      <option value="finance">finance</option>
                      <option value="viewer">viewer</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-ink">{dictionary.settings.languageTitle}</span>
                    <select className="rounded-xl border border-line px-3 py-2.5" defaultValue={locale} name="locale">
                      <option value="es-MX">{dictionary.common.locales["es-MX"]}</option>
                      <option value="en">{dictionary.common.locales.en}</option>
                    </select>
                  </label>
                </div>
              </div>

              <button
                className="mt-5 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-lg shadow-accent/25 transition hover:bg-accent/90"
                type="submit"
              >
                {dictionary.common.actions.signIn}
              </button>
        </form>

        <form
              action="/api/auth/local/session"
              className="rounded-3xl border border-line bg-card p-6 shadow-sm"
              method="post"
            >
              <input name="mode" type="hidden" value="sign-in" />
              <h2 className="font-display text-xl font-semibold text-ink">
                {dictionary.auth.signInTitle}
              </h2>
              <p className="mt-2 text-sm text-muted/75">{dictionary.auth.signInBody}</p>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-ink">{dictionary.auth.fields.email}</span>
                  <input className="rounded-xl border border-line px-3 py-2.5" name="email" required type="email" />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-ink">{dictionary.auth.fields.workspaceSlug}</span>
                  <input className="rounded-xl border border-line px-3 py-2.5" name="workspaceSlug" required />
                </label>
              </div>

              <button
                className="mt-5 rounded-xl border border-accent/20 bg-surface px-5 py-2.5 text-sm font-semibold text-ink-2 transition hover:bg-surface-2"
                type="submit"
              >
                {dictionary.common.actions.signIn}
              </button>
        </form>
      </section>
    </div>
  );
}
