import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "@/i18n";

export interface SEOOptions {
  titleKey?: string;
  descriptionKey?: string;
  keywords?: string;
}

/**
 * Check whether we are running in a browser environment.
 * Guards against runtime errors when the hook is used during
 * SSR, unit tests, or any other non-browser context.
 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

const routeMetaMap: Record<string, { titleKey: string; descKey?: string }> = {
  "/": { titleKey: "app.subtitle", descKey: "home.heroDesc" },
  "/revolution": {
    titleKey: "revolution.title",
    descKey: "revolution.description",
  },
  "/matrix": { titleKey: "app.nav.matrix" },
  "/graphing": { titleKey: "app.nav.graphing" },
  "/derivatives": { titleKey: "app.nav.derivatives" },
  "/geometry": { titleKey: "app.nav.geometry" },
  "/statistics": { titleKey: "app.nav.statistics" },
};

/**
 * React hook to manage SEO meta tags based on the current route and locale.
 * Call this hook once in your root App component.
 */
export function useSEO(options?: SEOOptions) {
  const location = useLocation();
  const { t, locale } = useTranslation();

  useEffect(() => {
    if (!isBrowser()) return;

    const path = location.pathname;
    const routeMeta = routeMetaMap[path] || { titleKey: "app.title" };

    // 1. Update Document Title
    const baseTitle = t("app.title", "MathTools");
    let pageTitle = "";

    if (options?.titleKey) {
      pageTitle = t(options.titleKey);
    } else if (routeMeta.titleKey && routeMeta.titleKey !== "app.title") {
      pageTitle = t(routeMeta.titleKey);
    }

    document.title =
      pageTitle && pageTitle !== baseTitle
        ? `${pageTitle} - ${baseTitle}`
        : baseTitle;

    // 2. Update Meta Description
    let description = "";
    if (options?.descriptionKey) {
      description = t(options.descriptionKey);
    } else if (routeMeta.descKey) {
      description = t(routeMeta.descKey);
    } else {
      description = t("home.heroDesc", "Interactive Math Tools");
    }

    if (description) {
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement("meta");
        metaDesc.setAttribute("name", "description");
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute("content", description);
    }

    // 3. Update Meta Keywords (Bilingual Support)
    let keywords = options?.keywords;
    if (!keywords) {
      keywords =
        locale === "zh"
          ? "数学工具, 可视化, 旋转体体积, 交互式数学, 3D数学, 微积分, 函数绘图, MathTools"
          : "math tools, visualization, volume of revolution, interactive math, 3D math, calculus, function graphing, MathTools";
    }

    if (keywords) {
      let metaKeywords = document.querySelector('meta[name="keywords"]');
      if (!metaKeywords) {
        metaKeywords = document.createElement("meta");
        metaKeywords.setAttribute("name", "keywords");
        document.head.appendChild(metaKeywords);
      }
      metaKeywords.setAttribute("content", keywords);
    }

    // 4. Update Open Graph Tags
    const updateMetaTag = (property: string, content: string) => {
      let tag = document.querySelector(`meta[property="${property}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("property", property);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };

    const updateNameMetaTag = (name: string, content: string) => {
      let tag = document.querySelector(`meta[name="${name}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", name);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };

    updateMetaTag("og:title", document.title);
    if (description) {
      updateMetaTag("og:description", description);
    }
    updateMetaTag("og:type", "website");
    updateMetaTag("og:url", window.location.href);

    updateNameMetaTag("twitter:card", "summary");
    updateNameMetaTag("twitter:title", document.title);
    if (description) {
      updateNameMetaTag("twitter:description", description);
    }

    // 5. Update HTML lang attribute for SEO
    document.documentElement.setAttribute("lang", locale);
  }, [location.pathname, locale, options]);
}

/**
 * @deprecated Use the `useSEO` hook inside your React component tree instead.
 * This is kept as a no-op to prevent breaking existing imports during migration.
 */
export function initSEO() {
  // No-op
}
