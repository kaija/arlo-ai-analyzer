import { useTranslation } from "react-i18next";
import { Switch } from "../../primitives/Switch";
import { usePlanStatus } from "../../hooks/usePlanStatus";
import { useNow } from "../../hooks/useNow";
import { agoPhrase, issueKey, type Phrase } from "../../lib/plan";
import { TOOL_LABELS, type CredentialSource, type PlanStatus } from "../../types";

// ---------------------------------------------------------------------------
// PlansCard — "Plans & limits"
//
// One row per installed tool: how it is signed in, the plan, the account, and
// where that was read from. Below: the switch for live checks (the only
// requests that carry the user's sign-in, so off by default) and "Refresh now".
// ---------------------------------------------------------------------------

export function PlansCard() {
  const { t } = useTranslation();
  const { report, refreshing, refresh, setOnline } = usePlanStatus();
  const now = useNow(30_000);

  const say = (p: Phrase) => t(p.key, p.params);
  let detail = "";
  if (report && !report.online) {
    detail = t("plans.settings.online.off");
  } else if (report?.live_checked_at) {
    detail = t("plans.settings.online.checked", { ago: say(agoPhrase(report.live_checked_at, now)) });
  } else if (report) {
    detail = t("plans.settings.online.notYet");
  }

  // The section renders before the first answer so `#plans` links can scroll to it.
  return (
    <section id="plans" className="card" aria-labelledby="plans-card-heading" tabIndex={-1}>
      <div className="card-head">
        <div className="card-head-text">
          <h2 id="plans-card-heading" className="card-title">{t("plans.settings.title")}</h2>
          <p className="card-subtitle">{t("plans.settings.subtitle")}</p>
        </div>
      </div>

      {report && (
        <div className="notif-form">
          {report.tools.length === 0 ? (
            <div className="notif-form-row">
              <div className="hint">{t("plans.settings.none")}</div>
            </div>
          ) : (
            report.tools.map((status) => <ToolRow key={status.tool} status={status} />)
          )}

          <div className="notif-form-row">
            <div className="label-col">
              <div id="plan-online-label" className="lbl">{t("plans.settings.online.label")}</div>
              <div className="hint">{t("plans.settings.online.hint")}</div>
              <div className="hint">{detail}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => void refresh()}
                disabled={refreshing}
                aria-busy={refreshing}
              >
                {refreshing ? t("plans.settings.refreshing") : t("plans.settings.refreshNow")}
              </button>
              <Switch
                id="plan-online-switch"
                checked={report.online}
                onChange={(enabled) => void setOnline(enabled)}
                labelledBy="plan-online-label"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ToolRow({ status }: { status: PlanStatus }) {
  const { t } = useTranslation();
  const summary = [t(`plans.auth.${status.auth}`)];
  if (status.auth === "subscription") summary.push(status.plan ?? t("plans.settings.planUnknown"));
  const account = [status.account, status.organization].filter(Boolean).join(" · ");

  return (
    <div className="notif-form-row">
      <div className="label-col" style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div className="lbl">
          {TOOL_LABELS[status.tool]}
          {" · "}
          <span className="hint">{summary.join(" · ")}</span>
        </div>
        {account && <div className="hint">{account}</div>}
        {status.credential_source && <div className="hint">{sourceText(t, status.credential_source)}</div>}
        {status.issue && (
          <div className="hint plan-issue" title={status.issue.kind === "failed" ? status.issue.detail : undefined}>
            {t(issueKey(status.issue))}
          </div>
        )}
      </div>
    </div>
  );
}

function sourceText(t: (key: string, params?: Record<string, string>) => string, source: CredentialSource): string {
  return source.kind === "file" ? t("plans.source.file", { path: source.path }) : t(`plans.source.${source.kind}`);
}
