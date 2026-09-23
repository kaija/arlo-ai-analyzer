import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useSessionsContext } from "../context/SessionsContext";

// ---------------------------------------------------------------------------
// SampleDataBanner
//
// Shown on every page while sample data is on, so generated numbers are never
// mistaken for real usage. Exiting drops back to the user's own logs (or the
// onboarding empty state if none are connected).
// ---------------------------------------------------------------------------

export function SampleDataBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { access, setSampleData } = useSessionsContext();
  const [busy, setBusy] = useState(false);

  if (!access?.sample) return null;

  const exit = async () => {
    setBusy(true);
    try {
      await setSampleData(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="alert-banner" role="status">
      <div className="icon-tile" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </div>
      <div className="body">
        <strong>{t("dataAccess.sampleBannerTitle")}</strong>
        <div className="meta">{t("dataAccess.sampleBannerBody")}</div>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/settings#logs-directory")}>
          {t("settings.logsDirectory.title")}
        </button>
        <button type="button" className="btn btn-primary" onClick={exit} disabled={busy}>
          {t("dataAccess.exitSample")}
        </button>
      </div>
    </div>
  );
}
