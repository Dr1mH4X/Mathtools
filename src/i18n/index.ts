// ===================================================================
// i18n — Thin wrapper around i18next + react-i18next
//
// This module re-exports a `useTranslation` hook and utility helpers
// that match the signatures previously consumed by every component in
// the project, so **no existing import path needs to change**.
//
// Under the hood everything is now delegated to i18next.
// ===================================================================

import i18n from "./config";
import { useTranslation as useReactI18next } from "react-i18next";

export type { Locale } from "./config";

// Re-export the configured i18n instance for advanced use
export { default as i18n } from "./config";

/**
 * Normalise whatever language string i18next holds (e.g. "en-US",
 * "zh-CN", "zh-TW") into one of the two supported locale keys.
 */
function normalizeLocale(lng?: string): "en" | "zh" {
  return lng?.startsWith("zh") ? "zh" : "en";
}

/**
 * Stand-alone translate function (works outside React).
 *
 * Overloads kept for backward compatibility:
 *   t(key, params?)   — interpolate {placeholder} tokens
 *   t(key, fallback)  — return fallback string when key is missing
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
  if (typeof paramsOrFallback === "string") {
    // Fallback mode — use i18next defaultValue
    return i18n.t(key, { defaultValue: paramsOrFallback });
  }
  if (paramsOrFallback && typeof paramsOrFallback === "object") {
    return i18n.t(key, paramsOrFallback);
  }
  return i18n.t(key);
}

export function setLocale(locale: "en" | "zh"): void {
  i18n.changeLanguage(locale);
}

export function getLocale(): "en" | "zh" {
  return normalizeLocale(i18n.language);
}

/**
 * Subscribe to locale changes.
 * Returns an unsubscribe function (mirrors the old API).
 */
export function onLocaleChange(fn: () => void): () => void {
  const handler = () => fn();
  i18n.on("languageChanged", handler);
  return () => {
    i18n.off("languageChanged", handler);
  };
}

/**
 * React hook — drop-in replacement for the old `useTranslation`.
 *
 * Returns `{ t, locale, setLocale }` exactly as before.
 * Components re-render automatically when the language changes thanks
 * to react-i18next's internal subscription.
 */
export function useTranslation() {
  const { t: i18nextT, i18n: instance } = useReactI18next();

  // Build a `t` wrapper that matches the old overloaded signature
  const tWrapped = (
    key: string,
    paramsOrFallback?: Record<string, string | number> | string,
  ): string => {
    if (typeof paramsOrFallback === "string") {
      return i18nextT(key, { defaultValue: paramsOrFallback });
    }
    if (paramsOrFallback && typeof paramsOrFallback === "object") {
      return i18nextT(key, paramsOrFallback);
    }
    return i18nextT(key);
  };

  const locale = normalizeLocale(instance.language);

  const changeLocale = (l: "en" | "zh") => {
    instance.changeLanguage(l);
  };

  return { t: tWrapped, locale, setLocale: changeLocale };
}

export default { t, setLocale, getLocale, onLocaleChange, useTranslation };
