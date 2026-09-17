import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Session } from "../../types";
import DashboardPage from "./index";

const navigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

const unpricedSession: Session = {
  tool: "codex_cli",
  session_id: "unpriced-session",
  project: "demo",
  started_at: "2026-09-17T00:00:00Z",
  model: "future-model-without-a-rate",
  input_tokens: 100,
  output_tokens: 20,
  cache_creation_tokens: 0,
  cache_write_5m: 0,
  cache_write_1h: 0,
  cache_read_tokens: 0,
  peak_context_tokens: 100,
  peak_context_model: "future-model-without-a-rate",
  compaction_count: 0,
  message_count: 1,
  cost_usd: 0,
};

vi.mock("../../context/SessionsContext", () => ({
  useSessionsContext: () => ({
    sessions: [unpricedSession],
    loading: false,
    scanState: "done",
  }),
}));

vi.mock("../../context/SettingsContext", () => ({
  useSettingsContext: () => ({ contextAlertThreshold: 75 }),
}));

describe("unpriced-model warning", () => {
  beforeEach(() => navigate.mockReset());

  it("takes View directly to the pricing section", async () => {
    render(<DashboardPage />);

    await userEvent.click(screen.getByRole("link", { name: "View" }));

    expect(navigate).toHaveBeenCalledWith("/settings#pricing");
  });
});
