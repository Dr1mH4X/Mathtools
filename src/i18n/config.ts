import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

export type Locale = "en" | "zh";

function detectBrowserLocale(): Locale {
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith("zh")) {
    return "zh";
  }
  return "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: detectBrowserLocale(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
    // Use {key} style interpolation to match existing locale files
    prefix: "{",
    suffix: "}",
  },
  react: {
    useSuspense: false,
  },
});

// Keep html lang attribute in sync (no localStorage)
i18n.on("languageChanged", (lng: string) => {
  document.documentElement.setAttribute("lang", lng);
});

// Set initial lang attribute
document.documentElement.setAttribute("lang", i18n.language);

export default i18n;
