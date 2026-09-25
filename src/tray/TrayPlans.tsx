import { useTranslation } from "react-i18next";
import { Badge } from "../primitives/Badge";
import { QuotaWindowList } from "../components/QuotaWindowList";
import { issueKey, planTools } from "../lib/plan";
import { TOOL_LABELS, type PlanReport } from "../types";

// ---------------------------------------------------------------------------
// TrayPlans — the popover's plan-limits section.
//
// The same tools and windows as the dashboard's Plan usage card, compact for
// the popover's width: tools on a plan, and tools whose sign-in couldn't be
// read (with the reason). Nothing at all when there are neither.
// ---------------------------------------------------------------------------

interface TrayPlansProps {
  report: PlanReport | null;
  /** Epoch ms the countdowns are measured from — the popover's load time. */
  now: number;
}

export function TrayPlans({ report, now }: TrayPlansProps) {
  const { t } = useTranslation();
  const tools = planTools(report);
  if (tools.length === 0) return null;

  return (
    <section className="tray-plans" aria-labelledby="tray-plans-heading">
      <div id="tray-plans-heading" className="tray-plans-head">
        {t("tray.plansHeading")}
      </div>
      {tools.map((status) => {
        const subscribed = status.auth === "subscription";
        const windows = status.quota?.windows ?? [];
        return (
          <div key={status.tool} className="tray-plan-tool" data-testid={`tray-plan-${status.tool}`}>
            <div className="tray-plan-tool-head">
              <span>{TOOL_LABELS[status.tool]}</span>
              <Badge variant={subscribed ? "accent" : "neutral"}>
                {subscribed ? (status.plan ?? t("plans.settings.planUnknown")) : t(`plans.auth.${status.auth}`)}
              </Badge>
            </div>
            {!subscribed ? null : windows.length > 0 ? (
              <QuotaWindowList windows={windows} now={now} compact />
            ) : (
              <p className="tray-popover-hint">
                {report?.online ? t("plans.card.noQuota") : t("plans.card.turnOnLive")}
              </p>
            )}
            {status.issue && (
              <p
                className="tray-popover-hint plan-issue"
                title={status.issue.kind === "failed" ? status.issue.detail : undefined}
              >
                {t(issueKey(status.issue))}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
