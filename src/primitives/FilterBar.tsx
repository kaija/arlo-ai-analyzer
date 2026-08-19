import React from "react";

interface FilterBarProps {
  children: React.ReactNode;
}

/**
 * FilterBar — wraps filter controls in a `.filterbar` layout row.
 *
 * Groups of controls should be separated by a `.sep` div rendered as a
 * 1-px vertical divider. The easiest way to do that is to pass a
 * `<FilterBar.Sep />` between groups, or use the exported `FilterBarSep`
 * helper component.
 *
 * Example:
 *   <FilterBar>
 *     <DateRangePicker />
 *     <FilterBar.Sep />
 *     <SegmentedControl ... />
 *     <SegmentedControl ... />
 *   </FilterBar>
 */
export function FilterBar({ children }: FilterBarProps) {
  return <div className="filterbar">{children}</div>;
}

/**
 * Thin 1-px vertical separator between filter groups.
 * Renders a `.sep` div whose styles come from tokens.css:
 *   `.filterbar .sep { width: 1px; align-self: stretch; background: var(--border); }`
 */
export function FilterBarSep() {
  return <div className="sep" role="separator" aria-hidden="true" />;
}

// Attach Sep as a static property so callers can write <FilterBar.Sep />
FilterBar.Sep = FilterBarSep;
