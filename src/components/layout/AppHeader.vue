<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { setLocale, getLocale } from "@/i18n";
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { Sun, Moon, Github } from "lucide-vue-next";

const { t } = useI18n();
const router = useRouter();

const currentLocale = ref(getLocale());
const isDark = ref(false);
const mobileMenuOpen = ref(false);

function toggleLocale() {
  const next = currentLocale.value === "en" ? "zh" : "en";
  setLocale(next as "en" | "zh");
  currentLocale.value = next;
}

function toggleTheme() {
  isDark.value = !isDark.value;
  document.documentElement.setAttribute(
    "data-theme",
    isDark.value ? "dark" : "light"
  );
  localStorage.setItem("mathtools-theme", isDark.value ? "dark" : "light");
}

function initTheme() {
  const saved = localStorage.getItem("mathtools-theme");
  if (saved === "dark") {
    isDark.value = true;
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (saved === "light") {
    isDark.value = false;
    document.documentElement.setAttribute("data-theme", "light");
  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    isDark.value = true;
    document.documentElement.setAttribute("data-theme", "dark");
  }
}

function navigateTo(path: string) {
  router.push(path);
  mobileMenuOpen.value = false;
}

function closeMobileMenu(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest(".mobile-nav") && !target.closest(".hamburger")) {
    mobileMenuOpen.value = false;
  }
}

onMounted(() => {
  initTheme();
  document.addEventListener("click", closeMobileMenu);
});

onUnmounted(() => {
  document.removeEventListener("click", closeMobileMenu);
});

const navItems = [
  { path: "/", key: "app.nav.home" },
  { path: "/revolution", key: "app.nav.revolution" },
  { path: "/matrix", key: "app.nav.matrix" },
  { path: "/graphing", key: "app.nav.graphing" },
  { path: "/derivatives", key: "app.nav.derivatives" },
  { path: "/geometry", key: "app.nav.geometry" },
  { path: "/statistics", key: "app.nav.statistics" },
];
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <div class="header-left" @click="navigateTo('/')" role="button" tabindex="0">
        <div class="logo-icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect x="2" y="2" width="24" height="24" rx="6" fill="var(--c-primary)" />
            <text
              x="14"
              y="19"
              text-anchor="middle"
              fill="white"
              font-size="16"
              font-weight="700"
              font-family="serif"
            >
              ∫
            </text>
          </svg>
        </div>
        <span class="logo-text">{{ t("app.title") }}</span>
      </div>

      <nav class="header-nav hide-mobile">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-link"
          active-class="nav-link-active"
          :class="{ 'nav-link-active': $route.path === item.path }"
        >
          {{ t(item.key) }}
        </router-link>
      </nav>

      <div class="header-right">
        <button
          class="btn-icon header-btn"
          :title="t('common.language')"
          @click="toggleLocale"
        >
          <span class="locale-badge">{{ currentLocale === "en" ? "中" : "EN" }}</span>
        </button>

        <button
          class="btn-icon header-btn"
          :title="isDark ? 'Light mode' : 'Dark mode'"
          @click="toggleTheme"
        >
          <Sun v-if="isDark" :size="18" />
          <Moon v-else :size="18" />
        </button>

        <a
          class="btn-icon header-btn"
          href="https://github.com/Dr1mH4X/Mathtools"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          title="GitHub"
        >
          <Github :size="18" />
        </a>

        <button
          class="hamburger hide-desktop"
          :class="{ active: mobileMenuOpen }"
          @click.stop="mobileMenuOpen = !mobileMenuOpen"
          aria-label="Toggle menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </div>

    <transition name="slide-down">
      <nav v-if="mobileMenuOpen" class="mobile-nav hide-desktop" @click.stop>
        <a
          v-for="item in navItems"
          :key="item.path"
          class="mobile-nav-link"
          :class="{ active: $route.path === item.path }"
          @click="navigateTo(item.path)"
        >
          {{ t(item.key) }}
        </a>
      </nav>
    </transition>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--c-bg-soft);
  border-bottom: 1px solid var(--c-border);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding: 0 24px;
  max-width: 1440px;
  margin: 0 auto;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.logo-icon {
  display: flex;
  align-items: center;
}

.logo-text {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--c-text);
  letter-spacing: -0.02em;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-link {
  padding: 6px 14px;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--c-text-soft);
  border-radius: var(--radius-sm);
  transition: all var(--transition);
  text-decoration: none;
}

.nav-link:hover {
  color: var(--c-text);
  background: var(--c-bg-hover);
}

.nav-link-active {
  color: var(--c-primary) !important;
  background: var(--c-primary-bg);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  background: var(--c-bg-soft);
  color: var(--c-text-soft);
  cursor: pointer;
  transition: all var(--transition);
  padding: 0;
}

.header-btn:hover {
  background: var(--c-bg-hover);
  color: var(--c-text);
  border-color: var(--c-text-muted);
}

.locale-badge {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

/* Hamburger */
.hamburger {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 5px;
  width: 36px;
  height: 36px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  background: var(--c-bg-soft);
  cursor: pointer;
  padding: 0;
  transition: all var(--transition);
}

.hamburger span {
  display: block;
  width: 18px;
  height: 2px;
  background: var(--c-text-soft);
  border-radius: 1px;
  transition: all 0.25s ease;
}

.hamburger.active span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}

.hamburger.active span:nth-child(2) {
  opacity: 0;
}

.hamburger.active span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

/* Mobile nav */
.mobile-nav {
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
  border-bottom: 1px solid var(--c-border);
  background: var(--c-bg-soft);
}

.mobile-nav-link {
  padding: 12px 16px;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--c-text-soft);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition);
  text-decoration: none;
}

.mobile-nav-link:hover,
.mobile-nav-link.active {
  color: var(--c-primary);
  background: var(--c-primary-bg);
}

/* Slide down animation */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
