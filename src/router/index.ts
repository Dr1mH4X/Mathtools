// ===================================================================
// Pure TypeScript Hash-based SPA Router
// Replaces vue-router with a minimal implementation.
// ===================================================================

export interface Route {
  path: string;
  name: string;
  meta?: Record<string, unknown>;
}

export interface RouterInstance {
  currentPath: () => string;
  currentRoute: () => Route | null;
  push: (path: string) => void;
  onChange: (fn: (route: Route | null) => void) => () => void;
}

const routes: Route[] = [
  { path: "/", name: "Home" },
  { path: "/revolution", name: "Revolution" },
  {
    path: "/matrix",
    name: "Matrix",
    meta: { titleKey: "app.nav.matrix" },
  },
  {
    path: "/graphing",
    name: "Graphing",
    meta: { titleKey: "app.nav.graphing" },
  },
  {
    path: "/derivatives",
    name: "Derivatives",
    meta: { titleKey: "app.nav.derivatives" },
  },
  {
    path: "/geometry",
    name: "Geometry",
    meta: { titleKey: "app.nav.geometry" },
  },
  {
    path: "/statistics",
    name: "Statistics",
    meta: { titleKey: "app.nav.statistics" },
  },
];

const listeners: Array<(route: Route | null) => void> = [];

function hashToPath(hash: string): string {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  return h || "/";
}

function findRoute(path: string): Route | null {
  return routes.find((r) => r.path === path) ?? null;
}

function currentPath(): string {
  return hashToPath(window.location.hash);
}

function currentRoute(): Route | null {
  return findRoute(currentPath());
}

function push(path: string): void {
  window.location.hash = path;
}

function onChange(fn: (route: Route | null) => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notify(): void {
  const route = currentRoute();
  for (const fn of listeners) {
    fn(route);
  }
}

// Redirect unknown routes to home
function handleHashChange(): void {
  const path = currentPath();
  const route = findRoute(path);
  if (!route) {
    push("/");
    return;
  }
  notify();
}

// Initialize
window.addEventListener("hashchange", handleHashChange);

// Ensure initial hash is set
if (!window.location.hash) {
  window.location.hash = "/";
}

const router: RouterInstance = {
  currentPath,
  currentRoute,
  push,
  onChange,
};

export default router;
