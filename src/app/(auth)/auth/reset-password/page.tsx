import Link from "next/link";
import { headers } from "next/headers";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getAppHomePathForHost } from "@/lib/app-routing";
import { getOptionalSession } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function ResetPasswordPage() {
  const session = await getOptionalSession();
  const { dictionary, locale } = await getRequestDictionary();
  const requestHeaders = await headers();
  const appHomePath = getAppHomePathForHost(requestHeaders.get("host"));
  const copy = dictionary.auth.recovery;

  return (
    <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-3xl bg-[linear-gradient(135deg,_#011a62_0%,_#1a3580_45%,_#3d5b8f_100%)] p-8 text-white shadow-xl md:p-10">
        <p className="font-mono text-[10px] uppercase tracking-widest text-blue-300/70">
          {dictionary.appName}
        </p>
        <h1 className="mt-4 font-display text-4xl font-bold leading-tight">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-blue-100/80">
          {copy.body}
        </p>
        {session ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-card/6 px-5 py-4 text-sm text-blue-100/75">
            {copy.signedIn.replace("{email}", session.user.email)}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-5">
        <ResetPasswordForm appHomePath={appHomePath} locale={locale} />
        <div className="rounded-3xl border border-line bg-card p-6 shadow-sm">
          <Link className="text-sm font-semibold text-accent" href="/login">
            {copy.back}
          </Link>
        </div>
      </section>
    </div>
  );
}
