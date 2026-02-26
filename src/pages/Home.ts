// ===================================================================
// Home.ts — Pure TypeScript Home page
//
// Replaces Home.vue with direct DOM manipulation.
// ===================================================================

import { t, onLocaleChange } from "@/i18n";
import router from "@/router";
import { h, clearElement } from "@/utils/dom";
import {
  icon,
  ArrowRight,
  ChevronRight,
  RefreshCw,
  Calculator,
  LineChart,
  FunctionSquare,
  Ruler,
  BarChart3,
} from "@/utils/icons";
import type { IconNode } from "@/utils/icons";

interface ToolCard {
  path: string;
  nameKey: string;
  icon: IconNode;
  descKey: string;
  ready: boolean;
}

const tools: ToolCard[] = [
  {
    path: "/revolution",
    nameKey: "app.nav.revolution",
    icon: RefreshCw,
    descKey: "revolution.description",
    ready: true,
  },
  {
    path: "/matrix",
    nameKey: "app.nav.matrix",
    icon: Calculator,
    descKey: "",
    ready: false,
  },
  {
    path: "/graphing",
    nameKey: "app.nav.graphing",
    icon: LineChart,
    descKey: "",
    ready: false,
  },
  {
    path: "/derivatives",
    nameKey: "app.nav.derivatives",
    icon: FunctionSquare,
    descKey: "",
    ready: false,
  },
  {
    path: "/geometry",
    nameKey: "app.nav.geometry",
    icon: Ruler,
    descKey: "",
    ready: false,
  },
  {
    path: "/statistics",
    nameKey: "app.nav.statistics",
    icon: BarChart3,
    descKey: "",
    ready: false,
  },
];

function goTo(tool: ToolCard): void {
  router.push(tool.path);
}

function buildHeroSection(): HTMLElement {
  // Background blobs
  const blob1 = h("div", {
    class:
      "hero-circle absolute w-[400px] h-[400px] bg-primary rounded-full opacity-12 blur-[60px] -top-[120px] -left-[80px] animate-float",
  });
  const blob2 = h("div", {
    class:
      "hero-circle absolute w-[300px] h-[300px] bg-accent rounded-full opacity-12 blur-[60px] -top-[40px] -right-[60px] animate-float-reverse",
  });
  const blob3 = h("div", {
    class:
      "hero-circle absolute w-[200px] h-[200px] bg-success rounded-full opacity-12 blur-[60px] -bottom-[40px] left-[40%] animate-float-delayed",
  });

  const bgBlobs = h(
    "div",
    { class: "absolute inset-0 pointer-events-none overflow-hidden" },
    blob1,
    blob2,
    blob3,
  );

  const heroTitle = h(
    "h1",
    {
      class:
        "text-[2.8rem] max-md:text-[2rem] font-extrabold tracking-tight leading-[1.15] mb-4 hero-title-gradient",
    },
    t("home.hero"),
  );

  const heroDesc = h(
    "p",
    {
      class:
        "text-[1.1rem] max-md:text-[0.95rem] text-text-soft max-w-[540px] mx-auto mb-8 leading-relaxed",
    },
    t("home.heroDesc"),
  );

  const arrowIcon = icon(ArrowRight, { size: 16 });
  const heroBtn = h(
    "button",
    {
      class: "btn btn-primary px-7 py-3 text-base gap-2.5",
      on: {
        click: () => goTo(tools[0]!),
      },
    },
    h("span", null, t("app.nav.revolution")),
    arrowIcon as unknown as HTMLElement,
  );

  const heroContent = h(
    "div",
    { class: "relative z-[1]" },
    heroTitle,
    heroDesc,
    heroBtn,
  );

  return h(
    "section",
    {
      class: "relative py-20 max-md:py-12 text-center overflow-hidden",
    },
    bgBlobs,
    heroContent,
  );
}

function buildToolCard(tool: ToolCard): HTMLElement {
  const iconContainer = h(
    "div",
    {
      class:
        "flex items-center justify-center w-[52px] h-[52px] text-primary bg-bg rounded-md shrink-0",
    },
    icon(tool.icon, { size: 24 }) as unknown as HTMLElement,
  );

  const nameEl = h(
    "h3",
    {
      class:
        "text-[0.95rem] font-semibold text-text flex items-center gap-2.5 flex-wrap",
      "data-name-key": tool.nameKey,
    },
    t(tool.nameKey),
    !tool.ready
      ? h(
          "span",
          { class: "badge badge-warning", "data-badge-key": "home.comingSoon" },
          t("home.comingSoon"),
        )
      : null,
  );

  const descEl =
    tool.descKey && tool.ready
      ? h(
          "p",
          {
            class:
              "text-[0.82rem] text-text-soft mt-1 leading-normal line-clamp-2",
            "data-desc-key": tool.descKey,
          },
          t(tool.descKey),
        )
      : null;

  const textBlock = h(
    "div",
    { class: "flex-1 min-w-0" },
    nameEl,
    descEl,
  );

  const arrowEl = h(
    "div",
    { class: "tool-card__arrow text-text-muted shrink-0" },
    icon(ChevronRight, { size: 18 }) as unknown as HTMLElement,
  );

  const card = h(
    "div",
    {
      class:
        "card tool-card" + (!tool.ready ? " tool-card--disabled" : ""),
      role: "button",
      tabindex: "0",
      on: {
        click: () => goTo(tool),
        keydown: (e: Event) => {
          if ((e as KeyboardEvent).key === "Enter") goTo(tool);
        },
      },
    },
    iconContainer,
    textBlock,
    arrowEl,
  );

  return card;
}

function buildToolsSection(): HTMLElement {
  const heading = h(
    "h2",
    { class: "text-[1.3rem] font-bold mb-6 text-text", "data-key": "home.tools" },
    t("home.tools"),
  );

  const grid = h("div", {
    class:
      "grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] max-md:grid-cols-1 gap-4",
  });

  for (const tool of tools) {
    grid.appendChild(buildToolCard(tool));
  }

  return h("section", { class: "pt-4" }, heading, grid);
}

/**
 * Mount the Home page into the given container.
 * Returns a cleanup function.
 */
export function mountHomePage(container: HTMLElement): () => void {
  const root = h(
    "div",
    { class: "flex-1 max-w-[1100px] mx-auto px-6 pb-16 w-full" },
  );

  function render(): void {
    clearElement(root);
    root.appendChild(buildHeroSection());
    root.appendChild(buildToolsSection());
  }

  render();
  container.appendChild(root);

  const unsubLocale = onLocaleChange(() => render());

  return () => {
    unsubLocale();
    if (root.parentNode) {
      root.parentNode.removeChild(root);
    }
  };
}
