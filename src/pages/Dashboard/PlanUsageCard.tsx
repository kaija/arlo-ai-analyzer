import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "../../primitives/Badge";
import { Meter } from "../../primitives/Meter";
import { useNow } from "../../hooks/useNow";
import {
  agoPhrase,
  clampPercent,
  durationPhrase,
  issueKey,
  resetsInMs,
  windowPhrase,
  type Phrase,
} from "../../lib/plan";
import { TOOL_LABELS, type PlanStatus, type QuotaWindow } from "../../types";

// ---------------------------------------------------------------------------
// PlanUsageCard
//
// One block per tool signed in with a subscription: its plan, and a meter per
// limit window with the time until it resets. Presentational — the dashboard
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
  const say = (p: Phrase) => t(p.key, p.params);
  const quota = status.quota;
  const windows = quota?.windows ?? [];

  return (
    <div className="plan-tool" data-testid={`plan-${status.tool}`}>
      <div className="plan-tool-head">
        <span className="plan-tool-name">{TOOL_LABELS[status.tool]}</span>
        <Badge variant="accent">{status.plan ?? t("plans.settings.planUnknown")}</Badge>
        {status.account && <span className="plan-account">{status.account}</span>}
        {quota && (
          <span className="plan-origin">
            {t(`plans.origin.${quota.origin}`, { ago: say(agoPhrase(quota.observed_at, now)) })}
          </span>
        )}
      </div>

      {windows.length > 0 ? (
        <ul className="plan-windows">
          {windows.map((w) => (
            <WindowRow key={w.id} window={w} now={now} say={say} />
          ))}
        </ul>
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

function WindowRow({ window: w, now, say }: { window: QuotaWindow; now: number; say: (p: Phrase) => string }) {
  const { t } = useTranslation();
  const base = say(windowPhrase(w));
  const label = w.scope ? t("plans.window.scoped", { window: base, scope: w.scope }) : base;
  const resetsIn = resetsInMs(w.resets_at, now);

  return (
    <li className="plan-window">
      <span>{label}</span>
      <Meter value={clampPercent(w.used_percent)} showLabel />
      <span className="plan-window-reset">
        {resetsIn !== null ? t("plans.resetsIn", { time: say(durationPhrase(resetsIn)) }) : ""}
      </span>
    </li>
  );
}
