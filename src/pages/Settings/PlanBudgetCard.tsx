import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsContext } from "../../context/SettingsContext";

// ---------------------------------------------------------------------------
// Validation helper
// strip commas → Number() → must be finite AND >= 0
// ---------------------------------------------------------------------------

function validateCurrencyString(raw: string): boolean {
  const stripped = raw.replace(/,/g, "");
  const n = Number(stripped);
  return isFinite(n) && n >= 0 && stripped.trim() !== "";
}

// ---------------------------------------------------------------------------
// CurrencyRow — label col on the left, prefixed input + unit ("/ month") on the right
// ---------------------------------------------------------------------------

interface CurrencyRowProps {
  id: string;
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  errorMessage: string;
  unitLabel: string;
}

export function CurrencyRow({ id, label, hint, value, onChange, errorMessage, unitLabel }: CurrencyRowProps) {
  const [text, setText] = useState<string>(value.toFixed(2));
  const [error, setError] = useState<boolean>(false);
  const errorId = `${id}-error`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    if (error) setError(false);
  };

  const handleBlur = () => {
    if (validateCurrencyString(text)) {
      const n = parseFloat(text.replace(/,/g, ""));
      onChange(n);
      setText(n.toFixed(2));
      setError(false);
    } else {
      setError(true);
    }
  };

  // Keep local text in sync when context value changes externally
  const formattedValue = value.toFixed(2);
  if (!error && text !== formattedValue && text === value.toFixed(2)) {
    setText(formattedValue);
  }

  return (
    <div className="form-row">
      <div className="label-col">
        <div className="lbl" id={`${id}-label`}>{label}</div>
        <div className="hint">{hint}</div>
      </div>
      <div className="control-col">
        <div className={`prefix-input-wrap${error ? " error" : ""}`}>
          <span className="prefix" aria-hidden="true">$</span>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            value={text}
            onChange={handleChange}
            onBlur={handleBlur}
            aria-labelledby={`${id}-label`}
            aria-invalid={error}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
        <span className="per-month">{unitLabel}</span>
      </div>
      {error && (
        <p id={errorId} role="alert" className="field-error-inline" style={{ width: "100%", marginTop: -10 }}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlanBudgetCard
// ---------------------------------------------------------------------------

export default function PlanBudgetCard() {
  const { t } = useTranslation();
  const {
    monthlyPlanPrice,
    setMonthlyPlanPrice,
    monthlyBudget,
    setMonthlyBudget,
    contextAlertThreshold,
    setContextAlertThreshold,
  } = useSettingsContext();

  const priceId = useId();
  const budgetId = useId();
  const sliderId = useId();
  const sliderLabelId = `${sliderId}-label`;

  const [sliderDisplay, setSliderDisplay] = useState<number>(contextAlertThreshold);

  const handleSliderInput = (e: React.FormEvent<HTMLInputElement>) => {
    const v = parseInt((e.target as HTMLInputElement).value, 10);
    setSliderDisplay(v);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    setSliderDisplay(v);
    setContextAlertThreshold(v);
  };

  return (
    <section className="card" aria-labelledby="plan-budget-heading">
      <div className="card-head">
        <div className="card-head-text">
          <h2 id="plan-budget-heading" className="card-title">{t("settings.planBudget.title")}</h2>
          <p className="card-subtitle">{t("settings.planBudget.subtitle")}</p>
        </div>
      </div>

      <div className="settings-form">
        <CurrencyRow
          id={priceId}
          label={t("settings.planBudget.monthlyPlanPrice")}
          hint={t("settings.planBudget.monthlyPlanPriceHint")}
          value={monthlyPlanPrice}
          onChange={setMonthlyPlanPrice}
          errorMessage={t("settings.planBudget.invalidNumber")}
          unitLabel={t("settings.planBudget.perMonth")}
        />

        <CurrencyRow
          id={budgetId}
          label={t("settings.planBudget.monthlyBudget")}
          hint={t("settings.planBudget.monthlyBudgetHint")}
          value={monthlyBudget}
          onChange={setMonthlyBudget}
          errorMessage={t("settings.planBudget.invalidNumber")}
          unitLabel={t("settings.planBudget.perMonth")}
        />

        <div className="form-row threshold-row">
          <div className="label-col">
            <div className="lbl" id={sliderLabelId}>{t("settings.planBudget.contextAlertThreshold")}</div>
            <div className="hint">
              {t("settings.planBudget.contextAlertThresholdHint")}
            </div>
          </div>
          <div className="control-col">
            <input
              id={sliderId}
              type="range"
              min={50}
              max={95}
              step={5}
              value={sliderDisplay}
              onInput={handleSliderInput}
              onChange={handleSliderChange}
              className="settings-range"
              aria-labelledby={sliderLabelId}
              aria-valuemin={50}
              aria-valuemax={95}
              aria-valuenow={sliderDisplay}
              aria-valuetext={`${sliderDisplay}%`}
            />
            <span className="threshold-val">{sliderDisplay}%</span>
          </div>
        </div>
      </div>
    </section>
  );
}
