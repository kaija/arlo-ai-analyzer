import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../../i18n/i18n";
import type { ToolAnalysis } from "../../lib/tool-usage";
import { RecommendationsCard } from "./RecommendationsCard";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const analysis = {
  tool: "claude_code",
  sessions: 42,
  requests: 7_230,
  contextWindow: 1_000_000,
  recommendations: [{
    kind: "unused_mcp", severity: "info", items: [], tokensPerRequest: 4_300, values: {},
  }],
} as ToolAnalysis;

beforeEach(async () => {
  await i18n.changeLanguage("en");
  vi.mocked(invoke).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("RecommendationsCard", () => {
  it("shows a rough USD saving for the most-used model", () => {
    render(<RecommendationsCard analysis={analysis} savingsRate={{ model: "claude-opus-5-5", usdPerMillion: 2.1 }} claudeCliAvailable={false} projects={[]} />);
    expect(screen.getByText(/7,230 requests.*\$65\.29.*claude-opus-5-5/)).toBeInTheDocument();
  });

  it("keeps the token saving when a model price is unavailable", () => {
    render(<RecommendationsCard analysis={analysis} savingsRate={null} claudeCliAvailable={false} projects={[]} />);
    expect(screen.getByText(/7,230 requests/)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Run in Claude Code" })).toBeNull();
  });

  it("opens an interactive Claude session in the chosen project", async () => {
    render(<RecommendationsCard analysis={analysis} savingsRate={null} claudeCliAvailable projects={["/first", "/second"]} />);
    await userEvent.selectOptions(screen.getByLabelText("Project to run in"), "/second");
    await userEvent.click(screen.getByRole("button", { name: "Run in Claude Code" }));
    expect(invoke).toHaveBeenCalledWith("launch_claude_prompt", {
      project: "/second",
      prompt: expect.stringContaining("Wait for my OK"),
    });
    expect(screen.getByRole("status")).toHaveTextContent("Claude Code opened in Terminal");
  });

  it("keeps the copy option when Terminal cannot open", async () => {
    vi.mocked(invoke).mockRejectedValueOnce("Terminal access denied");
    render(<RecommendationsCard analysis={analysis} savingsRate={null} claudeCliAvailable projects={["/first"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Run in Claude Code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Terminal access denied");
    expect(screen.getByRole("button", { name: "Copy prompt for Claude Code / Codex" })).toBeInTheDocument();
  });
});
