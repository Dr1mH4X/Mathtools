import en from "./locales/en.json";
import zh from "./locales/zh.json";

export type MessageSchema = typeof en;
export type Locale = "en" | "zh";

const messages: Record<Locale, Record<string, unknown>> = { en, zh };

let currentLocale: Locale = getDefaultLocale();

const listeners: Array<() => void> = [];

function getDefaultLocale(): Locale {
  const saved = localStorage.getItem("mathtools-locale");
  if (saved === "en" || saved === "zh") {
    return saved;
  }
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith("zh")) {
    return "zh";
  }
  return "en";
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  localStorage.setItem("mathtools-locale", locale);
  document.documentElement.setAttribute("lang", locale);
  for (const fn of listeners) {
    fn();
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/**
 * Translate a dot-separated key, e.g. "revolution.title".
 * Supports simple {placeholder} interpolation via the optional `params` argument.
 */
export function t(
  key: string,
  params?: Record<string, string | number>,
): string;
export function t(key: string, fallback: string): string;
export function t(
  key: string,
  paramsOrFallback?: Record<string, string | number> | string,
): string {
  const parts = key.split(".");
  let node: unknown = messages[currentLocale];
  for (const part of parts) {
    if (
      node &&
      typeof node === "object" &&
      part in (node as Record<string, unknown>)
    ) {
      node = (node as Record<string, unknown>)[part];
    } else {
      node = undefined;
      break;
    }
  }

  if (typeof node !== "string") {
    // Try fallback locale
    let fallbackNode: unknown = messages["en"];
    for (const part of parts) {
      if (
        fallbackNode &&
        typeof fallbackNode === "object" &&
        part in (fallbackNode as Record<string, unknown>)
      ) {
        fallbackNode = (fallbackNode as Record<string, unknown>)[part];
      } else {
        fallbackNode = undefined;
        break;
      }
    }
    if (typeof fallbackNode === "string") {
      node = fallbackNode;
    } else if (typeof paramsOrFallback === "string") {
      return paramsOrFallback;
    } else {
      return key;
    }
  }

  let result = node as string;

  // Simple {placeholder} interpolation
  if (paramsOrFallback && typeof paramsOrFallback === "object") {
    for (const [k, v] of Object.entries(paramsOrFallback)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }

  return result;
}

export default { t, setLocale, getLocale, onLocaleChange };
