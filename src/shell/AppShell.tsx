import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

// ---------------------------------------------------------------------------
// AppShell
//
// Outer layout wrapper for all five pages. Composes Sidebar, Topbar, and the
// scrollable content region. Uses react-router-dom's <Outlet /> so that the
// five page routes render inside `.content-scroll`.
// ---------------------------------------------------------------------------

export function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />

      <div className="main-col">
        {/* Spacer for the macOS/Tauri window titlebar */}
        <div className="titlebar-spacer" aria-hidden="true" />

        <Topbar />

        <main className="content-scroll" aria-label="Page content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
