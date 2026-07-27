export type Locale = "fr" | "en";

export const LOCALES: Locale[] = ["fr", "en"];

export const LOCALE_STORAGE_KEY = "powermap.locale.v1";

export function isLocale(v: unknown): v is Locale {
  return v === "fr" || v === "en";
}
