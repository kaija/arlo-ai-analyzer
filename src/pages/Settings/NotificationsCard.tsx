import { useTranslation } from "react-i18next";
import { useSettingsContext } from "../../context/SettingsContext";
import { Switch } from "../../primitives/Switch";

type NotificationKey = "contextAlerts" | "dailyDigest" | "budgetWarnings";

const ROW_KEYS: NotificationKey[] = ["contextAlerts", "dailyDigest", "budgetWarnings"];

export function NotificationsCard() {
  const { t } = useTranslation();
  const { notifications, setNotification } = useSettingsContext();

  return (
    <section className="card" aria-labelledby="notifications-card-heading">
      <div className="card-head">
        <div className="card-head-text">
          <h2 id="notifications-card-heading" className="card-title">
            {t("settings.notifications.title")}
          </h2>
        </div>
      </div>

      <div className="notif-form">
        {ROW_KEYS.map((key) => {
          const labelId = `notif-label-${key}`;
          const switchId = `notif-switch-${key}`;

          return (
            <div key={key} className="notif-form-row">
              <div className="label-col">
                <div id={labelId} className="lbl">
                  {t(`settings.notifications.${key}`)}
                </div>
                <div className="hint">
                  {t(`settings.notifications.${key}Hint`)}
                </div>
              </div>
              <Switch
                id={switchId}
                checked={notifications[key]}
                onChange={(checked) => setNotification(key, checked)}
                labelledBy={labelId}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
