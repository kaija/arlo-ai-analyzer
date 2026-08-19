import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import i18n from "../i18n/i18n";

export type Locale = "en" | "zh-TW" | "ja";

const VALID_LOCALES: Locale[] = ["en", "zh-TW", "ja"];
const KEY_LANGUAGE = "arlo-language";

function defaultLocale(): Locale {
  try {
    const stored = localStorage.getItem(KEY_LANGUAGE);
    if (stored && (VALID_LOCALES as string[]).includes(stored)) {
      return stored as Locale;
    }
  } catch {
    // ignore
  }
  return "en";
}

interface LanguageState {
  language: Locale;
  setLanguage: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Locale>(defaultLocale);

  const setLanguage = useCallback((locale: Locale) => {
    setLanguageState(locale);
    void i18n.changeLanguage(locale);
    try {
      localStorage.setItem(KEY_LANGUAGE, locale);
    } catch {
      // ignore
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguageContext(): LanguageState {
  const ctx = useContext(LanguageContext);
  if (ctx === null) {
    throw new Error("useLanguageContext must be used inside <LanguageProvider>");
  }
  return ctx;
}
