import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../../i18n/i18n";
import { DatabaseCard } from "./DatabaseCard";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const refresh = vi.fn();
vi.mock("../../context/SessionsContext", () => ({
  useSessionsContext: () => ({ refresh }),
}));

const invokeMock = vi.mocked(invoke);

beforeEach(async () => {
  await i18n.changeLanguage("en");
  invokeMock.mockReset();
  refresh.mockReset();
});
afterEach(cleanup);

describe("DatabaseCard", () => {
  it("needs a second click before it touches the database", async () => {
    render(<DatabaseCard />);
    await userEvent.click(screen.getByRole("button", { name: /reset database/i }));

    expect(invokeMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /confirm reset/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("cancelling leaves the database alone", async () => {
    render(<DatabaseCard />);
    await userEvent.click(screen.getByRole("button", { name: /reset database/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(invokeMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /reset database/i })).toBeInTheDocument();
  });

  it("rebuilds and reports how many sessions came back", async () => {
    invokeMock.mockResolvedValue(234);
    render(<DatabaseCard />);

    await userEvent.click(screen.getByRole("button", { name: /reset database/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm reset/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("reset_database");
    });
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("234");
  });

  it("surfaces a failure instead of silently claiming success", async () => {
    invokeMock.mockRejectedValue(new Error("database is locked"));
    render(<DatabaseCard />);

    await userEvent.click(screen.getByRole("button", { name: /reset database/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm reset/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("database is locked");
  });
});
