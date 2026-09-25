import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { GUIDELINE_SOURCES } from "../../lib/tool-usage";

/** The published guidance every threshold on this page comes from, with links. */
export function GuidelinesCard() {
  const { t } = useTranslation();
  return (
    <div className="card tools-guide">
      <div className="card-head">
        <div className="card-title">{t("tools.guide.title")}</div>
      </div>
      <ul>
        {GUIDELINE_SOURCES.map((s) => (
          <li key={s.id}>
            {t(`tools.guide.${s.id}`)}{" "}
            <a
              href={s.url}
              onClick={(e) => {
                e.preventDefault();
                void openUrl(s.url);
              }}
            >
              {new URL(s.url).hostname}
            </a>
          </li>
        ))}
      </ul>
      <p className="tools-guide-note">{t("tools.guide.estimate")}</p>
    </div>
  );
}
