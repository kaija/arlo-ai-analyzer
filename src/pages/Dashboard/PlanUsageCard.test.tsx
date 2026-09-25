import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n/i18n";
import { PlanUsageCard } from "./PlanUsageCard";
import type { PlanStatus } from "../../types";

const HOUR = 3_600_000;

function claude(overrides: Partial<PlanStatus> = {}): PlanStatus {
  return {
    tool: "claude_code",
    auth: "subscription",
    plan: "Max 20x",
    account: "dev@example.com",
    organization: null,
    credential_source: { kind: "keychain" },
    quota: null,
    issue: null,
    ...overrides,
  };
}

function renderCard(tools: PlanStatus[], online: boolean) {
  return render(
    <MemoryRouter>
      <PlanUsageCard tools={tools} online={online} refreshing={false} onRefresh={() => {}} />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});
afterEach(cleanup);

describe("PlanUsageCard", () => {
  it("shows each window's use and time to reset", () => {
    const now = Date.now();
    const status = claude({
      quota: {
        origin: "live",
        observed_at: new Date(now).toISOString(),
        windows: [
          {
            id: "five_hour",
            window_minutes: 300,
            scope: null,
            used_percent: 23,
            resets_at: new Date(now + 2 * HOUR + 30 * 60_000).toISOString(),
          },
          { id: "seven_day_opus", window_minutes: 10_080, scope: "Opus", used_percent: 81, resets_at: null },
        ],
      },
    });
    renderCard([status], true);

    const block = screen.getByTestId("plan-claude_code");
    expect(within(block).getByText("Max 20x")).toBeInTheDocument();
    expect(within(block).getByText("dev@example.com")).toBeInTheDocument();
    expect(within(block).getByText("5-hour limit")).toBeInTheDocument();
    expect(within(block).getByText("23%")).toBeInTheDocument();
    expect(within(block).getByText(/Resets in 2h (29|30)m/)).toBeInTheDocument();
    expect(within(block).getByText("Weekly limit · Opus")).toBeInTheDocument();
    expect(within(block).getByText("Live · just now")).toBeInTheDocument();
  });

  it("points to Settings when limits need the online check", () => {
    renderCard([claude()], false);
    const link = screen.getByRole("link", { name: "Open Settings" });
    expect(link).toHaveAttribute("href", "/settings#plans");
  });

  it("explains an issue", () => {
    renderCard([claude({ issue: { kind: "sign_in_expired" } })], true);
    expect(screen.getByText(/saved sign-in has expired/)).toBeInTheDocument();
  });
});
