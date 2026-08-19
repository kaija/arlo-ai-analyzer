/**
 * Property 21: Threshold slider aria-valuetext tracks slider value
 *
 * For each value V in {50, 55, 60, 65, 70, 75, 80, 85, 90, 95},
 * after setting the slider to V, aria-valuetext should equal "${V}%".
 *
 * Validates: Requirements 9.5
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as fc from "fast-check";
import { afterEach, describe, it } from "vitest";
import { SettingsProvider } from "../../context/SettingsContext";
import { LanguageProvider } from "../../context/LanguageContext";
import PlanBudgetCard from "./PlanBudgetCard";
// Initialize i18next so useTranslation() returns real strings
import "../../i18n/i18n";

// Valid step values for the context-alert threshold slider (50–95, step 5)
const SLIDER_VALUES = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95];

function renderCard() {
  return render(
    <SettingsProvider>
      <LanguageProvider>
        <PlanBudgetCard />
      </LanguageProvider>
    </SettingsProvider>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Property 21: Threshold slider aria-valuetext tracks slider value", () => {
  it("exhaustively verifies all 10 valid step values", () => {
    /**
     * Because the domain is exactly 10 discrete values we iterate all of them
     * exhaustively. We also wrap it in fc.assert so it is formally registered
     * as a property test and can be run multiple times via numRuns.
     */
    fc.assert(
      fc.property(
        fc.constantFrom(...SLIDER_VALUES),
        (sliderValue) => {
          cleanup();
          localStorage.clear();

          renderCard();

          const slider = screen.getByRole("slider", {
            name: /context-alert threshold/i,
          });

          // Simulate the user dragging the slider to a new position.
          // PlanBudgetCard uses both onInput (for live display) and onChange
          // (to commit to context). fireEvent.change covers both paths because
          // jsdom does not distinguish between them at the DOM level.
          fireEvent.change(slider, { target: { value: String(sliderValue) } });

          const ariaValueText = slider.getAttribute("aria-valuetext");
          return ariaValueText === `${sliderValue}%`;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("verifies each individual step value in isolation", () => {
    for (const v of SLIDER_VALUES) {
      cleanup();
      localStorage.clear();

      renderCard();

      const slider = screen.getByRole("slider", {
        name: /context-alert threshold/i,
      });

      fireEvent.change(slider, { target: { value: String(v) } });

      const ariaValueText = slider.getAttribute("aria-valuetext");
      expect(ariaValueText).toBe(`${v}%`);
    }
  });
});
