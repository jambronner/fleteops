import { enDictionary } from "@/lib/i18n/dictionaries/en";
import { esMxDictionary } from "@/lib/i18n/dictionaries/es-MX";

export const locales = ["en", "es-MX"] as const;

export type AppLocale = (typeof locales)[number];

type WidenDictionaryValues<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly WidenDictionaryValues<U>[]
    : T extends object
      ? { [K in keyof T]: WidenDictionaryValues<T[K]> }
      : T;

export type Dictionary = WidenDictionaryValues<typeof enDictionary>;

const dictionaries: Record<AppLocale, Dictionary> = {
  en: enDictionary,
  "es-MX": esMxDictionary,
};

export function getDictionary(locale: string): Dictionary {
  if (locale in dictionaries) {
    return dictionaries[locale as AppLocale];
  }

  return dictionaries["es-MX"];
}
