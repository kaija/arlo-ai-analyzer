import {
  KEY_DISMISSED_CONTEXT_ALERTS,
  dismissContextAlerts,
  loadDismissedContextAlerts,
} from "./context-alert";

describe("context alert dismissals", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty", () => {
    expect(loadDismissedContextAlerts().size).toBe(0);
  });

  it("persists dismissed ids across loads", () => {
    dismissContextAlerts(new Set(), ["a", "b"]);
    expect([...loadDismissedContextAlerts()].sort()).toEqual(["a", "b"]);
  });

  it("keeps earlier dismissals when adding more", () => {
    const first = dismissContextAlerts(new Set(), ["a"]);
    dismissContextAlerts(first, ["b"]);
    expect([...loadDismissedContextAlerts()].sort()).toEqual(["a", "b"]);
  });

  it("ignores malformed storage", () => {
    localStorage.setItem(KEY_DISMISSED_CONTEXT_ALERTS, "{not json");
    expect(loadDismissedContextAlerts().size).toBe(0);
    localStorage.setItem(KEY_DISMISSED_CONTEXT_ALERTS, JSON.stringify({ a: 1 }));
    expect(loadDismissedContextAlerts().size).toBe(0);
  });
});
