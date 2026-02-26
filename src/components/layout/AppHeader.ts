// ===================================================================
// AppHeader.ts — Pure TypeScript header component
//
// Replaces AppHeader.vue with direct DOM manipulation.
// ===================================================================

import { t, getLocale, setLocale, onLocaleChange } from "@/i18n";
import type { Locale } from "@/i18n";
import router from "@/router";
import { h, clearElement } from "@/utils/dom";
import { icon, Sun, Moon, Github } from "@/utils/icons";

const navItems = [
  { path: "/", key: "app.nav.home" },
  { path: "/revolution", key: "app.nav.revolution" },
  { path: "/matrix", key: "app.nav.matrix" },
  { path: "/graphing", key: "app.nav.graphing" },
  { path: "/derivatives", key: "app.nav.derivatives" },
  { path: "/geometry", key: "app.nav.geometry" },
  { path: "/statistics", key: "app.nav.statistics" },
];

let isDark = false;
let mobileMenuOpen = false;

let headerEl: HTMLElement | null = null;
let desktopNavEl: HTMLElement | null = null;
let mobileNavEl: HTMLElement | null = null;
let localeBtnEl: HTMLButtonElement | null = null;
let themeBtnEl: HTMLButtonElement | null = null;
let hamburgerEl: HTMLButtonElement | null = null;
let logoTextEl: HTMLSpanElement | null = null;

// ---- Theme ----

function initTheme(): void {
  const saved = localStorage.getItem("mathtools-theme");
  if (saved === "dark") {
    isDark = true;
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (saved === "light") {
    isDark = false;
    document.documentElement.setAttribute("data-theme", "light");
  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    isDark = true;
    document.documentElement.setAttribute("data-theme", "dark");
  }
}

function toggleTheme(): void {
  isDark = !isDark;
  document.documentElement.setAttribute(
    "data-theme",
    isDark ? "dark" : "light",
  );
  localStorage.setItem("mathtools-theme", isDark ? "dark" : "light");
  updateThemeButton();
}

function updateThemeButton(): void {
  if (!themeBtnEl) return;
  clearElement(themeBtnEl);
  themeBtnEl.appendChild(icon(isDark ? Sun : Moon, { size: 18 }));
  themeBtnEl.title = isDark ? "Light mode" : "Dark mode";
}

// ---- Locale ----

function toggleLocale(): void {
  const next: Locale = getLocale() === "en" ? "zh" : "en";
  setLocale(next);
}

function updateLocaleButton(): void {
  if (!localeBtnEl) return;
  localeBtnEl.textContent = getLocale() === "en" ? "中" : "EN";
}

// ---- Navigation ----

function navigateTo(path: string): void {
  router.push(path);
  mobileMenuOpen = false;
  updateMobileMenu();
  updateActiveLinks();
}

function updateActiveLinks(): void {
  const currentPath = router.currentPath();

  // Desktop nav links
  if (desktopNavEl) {
    const links = desktopNavEl.querySelectorAll<HTMLElement>(".nav-link");
    links.forEach((link) => {
      const linkPath = link.getAttribute("data-path") || "";
      if (linkPath === currentPath) {
        link.classList.add("nav-link-active");
      } else {
        link.classList.remove("nav-link-active");
      }
    });
  }

  // Mobile nav links
  if (mobileNavEl) {
    const links = mobileNavEl.querySelectorAll<HTMLElement>(".mobile-nav-link");
    links.forEach((link) => {
      const linkPath = link.getAttribute("data-path") || "";
      if (linkPath === currentPath) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });
  }
}

// ---- Mobile menu ----

function toggleMobileMenu(): void {
  mobileMenuOpen = !mobileMenuOpen;
  updateMobileMenu();
}

function updateMobileMenu(): void {
  if (!mobileNavEl || !hamburgerEl) return;

  if (mobileMenuOpen) {
    mobileNavEl.style.display = "flex";
    hamburgerEl.classList.add("active");
    // Trigger transition
    requestAnimationFrame(() => {
      mobileNavEl!.style.opacity = "1";
      mobileNavEl!.style.transform = "translateY(0)";
    });
  } else {
    mobileNavEl.style.opacity = "0";
    mobileNavEl.style.transform = "translateY(-8px)";
    hamburgerEl.classList.remove("active");
    setTimeout(() => {
      if (!mobileMenuOpen && mobileNavEl) {
        mobileNavEl.style.display = "none";
      }
    }, 250);
  }
}

function closeMobileMenuOnClickOutside(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (
    mobileMenuOpen &&
    !target.closest(".mobile-nav") &&
    !target.closest(".hamburger")
  ) {
    mobileMenuOpen = false;
    updateMobileMenu();
  }
}

// ---- Re-render text when locale changes ----

function updateTexts(): void {
  updateLocaleButton();

  if (logoTextEl) {
    logoTextEl.textContent = t("app.title");
  }

  // Desktop nav
  if (desktopNavEl) {
    const links = desktopNavEl.querySelectorAll<HTMLElement>(".nav-link");
    links.forEach((link) => {
      const key = link.getAttribute("data-key") || "";
      link.textContent = t(key);
    });
  }

  // Mobile nav
  if (mobileNavEl) {
    const links = mobileNavEl.querySelectorAll<HTMLElement>(".mobile-nav-link");
    links.forEach((link) => {
      const key = link.getAttribute("data-key") || "";
      link.textContent = t(key);
    });
  }
}

// ---- Build the header DOM ----

function createLogoSvg(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "28");
  svg.setAttribute("height", "28");
  svg.setAttribute("viewBox", "0 0 28 28");
  svg.setAttribute("fill", "none");

  const rect = document.createElementNS(ns, "rect");
  rect.setAttribute("x", "2");
  rect.setAttribute("y", "2");
  rect.setAttribute("width", "24");
  rect.setAttribute("height", "24");
  rect.setAttribute("rx", "6");
  rect.setAttribute("fill", "var(--c-primary)");
  svg.appendChild(rect);

  const textEl = document.createElementNS(ns, "text");
  textEl.setAttribute("x", "14");
  textEl.setAttribute("y", "19");
  textEl.setAttribute("text-anchor", "middle");
  textEl.setAttribute("fill", "white");
  textEl.setAttribute("font-size", "16");
  textEl.setAttribute("font-weight", "700");
  textEl.setAttribute("font-family", "serif");
  textEl.textContent = "∫";
  svg.appendChild(textEl);

  return svg;
}

