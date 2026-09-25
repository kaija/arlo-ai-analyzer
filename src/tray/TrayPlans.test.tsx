import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../i18n/i18n";
import { TrayPlans } from "./TrayPlans";
import { TrayPopover } from "./TrayPopover";
import type { PlanReport, PlanStatus } from "../types";

// Under vitest both Tauri modules alias to src/tauri-mock.ts, so one factory
// has to supply both.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), listen: vi.fn(async () => () => {}) }));

const invokeMock = vi.mocked(invoke);
const HOUR = 3_600_000;
const NOW = Date.parse("2026-09-25T12:00:00Z");

function status(overrides: Partial<PlanStatus>): PlanStatus {
  return {
    tool: "codex_cli",
    auth: "subscription",
    plan: "Plus",
    account: "dev@example.com",
    organization: null,
    credential_source: null,
    quota: null,
    issue: null,
    ...overrides,
  };
}

function report(tools: PlanStatus[], online = false): PlanReport {
  return { online, checked_at: null, live_checked_at: null, tools };
}

const codexWithLimits = status({
  quota: {
    origin: "logs",
    observed_at: new Date(NOW).toISOString(),
    windows: [
      {
        id: "primary",
        window_minutes: 300,
        scope: null,
        used_percent: 55,
        resets_at: new Date(NOW + 2 * HOUR + 13 * 60_000).toISOString(),
      },
    ],
  },
});

beforeEach(async () => {
  await i18n.changeLanguage("en");
  invokeMock.mockReset();
});
afterEach(cleanup);

describe("TrayPlans", () => {
  it("shows each limit compactly, with the full reset sentence as a tooltip", () => {
    render(<TrayPlans report={report([codexWithLimits])} now={NOW} />);
    const block = screen.getByTestId("tray-plan-codex_cli");
    expect(within(block).getByText("Plus")).toBeInTheDocument();
    expect(within(block).getByText("5-hour limit")).toBeInTheDocument();
    expect(within(block).getByText("55%")).toBeInTheDocument();
    expect(within(block).getByText("2h 13m")).toHaveAttribute("title", "Resets in 2h 13m");
  });

  it("renders nothing without a subscription sign-in", () => {
    const { container } = render(
      <TrayPlans report={report([status({ auth: "api_key" }), status({ tool: "claude_code", auth: "signed_out" })])} now={NOW} />,
    );
    expect(container).toBeEmptyDOMElement();
    render(<TrayPlans report={null} now={NOW} />);
    expect(screen.queryByText("Plan limits")).not.toBeInTheDocument();
  });

  it("names a tool whose sign-in couldn't be read, and why", () => {
    render(
      <TrayPlans
        report={report([status({ tool: "claude_code", auth: "signed_out", plan: null, issue: { kind: "credentials_unreadable" } })])}
        now={NOW}
      />,
    );
    const block = screen.getByTestId("tray-plan-claude_code");
    expect(within(block).getByText("Signed out")).toBeInTheDocument();
    expect(within(block).getByText(/Couldn't read this tool's sign-in/)).toBeInTheDocument();
    expect(within(block).queryByText(/Turn on online checks/)).not.toBeInTheDocument();
  });

  it("says why a plan has no limits yet", () => {
    render(<TrayPlans report={report([status({ tool: "claude_code", plan: "Max 5x" })])} now={NOW} />);
    expect(screen.getByText(/Turn on online checks/)).toBeInTheDocument();
  });
});

describe("TrayPopover", () => {
  it("loads plan limits with the rest before reporting its height", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_sessions") return [];
      if (cmd === "get_plan_status") return report([codexWithLimits]);
      return null;
    });
    render(<TrayPopover />);

    expect(await screen.findByText("Plan limits")).toBeInTheDocument();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("tray_popover_ready", expect.anything()));
    const calls = invokeMock.mock.calls.map(([cmd]) => cmd);
    expect(calls.indexOf("get_plan_status")).toBeLessThan(calls.indexOf("tray_popover_ready"));
  });
});
