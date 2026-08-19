import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zhTW from "./locales/zh-TW.json";
import ja from "./locales/ja.json";

export const SUPPORTED_LOCALES = ["en", "zh-TW", "ja"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function getStoredLocale(): SupportedLocale {
  try {
    const stored = localStorage.getItem("arlo-language");
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      return stored as SupportedLocale;
    }
  } catch {
    // localStorage unavailable (SSR, test env without DOM)
  }
  return "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "zh-TW": { translation: zhTW },
    ja: { translation: ja },
  },
  lng: getStoredLocale(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes output
  },
});

export default i18n;
