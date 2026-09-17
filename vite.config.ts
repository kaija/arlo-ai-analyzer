import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM);

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: isTauriBuild
      ? {}
      : {
          // In plain Vite dev mode (no Tauri runtime), substitute the real
          // Tauri API modules with a browser-compatible mock so the app can
          // render with fixture data instead of showing the empty state.
          "@tauri-apps/api/core": path.resolve(__dirname, "src/tauri-mock.ts"),
          "@tauri-apps/api/event": path.resolve(__dirname, "src/tauri-mock.ts"),
          "@tauri-apps/plugin-opener": path.resolve(__dirname, "src/tauri-mock.ts"),
        },
  },

  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
