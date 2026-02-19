import { createI18n } from "vue-i18n";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

export type MessageSchema = typeof en;

function getDefaultLocale(): string {
  const saved = localStorage.getItem("mathtools-locale");
  if (saved && ["en", "zh"].includes(saved)) {
    return saved;
  }
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith("zh")) {
    return "zh";
  }
  return "en";
}

const i18n = createI18n<[MessageSchema], "en" | "zh">({
  legacy: false,
  locale: getDefaultLocale(),
  fallbackLocale: "en",
  messages: {
    en,
    zh,
  },
});

export function setLocale(locale: "en" | "zh") {
  (i18n.global.locale as unknown as { value: string }).value = locale;
  localStorage.setItem("mathtools-locale", locale);
  document.documentElement.setAttribute("lang", locale);
}

export function getLocale(): string {
  return (i18n.global.locale as unknown as { value: string }).value;
}

export default i18n;
