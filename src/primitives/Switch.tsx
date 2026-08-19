interface SwitchProps {
  /** Whether the switch is currently on */
  checked: boolean;
  /** Called with the new state whenever the switch is toggled */
  onChange: (checked: boolean) => void;
  /** id applied to the root element — useful for wiring an associated <label> */
  id: string;
  /** id of an element that labels this switch (maps to aria-labelledby) */
  labelledBy?: string;
}

/**
 * Switch — an accessible styled toggle button.
 *
 * DOM structure (mirrors tokens.css):
 *   div.switch[.on]  role="switch"  aria-checked  tabIndex={0}
 *
 * Keyboard support:
 *   Enter / Space — toggle the switch
 */
export function Switch({ checked, onChange, id, labelledBy }: SwitchProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onChange(!checked);
    }
  }

  return (
    <div
      id={id}
      className={`switch${checked ? " on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={handleKeyDown}
    />
  );
}
