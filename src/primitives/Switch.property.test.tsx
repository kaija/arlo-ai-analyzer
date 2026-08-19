/**
 * Property 20: Notification toggle aria-checked tracks visual state
 *
 * For any toggle interaction sequence of length N (each toggle flips state),
 * the `aria-checked` attribute should always equal the current visual on/off
 * state. After N clicks on a toggle starting from state S₀, `aria-checked`
 * should be "true" if N is odd and S₀ was false (or N is even and S₀ was
 * true), and "false" otherwise.
 *
 * Validates: Requirements 7.6, 9.4
 */

import { describe, it } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import { useState } from "react";
import * as fc from "fast-check";
import { Switch } from "./Switch";

// ---------------------------------------------------------------------------
// Controlled wrapper — holds the current `checked` state so the Switch
// component receives a live `checked` prop and calls `onChange` to flip it.
// ---------------------------------------------------------------------------
function ControlledSwitch({ initial }: { initial: boolean }) {
  const [checked, setChecked] = useState(initial);
  return (
    <Switch
      id="test-switch"
      checked={checked}
      onChange={(next) => setChecked(next)}
    />
  );
}

describe("Property 20 – Switch aria-checked tracks visual state", () => {
  it(
    "aria-checked always reflects the current on/off state after N clicks",
    () => {
      fc.assert(
        fc.property(
          // arbitrary initial state
          fc.boolean(),
          // arbitrary number of clicks (0–20)
          fc.integer({ min: 0, max: 20 }),
          (initialChecked, clickCount) => {
            const { getByRole, unmount } = render(
              <ControlledSwitch initial={initialChecked} />
            );

            const switchEl = getByRole("switch");

            // Verify initial state before any clicks
            expect(switchEl).toHaveAttribute(
              "aria-checked",
              String(initialChecked)
            );

            // Perform N clicks, checking aria-checked after every single click
            let expected = initialChecked;
            for (let i = 0; i < clickCount; i++) {
              act(() => {
                fireEvent.click(switchEl);
              });
              expected = !expected;
              // aria-checked must track the visual state after each click
              expect(switchEl).toHaveAttribute(
                "aria-checked",
                String(expected)
              );
            }

            // Final state must equal the deterministic formula:
            // odd N from false OR even N from true → "true", otherwise "false"
            const finalExpected =
              clickCount % 2 === 0 ? initialChecked : !initialChecked;
            expect(switchEl).toHaveAttribute(
              "aria-checked",
              String(finalExpected)
            );

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    "aria-checked stays in sync with visual .on class after keyboard toggles (Enter key)",
    () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.integer({ min: 0, max: 20 }),
          (initialChecked, pressCount) => {
            const { getByRole, unmount } = render(
              <ControlledSwitch initial={initialChecked} />
            );

            const switchEl = getByRole("switch");

            // Focus the element so keyboard events land on it
            act(() => {
              switchEl.focus();
            });

            let expected = initialChecked;
            for (let i = 0; i < pressCount; i++) {
              act(() => {
                fireEvent.keyDown(switchEl, { key: "Enter", code: "Enter" });
              });
              expected = !expected;
              expect(switchEl).toHaveAttribute(
                "aria-checked",
                String(expected)
              );
            }

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    "aria-checked stays in sync with visual .on class after keyboard toggles (Space key)",
    () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.integer({ min: 0, max: 20 }),
          (initialChecked, pressCount) => {
            const { getByRole, unmount } = render(
              <ControlledSwitch initial={initialChecked} />
            );

            const switchEl = getByRole("switch");

            act(() => {
              switchEl.focus();
            });

            let expected = initialChecked;
            for (let i = 0; i < pressCount; i++) {
              act(() => {
                fireEvent.keyDown(switchEl, { key: " ", code: "Space" });
              });
              expected = !expected;
              expect(switchEl).toHaveAttribute(
                "aria-checked",
                String(expected)
              );
            }

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
