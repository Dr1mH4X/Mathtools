import { watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

export interface SEOOptions {
  titleKey?: string;
  descriptionKey?: string;
  keywords?: string;
}

export function useSEO(options?: SEOOptions) {
  const { t, locale } = useI18n();
  const route = useRoute();

  watchEffect(() => {
    // 1. Update Document Title
    const baseTitle = t("app.title");
    let pageTitle = "";

    if (options?.titleKey) {
      pageTitle = t(options.titleKey);
    } else if (route?.meta?.titleKey) {
      pageTitle = t(route.meta.titleKey as string);
    } else if (route?.name === "Revolution") {
      pageTitle = t("revolution.title");
    } else if (route?.name === "Home") {
      pageTitle = t("app.subtitle");
    }

    document.title =
      pageTitle && pageTitle !== baseTitle
        ? `${pageTitle} - ${baseTitle}`
        : baseTitle;

    // 2. Update Meta Description
    let description = "";
    if (options?.descriptionKey) {
      description = t(options.descriptionKey);
    } else if (route?.name === "Revolution") {
      description = t("revolution.description");
    } else {
      description = t("home.heroDesc");
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
        locale.value === "zh"
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
    document.documentElement.setAttribute("lang", locale.value);
  });
}
