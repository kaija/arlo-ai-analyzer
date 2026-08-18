import { HashRouter, Routes, Route } from "react-router-dom";
import { Nav } from "./components/Nav";
import Overview from "./pages/Overview";
import ToolDetail from "./pages/ToolDetail";
import ProjectDetail from "./pages/ProjectDetail";

export function AppRouter() {
  return (
    <HashRouter>
      <Nav />
      <main className="content">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/tool/:tool" element={<ToolDetail />} />
          <Route path="/project/:project" element={<ProjectDetail />} />
        </Routes>
      </main>
    </HashRouter>
  );
}
