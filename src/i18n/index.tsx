import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fr } from "./locales/fr";
import { en } from "./locales/en";
import { LOCALES, type Locale } from "../../shared/settings";

export { LOCALES };
export type { Locale };

type Dict = typeof fr;
type Ns = keyof Dict;
/** Every "namespace.key" path of the French reference dictionary. */
export type TKey = { [N in Ns]: `${N}.${keyof Dict[N] & string}` }[Ns];
/** Plural variants are stored as "key_one" / "key_other"; callers use the bare "key" with a `count` variable. */
type BaseKey<K extends string> = K extends `${infer B}_${"one" | "other"}` ? B : K;
export type TKeyInput = TKey | BaseKey<TKey>;
export type TVars = Record<string, string | number>;
export type TFn = (key: TKeyInput, vars?: TVars) => string;

const DICTS: Record<Locale, Record<string, Record<string, string>>> = { fr, en };

/** Maps a BCP 47 tag to a supported locale (anything that is not French falls back to English). */
export function toLocale(tag: string | null | undefined): Locale {
  return tag && tag.toLowerCase().startsWith("fr") ? "fr" : "en";
}

const STORAGE_KEY = "time-clock-pointeuse.locale";

/** Language explicitly chosen on this device (login screen switch, or the last account language), if any. */
export function savedLocale(): Locale | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "fr" || saved === "en") return saved;
  } catch {
    /* storage unavailable */
  }
  return null;
}

/** Locale to use before the account language is known: saved choice, then the browser language. */
export function detectLocale(): Locale {
  return savedLocale() ?? toLocale(typeof navigator !== "undefined" ? navigator.language : "en");
}

/** Language tag for `Intl` APIs. */
export function intlTag(locale: Locale): string {
  return locale === "fr" ? "fr-FR" : "en-GB";
}

function lookup(locale: Locale, key: string): string | undefined {
  const dot = key.indexOf(".");
  return DICTS[locale][key.slice(0, dot)]?.[key.slice(dot + 1)];
}

/** Pure translation function (usable outside React when the locale is known). */
export function translate(locale: Locale, key: TKeyInput, vars?: TVars): string {
  let template: string | undefined;
  if (vars && typeof vars.count === "number") {
    const form = vars.count === 1 || (locale === "fr" && vars.count === 0) ? "one" : "other";
    template = lookup(locale, `${key}_${form}`);
  }
  template ??= lookup(locale, key) ?? lookup("fr", key) ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

// Locale mirrored outside React so that plain helpers (date formatting, toasts, chart tooltips) can follow it.
let currentLocale: Locale = detectLocale();

/** Translate with the current UI locale, for non-React code. */
export function tr(key: TKeyInput, vars?: TVars): string {
  return translate(currentLocale, key, vars);
}

/** `persist: false` switches the language without remembering it on this device (e.g. instance default). */
type SetLocale = (l: Locale, opts?: { persist?: boolean }) => void;
type Ctx = { locale: Locale; setLocale: SetLocale; t: TFn };
const I18nContext = createContext<Ctx | null>(null);

/**
 * Provides the UI language. `locale` (optional) is the externally controlled value (e.g. the account
 * setting); changing it updates the internal state. Without it, the language is detected from the browser.
 */
export function I18nProvider({ locale: controlled, children }: { locale?: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(controlled ?? detectLocale);

  currentLocale = locale;

  useEffect(() => {
    if (controlled) setLocaleState(controlled);
  }, [controlled]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, "common.app_title");
  }, [locale]);

  const setLocale = useCallback<SetLocale>((l, opts) => {
    setLocaleState(l);
    if (opts?.persist === false) return;
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT/useLocale must be used inside <I18nProvider>");
  return ctx;
}

/** `const t = useT(); t("common.save")`, `t("dashboard.hello", { name })`, `t("common.days", { count: 3 })`. */
export function useT(): TFn {
  return useI18n().t;
}

export function useLocale(): { locale: Locale; setLocale: SetLocale } {
  const { locale, setLocale } = useI18n();
  return { locale, setLocale };
}
