import Image from "next/image";
import Link from "next/link";

import { getRequestDictionary } from "@/lib/i18n/server";

export default async function NoWorkspaceAccessPage() {
  const { locale } = await getRequestDictionary();
  const copy =
    locale === "en"
      ? {
          title: "No workspace access yet",
          body:
            "Your sign-in worked, but this email is not attached to an active FleteOps workspace. Ask a workspace admin to invite you, then open the invite email again.",
          back: "Back to login",
          signOut: "Sign out",
        }
      : {
          title: "Aún no tienes acceso",
          body:
            "Tu inicio de sesión funcionó, pero este correo no está ligado a un espacio activo de FleteOps. Pide una invitación al admin y vuelve a abrir el correo de invitación.",
          back: "Volver a login",
          signOut: "Salir",
        };

  return (
    <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-4 py-8">
      <section className="w-full max-w-[460px] rounded-[2rem] border border-surface-2 bg-card px-6 py-7 text-center shadow-[0_24px_80px_rgba(1,26,98,0.12)] sm:px-8">
        <Image alt="FleteOps AI" className="mx-auto h-9 w-auto object-contain" height={121} priority src="/logo.svg" width={437} />
        <h1 className="mt-5 font-display text-3xl font-bold text-ink">{copy.title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{copy.body}</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link className="rounded-xl border border-line px-5 py-2.5 text-sm font-semibold text-ink" href="/login">
            {copy.back}
          </Link>
          <form action="/api/auth/signout" method="post">
            <button className="w-full rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast" type="submit">
              {copy.signOut}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
