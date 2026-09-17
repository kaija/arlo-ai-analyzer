import { describe, it } from "vitest";
import * as fc from "fast-check";
import type { Session, ToolKind } from "../types";

// ---------------------------------------------------------------------------
// applyChips — the filter function under test (inlined per task spec)
// ---------------------------------------------------------------------------

interface FilterChipDef {
  field: "project" | "model";
  value: string;
}

function applyChips(sessions: Session[], chips: FilterChipDef[]): Session[] {
  return sessions.filter((s) =>
    chips.every((chip) => {
      const fieldValue = chip.field === "project" ? s.project : (s.model ?? "");
      return fieldValue === chip.value;
    }),
  );
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const toolArb = fc.constantFrom<ToolKind>(
  "claude_code",
  "cursor",
  "gemini_cli",
  "codex_cli",
);

const modelArb = fc.oneof(
  fc.constant(null),
  fc.constantFrom(
    "claude-opus-4",
    "claude-opus-4-5",
    "claude-3-opus",
    "claude-3-7-sonnet",
    "claude-sonnet-4-5",
    "claude-3-5-sonnet",
    "claude-3-5-haiku",
    "claude-haiku-4-5",
    "claude-3-haiku",
  ),
);

// Epoch offsets for a safe date range (2023-01-01 – 2025-06-30 UTC)
const DATE_MIN_MS = Date.UTC(2023, 0, 1);
const DATE_MAX_MS = Date.UTC(2025, 5, 30);

const startedAtArb: fc.Arbitrary<string> = fc
  .integer({ min: DATE_MIN_MS, max: DATE_MAX_MS })
  .map((ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z"));

/** Generates valid Session objects with all required fields. */
const sessionArb: fc.Arbitrary<Session> = fc.record<Session>({
  tool: toolArb,
  session_id: fc.uuid(),
  project: fc.constantFrom(
    "project-alpha",
    "project-beta",
    "project-gamma",
    "arlo-ai",
    "my-app",
  ),
  started_at: startedAtArb,
  model: modelArb,
  input_tokens: fc.nat({ max: 200_000 }),
  output_tokens: fc.nat({ max: 20_000 }),
  cache_creation_tokens: fc.nat({ max: 100_000 }),
  cache_write_5m: fc.nat({ max: 100_000 }),
  cache_write_1h: fc.nat({ max: 100_000 }),
  cache_read_tokens: fc.nat({ max: 100_000 }),
  peak_context_tokens: fc.nat({ max: 1_000_000 }),
  peak_context_model: modelArb,
  compaction_count: fc.nat({ max: 10 }),
  message_count: fc.nat({ max: 500 }),
  cost_usd: fc.nat({ max: 1_000 }),
});

/**
 * Generates filter chips whose values are drawn from a given session array,
 * so at least some sessions have a chance to satisfy the chip constraints.
 */
function chipsFromSessions(sessions: Session[]): fc.Arbitrary<FilterChipDef[]> {
  if (sessions.length === 0) {
    return fc.constant([]);
  }

  // Collect unique project and model values from the generated sessions
  const projects = [...new Set(sessions.map((s) => s.project))];
  const models = [...new Set(sessions.map((s) => s.model ?? ""))];

  const projectChipArb: fc.Arbitrary<FilterChipDef> = fc
    .constantFrom(...projects)
    .map((value) => ({ field: "project" as const, value }));

  const modelChipArb: fc.Arbitrary<FilterChipDef> = fc
    .constantFrom(...models)
    .map((value) => ({ field: "model" as const, value }));

  const singleChipArb: fc.Arbitrary<FilterChipDef> = fc.oneof(
    projectChipArb,
    modelChipArb,
  );

  // Generate 0–3 chips; 0 chips tests the empty-chips case
  return fc.array(singleChipArb, { minLength: 0, maxLength: 3 });
}

// ---------------------------------------------------------------------------
// Property 12: AND-filter chips compose correctly
// Validates: Requirements 4.9
// ---------------------------------------------------------------------------

describe("Property 12: AND-filter chips compose correctly", () => {
  /**
   * Soundness: every session returned by applyChips satisfies ALL active chips.
   * No session that fails any single chip constraint should appear in the result.
   */
  it("every result session satisfies all chips (soundness)", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 100 }).chain((sessions) =>
          chipsFromSessions(sessions).map((chips) => ({ sessions, chips })),
        ),
        ({ sessions, chips }) => {
          const result = applyChips(sessions, chips);

          return result.every((s) =>
            chips.every((chip) => {
              const fieldValue = chip.field === "project" ? s.project : (s.model ?? "");
              return fieldValue === chip.value;
            }),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Completeness: no session that satisfies all chips is missing from the result.
   * Every in-range session must appear in the filtered output.
   */
  it("no qualifying session is excluded from the result (completeness)", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 100 }).chain((sessions) =>
          chipsFromSessions(sessions).map((chips) => ({ sessions, chips })),
        ),
        ({ sessions, chips }) => {
          const result = applyChips(sessions, chips);
          const resultIds = new Set(result.map((s) => s.session_id));

          // Every session that satisfies all chips must be present in the result
          const qualifying = sessions.filter((s) =>
            chips.every((chip) => {
              const fieldValue = chip.field === "project" ? s.project : (s.model ?? "");
              return fieldValue === chip.value;
            }),
          );

          return qualifying.every((s) => resultIds.has(s.session_id));
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Empty chips: when there are no active chips, all sessions pass through.
   * applyChips(sessions, []) must equal sessions (same length and same IDs).
   */
  it("empty chips array returns all sessions unchanged", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 100 }),
        (sessions) => {
          const result = applyChips(sessions, []);
          if (result.length !== sessions.length) return false;
          const resultIds = new Set(result.map((s) => s.session_id));
          return sessions.every((s) => resultIds.has(s.session_id));
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Monotonicity: adding a chip can only reduce or preserve the result size.
   * displayedRows(chips + [extraChip]).length <= displayedRows(chips).length
   */
  it("adding a chip never increases the result count (monotonicity)", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 1, maxLength: 100 }).chain((sessions) => {
          // Pick an extra chip from the session values to keep it realistic
          const projects = [...new Set(sessions.map((s) => s.project))];
          const models = [...new Set(sessions.map((s) => s.model ?? ""))];
          const allValues = [
            ...projects.map((v): FilterChipDef => ({ field: "project", value: v })),
            ...models.map((v): FilterChipDef => ({ field: "model", value: v })),
          ];
          const extraChipArb = fc.constantFrom(...allValues);
          return chipsFromSessions(sessions).chain((chips) =>
            extraChipArb.map((extra) => ({ sessions, chips, extra })),
          );
        }),
        ({ sessions, chips, extra }) => {
          const baseLine = applyChips(sessions, chips).length;
          const withExtra = applyChips(sessions, [...chips, extra]).length;
          return withExtra <= baseLine;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Result is a subset of the input: no session can appear in the result
   * that was not present in the original sessions array.
   */
  it("result is always a subset of the input sessions", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 100 }).chain((sessions) =>
          chipsFromSessions(sessions).map((chips) => ({ sessions, chips })),
        ),
        ({ sessions, chips }) => {
          const result = applyChips(sessions, chips);
          const inputIds = new Set(sessions.map((s) => s.session_id));
          return result.every((s) => inputIds.has(s.session_id));
        },
      ),
      { numRuns: 100 },
    );
  });
});
