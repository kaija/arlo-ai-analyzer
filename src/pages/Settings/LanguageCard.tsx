import { useTranslation } from "react-i18next";
import { useLanguageContext, type Locale } from "../../context/LanguageContext";

const LANGUAGE_OPTIONS: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "ja", label: "日本語" },
];

export function LanguageCard() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguageContext();

  return (
    <section className="card" aria-labelledby="language-card-heading">
      <div className="card-head">
        <div className="card-head-text">
          <h2 id="language-card-heading" className="card-title">
            {t("settings.language.title")}
          </h2>
          <p className="card-subtitle">{t("settings.language.subtitle")}</p>
        </div>
      </div>

      <div className="settings-form">
        <div
          className="language-segmented"
          role="group"
          aria-label={t("settings.language.controlLabel")}
        >
          {LANGUAGE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`lang-btn${language === value ? " active" : ""}`}
              onClick={() => setLanguage(value)}
              aria-pressed={language === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