/**
 * Create and mount the header into the given parent element.
 * Returns a cleanup function.
 */
export function createAppHeader(parent: HTMLElement): () => void {
  initTheme();

  // ---- Logo ----
  const logoSvg = createLogoSvg();
  logoTextEl = h(
    "span",
    { class: "text-[1.15rem] font-bold text-text tracking-tight" },
    t("app.title"),
  );

  const logo = h(
    "div",
    {
      class: "flex items-center gap-2.5 cursor-pointer select-none",
      role: "button",
      tabindex: "0",
      on: {
        click: () => navigateTo("/"),
        keydown: (e: Event) => {
          if ((e as KeyboardEvent).key === "Enter") navigateTo("/");
        },
      },
    },
    h("div", { class: "flex items-center" }, logoSvg as unknown as HTMLElement),
    logoTextEl,
  );

  // ---- Desktop nav ----
  desktopNavEl = h("nav", {
    class: "flex items-center gap-1 hide-mobile",
  });

  for (const item of navItems) {
    const link = h(
      "a",
      {
        class: "nav-link",
        href: "#" + item.path,
        "data-path": item.path,
        "data-key": item.key,
        on: {
          click: (e: Event) => {
            e.preventDefault();
            navigateTo(item.path);
          },
        },
      },
      t(item.key),
    );
    desktopNavEl.appendChild(link);
  }

  // ---- Right actions ----
  localeBtnEl = h("button", {
    class: "header-btn",
    title: t("common.language"),
    on: { click: () => toggleLocale() },
  }) as HTMLButtonElement;
  const localeSpan = h(
    "span",
    { class: "text-[0.78rem] font-bold tracking-wide" },
    getLocale() === "en" ? "中" : "EN",
  );
  localeBtnEl.appendChild(localeSpan);

  themeBtnEl = h("button", {
    class: "header-btn",
    on: { click: () => toggleTheme() },
  }) as HTMLButtonElement;
  updateThemeButton();

  const githubLink = h("a", {
    class: "header-btn",
    href: "https://github.com/Dr1mH4X/Mathtools",
    target: "_blank",
    rel: "noopener noreferrer",
    "aria-label": "GitHub",
    title: "GitHub",
  });
  githubLink.appendChild(icon(Github, { size: 18 }));

  // ---- Hamburger ----
  hamburgerEl = h(
    "button",
    {
      class: "hamburger hide-desktop",
      "aria-label": "Toggle menu",
      on: {
        click: (e: Event) => {
          e.stopPropagation();
          toggleMobileMenu();
        },
      },
    },
    h("span"),
    h("span"),
    h("span"),
  ) as HTMLButtonElement;

  const rightActions = h(
    "div",
    { class: "flex items-center gap-1.5" },
    localeBtnEl,
    themeBtnEl,
    githubLink,
    hamburgerEl,
  );

  // ---- Top bar ----
  const topBar = h(
    "div",
    {
      class:
        "flex items-center justify-between h-[var(--header-height)] px-6 max-w-[1440px] mx-auto",
    },
    logo,
    desktopNavEl,
    rightActions,
  );

  // ---- Mobile nav ----
  mobileNavEl = h("nav", {
    class:
      "flex-col px-4 py-3 border-b border-border bg-bg-soft hide-desktop mobile-nav",
    style: "display: none; opacity: 0; transform: translateY(-8px); transition: all 0.25s ease;",
    on: {
      click: (e: Event) => e.stopPropagation(),
    },
  });

  for (const item of navItems) {
    const link = h(
      "a",
      {
        class: "mobile-nav-link",
        href: "#" + item.path,
        "data-path": item.path,
        "data-key": item.key,
        on: {
          click: (e: Event) => {
            e.preventDefault();
            navigateTo(item.path);
          },
        },
      },
      t(item.key),
    );
    mobileNavEl.appendChild(link);
  }

  // ---- Header root ----
  headerEl = h(
    "header",
    {
      class:
        "sticky top-0 z-50 bg-bg-soft border-b border-border backdrop-blur-[12px]",
    },
    topBar,
    mobileNavEl,
  );

  parent.appendChild(headerEl);

  // Initial state
  updateActiveLinks();

  // ---- Event listeners ----
  const unsubRoute = router.onChange(() => updateActiveLinks());
  const unsubLocale = onLocaleChange(() => updateTexts());
  document.addEventListener("click", closeMobileMenuOnClickOutside);

  // ---- Cleanup ----
  return () => {
    unsubRoute();
    unsubLocale();
    document.removeEventListener("click", closeMobileMenuOnClickOutside);
    if (headerEl && headerEl.parentNode) {
      headerEl.parentNode.removeChild(headerEl);
    }
    headerEl = null;
    desktopNavEl = null;
    mobileNavEl = null;
    localeBtnEl = null;
    themeBtnEl = null;
    hamburgerEl = null;
    logoTextEl = null;
  };
}
