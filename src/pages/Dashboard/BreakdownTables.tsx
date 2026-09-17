import type { Session, Measure } from "../../types";
import {
  breakdownByModel,
  breakdownByProject,
} from "../../lib/aggregate";
import { BreakdownTable } from "./BreakdownTable";

interface BreakdownTablesProps {
  /** All sessions within the active date range (post date-filter, pre entity-filter). */
  sessions: Session[];
  /** Active measure — passed through to each table to highlight the right column. */
  measure: Measure;
  /**
   * Currently-active entity filter, or null. Format: "model:<name>" | "project:<name>"
   * so the correct table knows which row to highlight.
   */
  entityFilter: { kind: "model" | "project"; name: string } | null;
  /** Called when the user clicks a row or clears a filter. */
  onEntityFilter: (
    filter: { kind: "model" | "project"; name: string } | null
  ) => void;
}

/**
 * BreakdownTables — composes three `BreakdownTable` instances side-by-side
 * inside `.tri-tables` (which collapses to single-column at ≤ 1100 px via
 * the media query in tokens.css / App.css).
 *
 * Each table is given the pre-computed breakdown rows for its dimension and
 * forwards entity-filter events up to the parent Dashboard page.
 *
 * Requirements: 3.18, 3.19, 3.20
 */
export function BreakdownTables({
  sessions,
  measure,
  entityFilter,
  onEntityFilter,
}: BreakdownTablesProps) {
  const modelRows = breakdownByModel(sessions);
  const projectRows = breakdownByProject(sessions);

  return (
    <div className="tri-tables">
      <h2 className="sr-only">Usage breakdown</h2>
      <BreakdownTable
        title="By model"
        rows={modelRows}
        measure={measure}
        entityFilter={
          entityFilter?.kind === "model" ? entityFilter.name : null
        }
        onEntityFilter={(name) =>
          onEntityFilter(name !== null ? { kind: "model", name } : null)
        }
      />

      <BreakdownTable
        title="By project"
        rows={projectRows}
        measure={measure}
        entityFilter={
          entityFilter?.kind === "project" ? entityFilter.name : null
        }
        onEntityFilter={(name) =>
          onEntityFilter(name !== null ? { kind: "project", name } : null)
        }
      />
    </div>
  );
}
