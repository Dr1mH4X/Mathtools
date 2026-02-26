import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import AppHeader from "@/components/layout/AppHeader";
import Home from "@/pages/Home";
import RevolutionVolume from "@/pages/RevolutionVolume";
import PlaceholderPage from "@/pages/PlaceholderPage";
import { useSEO } from "@/composables/useSEO";

function AppContent() {
  useSEO();

  return (
    <div className="min-h-screen h-screen flex flex-col overflow-hidden bg-bg text-text transition-colors duration-200">
      <AppHeader />
      <main className="flex-1 min-h-0 overflow-hidden relative">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/revolution" element={<RevolutionVolume />} />
          <Route
            path="/matrix"
            element={<PlaceholderPage titleKey="app.nav.matrix" />}
          />
          <Route
            path="/graphing"
            element={<PlaceholderPage titleKey="app.nav.graphing" />}
          />
          <Route
            path="/derivatives"
            element={<PlaceholderPage titleKey="app.nav.derivatives" />}
          />
          <Route
            path="/geometry"
            element={<PlaceholderPage titleKey="app.nav.geometry" />}
          />
          <Route
            path="/statistics"
            element={<PlaceholderPage titleKey="app.nav.statistics" />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
