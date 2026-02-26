// ===================================================================
// PlaceholderPage.ts — Pure TypeScript placeholder page
//
// Replaces PlaceholderPage.vue with direct DOM manipulation.
// Shows a "coming soon" message for pages not yet implemented.
// ===================================================================

import { t, onLocaleChange } from "@/i18n";
import router from "@/router";
import { h, clearElement } from "@/utils/dom";

/**
 * Mount the Placeholder page into the given container.
 * Returns a cleanup function.
 */
export function mountPlaceholderPage(container: HTMLElement): () => void {
  const root = h("div", {
    class:
      "flex-1 flex items-center justify-center px-6 py-12 min-h-[calc(100vh-var(--header-height)-80px)]",
  });

  function getTitleKey(): string {
    const route = router.currentRoute();
    return (route?.meta?.titleKey as string) || "app.title";
  }

  function render(): void {
    clearElement(root);

    const titleKey = getTitleKey();

    // Emoji icon
    const emojiEl = h(
      "div",
      {
        class:
          "text-[4rem] mb-6 leading-none animate-bounce-slow",
      },
      "🚧",
    );

    // Title
    const titleEl = h(
      "h1",
      {
        class:
          "text-[1.8rem] font-bold text-text mb-2 tracking-tight",
      },
      t(titleKey),
    );

    // Coming soon badge
    const comingSoonEl = h(
      "p",
      {
        class: "text-[1.1rem] text-warning font-semibold mb-6",
      },
      t("home.comingSoon"),
    );

    // Divider
    const divider = h(
      "div",
      { class: "flex items-center justify-center gap-3 mb-6" },
      h("div", { class: "w-12 h-0.5 bg-border rounded-xs" }),
      h("div", { class: "w-1.5 h-1.5 bg-primary rounded-full" }),
      h("div", { class: "w-12 h-0.5 bg-border rounded-xs" }),
    );

    // Subtitle
    const subtitleEl = h(
      "p",
      {
        class: "text-[0.9rem] text-text-muted mb-8 leading-relaxed",
      },
      t("app.subtitle"),
    );

    // Back button SVG arrow
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", "19");
    line.setAttribute("y1", "12");
    line.setAttribute("x2", "5");
    line.setAttribute("y2", "12");
    svg.appendChild(line);

    const polyline = document.createElementNS(ns, "polyline");
    polyline.setAttribute("points", "12 19 5 12 12 5");
    svg.appendChild(polyline);

    // Back button
    const backBtn = h(
      "button",
      {
        class: "btn btn-primary",
        on: {
          click: () => router.push("/"),
        },
      },
      svg as unknown as HTMLElement,
      h("span", null, t("app.nav.home")),
    );

    const innerContainer = h(
      "div",
      { class: "text-center max-w-[420px]" },
      emojiEl,
      titleEl,
      comingSoonEl,
      divider,
      subtitleEl,
      backBtn,
    );

    root.appendChild(innerContainer);
  }

  render();
  container.appendChild(root);

  // Re-render on locale change
  const unsubLocale = onLocaleChange(() => render());

  // Re-render on route change (title key may differ)
  const unsubRoute = router.onChange(() => render());

  return () => {
    unsubLocale();
    unsubRoute();
    if (root.parentNode) {
      root.parentNode.removeChild(root);
    }
  };
}
