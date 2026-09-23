import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n/i18n";
import type { DataAccess, SourceAccess, ToolKind } from "../../types";
import { Onboarding } from "./Onboarding";

const grantAccess = vi.fn();
const setSampleData = vi.fn();
let access: DataAccess | null = null;

vi.mock("../../context/SessionsContext", () => ({
  useSessionsContext: () => ({ access, grantAccess, setSampleData }),
}));

function source(tool: ToolKind, state: Partial<SourceAccess>): SourceAccess {
  const path = tool === "claude_code" ? "/Users/me/.claude/projects" : "/Users/me/.codex/sessions";
  return { tool, path, granted: false, readable: false, detected: false, ...state };
}

function withSources(...sources: SourceAccess[]): DataAccess {
  return { sample: false, sandboxed: true, sources };
}

/** What the backend answers after a grant: that tool is now readable. */
function grantSucceeds(tool: ToolKind) {
  access = withSources(
    ...access!.sources.map((s) => (s.tool === tool ? { ...s, granted: true, readable: true } : s)),
  );
  return access;
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  grantAccess.mockReset().mockImplementation(async (tool: ToolKind) => grantSucceeds(tool));
  setSampleData.mockReset().mockResolvedValue(undefined);
  access = withSources(
    source("claude_code", { detected: true }),
    source("codex_cli", { detected: true }),
  );
});
afterEach(cleanup);

describe("Onboarding", () => {
  it("shows which tools were found, with home shortened to ~", () => {
    render(<Onboarding />);
    const list = screen.getByRole("list");
    expect(within(list).getAllByText("Found")).toHaveLength(2);
    expect(within(list).getByText("~/.claude/projects")).toBeInTheDocument();
  });

  it("connects every found tool from one button, one picker each", async () => {
    render(<Onboarding />);
    await userEvent.click(screen.getByRole("button", { name: "Allow access to both" }));

    expect(grantAccess).toHaveBeenCalledTimes(2);
    expect(grantAccess).toHaveBeenNthCalledWith(1, "claude_code", expect.stringContaining("~/.claude/projects"));
    expect(grantAccess).toHaveBeenNthCalledWith(2, "codex_cli", expect.stringContaining("~/.codex/sessions"));
  });

  it("stops asking once the user cancels a picker", async () => {
    grantAccess.mockImplementation(async () => access); // cancelled: nothing changes
    render(<Onboarding />);
    await userEvent.click(screen.getByRole("button", { name: "Allow access to both" }));
    expect(grantAccess).toHaveBeenCalledTimes(1);
  });

  it("only asks for what is found and not yet connected", async () => {
    access = withSources(
      source("claude_code", { detected: true, readable: true, granted: true }),
      source("codex_cli", { detected: true }),
    );
    render(<Onboarding />);
    expect(screen.getByText(/Claude Code folder connected/)).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Allow access" })[0]);
    expect(grantAccess).toHaveBeenCalledTimes(1);
    expect(grantAccess).toHaveBeenCalledWith("codex_cli", expect.any(String));
  });

  it("offers a custom folder and sample data when nothing is installed", async () => {
    access = withSources(source("claude_code", {}), source("codex_cli", {}));
    render(<Onboarding />);

    expect(screen.getByText(/No Claude Code or Codex CLI logs were found/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Allow access/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Choose folder…" })).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: /sample data/i }));
    expect(setSampleData).toHaveBeenCalledWith(true);
  });

  it("surfaces a failed grant instead of doing nothing", async () => {
    grantAccess.mockRejectedValue("bookmark creation failed");
    render(<Onboarding />);
    await userEvent.click(screen.getByRole("button", { name: "Allow access to both" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("bookmark creation failed");
  });
});
