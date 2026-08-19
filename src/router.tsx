import { HashRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./shell/AppShell";
import DashboardPage from "./pages/Dashboard";
import SessionsPage from "./pages/Sessions";
import SessionDetailPage from "./pages/SessionDetail";
import InsightsPage from "./pages/Insights";
import SettingsPage from "./pages/Settings";

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
