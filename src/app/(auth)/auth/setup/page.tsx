import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AccountSetupForm } from "@/components/auth/account-setup-form";
import { getAppHomePathForHost } from "@/lib/app-routing";
import { getOptionalSession } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function AuthSetupPage() {
  const session = await getOptionalSession();
  const requestHeaders = await headers();
  const { locale } = await getRequestDictionary();
  const appHomePath = getAppHomePathForHost(requestHeaders.get("host"));

  if (!session) {
    redirect("/auth/no-access");
  }

  return (
    <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-4 py-8">
      <section className="w-full max-w-[460px] rounded-[2rem] border border-surface-2 bg-card px-6 py-7 shadow-[0_24px_80px_rgba(1,26,98,0.12)] sm:px-8">
        <div className="flex justify-center">
          <Image alt="FleteOps" className="h-9 w-auto object-contain" height={121} priority src="/logo.svg" width={437} />
        </div>
        <AccountSetupForm
          appHomePath={appHomePath}
          email={session.user.email}
          initialFullName={session.user.fullName}
          locale={locale}
        />
      </section>
    </main>
  );
}
