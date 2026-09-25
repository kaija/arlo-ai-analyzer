import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "../../primitives/Badge";
import { QuotaWindowList } from "../../components/QuotaWindowList";
import { useNow } from "../../hooks/useNow";
import { agoPhrase, issueKey } from "../../lib/plan";
import { TOOL_LABELS, type PlanStatus } from "../../types";

// ---------------------------------------------------------------------------
// PlanUsageCard
//
// One block per tool signed in with a subscription: its plan, and a meter per
// limit window with the time until it resets. A tool whose sign-in couldn't be
// read gets a block too, saying why. Presentational — the dashboard
// passes the tools in (see usePlanStatus), and only renders the card when
// there is at least one.
// ---------------------------------------------------------------------------

interface PlanUsageCardProps {
  tools: PlanStatus[];
  /** Live checks are on; without them Claude Code has no limits to show. */
  online: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

export function PlanUsageCard({ tools, online, refreshing, onRefresh }: PlanUsageCardProps) {
  const { t } = useTranslation();
  const now = useNow(30_000);

  return (
    <section className="card" aria-labelledby="plan-usage-heading">
      <div className="card-head">
        <div className="card-head-text">
          <h2 id="plan-usage-heading" className="card-title">{t("plans.card.title")}</h2>
          <p className="card-subtitle">{t("plans.card.subtitle")}</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={onRefresh}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          {refreshing ? t("plans.card.refreshing") : t("plans.card.refresh")}
        </button>
      </div>
      <div className="plan-tools">
        {tools.map((status) => (
          <PlanToolBlock key={status.tool} status={status} online={online} now={now} />
        ))}
      </div>
    </section>
  );
}

function PlanToolBlock({ status, online, now }: { status: PlanStatus; online: boolean; now: number }) {
  const { t } = useTranslation();
  const subscribed = status.auth === "subscription";
  const quota = status.quota;
  const windows = quota?.windows ?? [];

  return (
    <div className="plan-tool" data-testid={`plan-${status.tool}`}>
      <div className="plan-tool-head">
        <span className="plan-tool-name">{TOOL_LABELS[status.tool]}</span>
        <Badge variant={subscribed ? "accent" : "neutral"}>
          {subscribed ? (status.plan ?? t("plans.settings.planUnknown")) : t(`plans.auth.${status.auth}`)}
        </Badge>
        {status.account && <span className="plan-account">{status.account}</span>}
        {quota && (
          <span className="plan-origin">
            {t(`plans.origin.${quota.origin}`, { ago: agoText(t, quota.observed_at, now) })}
          </span>
        )}
      </div>

      {!subscribed ? null : windows.length > 0 ? (
        <QuotaWindowList windows={windows} now={now} />
      ) : online ? (
        <p className="plan-note">{t("plans.card.noQuota")}</p>
      ) : (
        <p className="plan-note">
          {t("plans.card.turnOnLive")}{" "}
          <Link className="link" to="/settings#plans">{t("plans.card.openSettings")}</Link>
        </p>
      )}

      {status.issue && (
        <p className="plan-note plan-issue" title={status.issue.kind === "failed" ? status.issue.detail : undefined}>
          {t(issueKey(status.issue))}
        </p>
      )}
    </div>
  );
}

function agoText(t: (key: string, params?: Record<string, string | number>) => string, iso: string, now: number) {
  const ago = agoPhrase(iso, now);
  return t(ago.key, ago.params);
}
