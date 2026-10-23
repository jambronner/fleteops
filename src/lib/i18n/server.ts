import { cookies } from "next/headers";

import { getOptionalSession, localeCookieName } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getDictionary, locales, type AppLocale } from "@/lib/i18n/config";

function isSupportedLocale(value: string | undefined | null): value is AppLocale {
  return Boolean(value && locales.includes(value as AppLocale));
}

export async function getRequestLocale() {
  const session = await getOptionalSession();

  if (isSupportedLocale(session?.tenant.locale)) {
    return session.tenant.locale;
  }

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(localeCookieName)?.value;

  if (isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }

  return isSupportedLocale(env.DEFAULT_LOCALE) ? env.DEFAULT_LOCALE : "es-MX";
}

export async function getRequestDictionary() {
  const locale = await getRequestLocale();

  return {
    locale,
    dictionary: getDictionary(locale),
  };
}
