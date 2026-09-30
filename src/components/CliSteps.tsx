import { useState } from "react";
import { useTranslation } from "react-i18next";

export interface CliStep {
  text: string;
  command?: string;
}

/** Quote a path for a POSIX shell, for commands the user pastes into Terminal. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Terminal steps for a feature the sandboxed App Store build can't run itself:
 * the external CLI it would start inherits the sandbox and can't reach its own
 * configuration or sign-in, so the user runs it instead.
 */
export function CliSteps({ intro, steps }: { intro: string; steps: CliStep[] }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<number | null>(null);

  const copy = async (index: number, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(index);
      setTimeout(() => setCopied((current) => (current === index ? null : current)), 1500);
    } catch {
      // Clipboard unavailable; the command is still selectable.
    }
  };

  return (
    <div className="cli-steps">
      <p className="cli-steps-intro">{intro}</p>
      <ol>
        {steps.map((step, index) => (
          <li key={index}>
            <span>{step.text}</span>
            {step.command && (
              <div className="cli-steps-command">
                <code>{step.command}</code>
                <button type="button" className="btn btn-secondary" onClick={() => void copy(index, step.command!)}>
                  {copied === index ? t("cliSteps.copied") : t("cliSteps.copy")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
