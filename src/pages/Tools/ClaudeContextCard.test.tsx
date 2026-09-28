import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../../i18n/i18n";
import type { Session } from "../../types";
import { ClaudeContextCard } from "./ClaudeContextCard";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const session = {
  tool: "claude_code",
  session_id: "test",
  project: "/project",
  started_at: "2026-09-28T10:00:00Z",
} as Session;

beforeEach(async () => {
  await i18n.changeLanguage("en");
  vi.mocked(invoke).mockResolvedValue({
    model: "claude-opus-5-5",
    tokens: "22k / 1m",
    raw: "private raw context output",
    structured: true,
    sections: [
      { title: "Memory Files", columns: ["Type", "Path", "Tokens"], rows: [["User", "/project/CLAUDE.md", "1.2k"]] },
      { title: "Skills", columns: ["Skill", "Source", "Tokens"], rows: [["example", "User", "80"]] },
      { title: "MCP Tools", columns: ["Tool", "Server", "Tokens"], rows: [["search", "example", "100"]] },
    ],
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ClaudeContextCard", () => {
  it("shows parsed sections expanded without exposing the raw output", async () => {
    const { container } = render(<ClaudeContextCard sessions={[session]} sandboxed={false} />);
    await waitFor(() => expect(screen.getByText("MCP tools")).toBeInTheDocument());

    const sections = [...container.querySelectorAll(".claude-context-sections details")];
    expect(sections).toHaveLength(3);
    expect(sections.every((section) => section.hasAttribute("open"))).toBe(true);
    expect(container.querySelector(".claude-context-raw")).toBeNull();
    expect(screen.queryByText("private raw context output")).toBeNull();
  });

  it("keeps raw output available if Claude's format cannot be parsed", async () => {
    vi.mocked(invoke).mockResolvedValue({ model: null, tokens: null, raw: "changed output", structured: false, sections: [] });
    render(<ClaudeContextCard sessions={[session]} sandboxed={false} />);
    expect(await screen.findByText("changed output")).toBeInTheDocument();
  });
});
