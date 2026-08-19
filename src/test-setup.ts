import "@testing-library/jest-dom";

// jsdom does not implement window.matchMedia. Provide a minimal stub so that
// SettingsContext (and any other code that reads prefers-color-scheme) works
// in the test environment.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
