// ===================================================================
// main.ts — Pure TypeScript application entry point
//
// Replaces the Vue-based entry with a simple DOM-based SPA bootstrap.
// ===================================================================

import { createAppHeader } from "@/components/layout/AppHeader";
import { initSEO } from "@/composables/useSEO";
import router from "@/router";
import { mountHomePage } from "@/pages/Home";
import { mountPlaceholderPage } from "@/pages/PlaceholderPage";
import { mountRevolutionVolumePage } from "@/pages/RevolutionVolume";
import { clearElement, fadeIn } from "@/utils/dom";
import "katex/dist/katex.min.css";
import "./style.css";

// ---- App root ----

const appEl = document.getElementById("app");
if (!appEl) throw new Error("#app element not found");

// Flex column layout matching the original Vue App.vue
appEl.className = "min-h-screen h-screen flex flex-col overflow-hidden";

// ---- Header ----

const cleanupHeader = createAppHeader(appEl);

// ---- Main content area ----

const mainEl = document.createElement("main");
mainEl.className = "flex-1 min-h-0 overflow-hidden";
appEl.appendChild(mainEl);

// ---- SEO ----

const cleanupSEO = initSEO();

// ---- Page routing ----

// Map of route names to their mount functions.
// Each mount function receives a container element and returns a cleanup function.
type PageMountFn = (container: HTMLElement) => () => void;

const pageMap: Record<string, PageMountFn> = {
  Home: mountHomePage,
  Revolution: mountRevolutionVolumePage,
  Matrix: mountPlaceholderPage,
  Graphing: mountPlaceholderPage,
  Derivatives: mountPlaceholderPage,
  Geometry: mountPlaceholderPage,
  Statistics: mountPlaceholderPage,
};

let currentPageCleanup: (() => void) | null = null;

function renderPage(): void {
  // Cleanup previous page
  if (currentPageCleanup) {
    currentPageCleanup();
    currentPageCleanup = null;
  }
  clearElement(mainEl);

  const route = router.currentRoute();
  const routeName = route?.name ?? "Home";
  const mountFn = pageMap[routeName] ?? mountHomePage;

  currentPageCleanup = mountFn(mainEl);

  // Simple fade-in transition (matches the original Vue <transition name="fade">)
  fadeIn(mainEl, 200);
}

// Listen for route changes
router.onChange(() => {
  renderPage();
});

// Initial render
renderPage();

// ---- Cleanup (for HMR or testing) ----

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (currentPageCleanup) {
      currentPageCleanup();
      currentPageCleanup = null;
    }
    cleanupHeader();
    cleanupSEO();
  });
}
