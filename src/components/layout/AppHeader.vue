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
        isDark.value ? "dark" : "light",
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
    <header
        class="sticky top-0 z-50 bg-bg-soft border-b border-border backdrop-blur-[12px]"
    >
        <div
            class="flex items-center justify-between h-[var(--header-height)] px-6 max-w-[1440px] mx-auto"
        >
            <!-- Logo -->
            <div
                class="flex items-center gap-2.5 cursor-pointer select-none"
                @click="navigateTo('/')"
                role="button"
                tabindex="0"
            >
                <div class="flex items-center">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                        <rect
                            x="2"
                            y="2"
                            width="24"
                            height="24"
                            rx="6"
                            fill="var(--c-primary)"
                        />
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
                <span
                    class="text-[1.15rem] font-bold text-text tracking-tight"
                    >{{ t("app.title") }}</span
                >
            </div>

            <!-- Desktop Nav -->
            <nav class="flex items-center gap-1 hide-mobile">
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

            <!-- Right actions -->
            <div class="flex items-center gap-1.5">
                <button
                    class="header-btn"
                    :title="t('common.language')"
                    @click="toggleLocale"
                >
                    <span class="text-[0.78rem] font-bold tracking-wide">{{
                        currentLocale === "en" ? "中" : "EN"
                    }}</span>
                </button>

                <button
                    class="header-btn"
                    :title="isDark ? 'Light mode' : 'Dark mode'"
                    @click="toggleTheme"
                >
                    <Sun v-if="isDark" :size="18" />
                    <Moon v-else :size="18" />
                </button>

                <a
                    class="header-btn"
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

        <!-- Mobile Nav -->
        <transition name="slide-down">
            <nav
                v-if="mobileMenuOpen"
                class="flex flex-col px-4 py-3 border-b border-border bg-bg-soft hide-desktop"
                @click.stop
            >
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
@reference "../../style.css";

/* --- Nav links --- */
.nav-link {
    @apply px-3.5 py-1.5 text-[0.85rem] font-medium text-text-soft
           rounded-sm no-underline transition-all duration-200 ease-in-out;
}
.nav-link:hover {
    @apply text-text bg-bg-hover;
}
.nav-link-active {
    @apply !text-primary bg-primary-bg;
}

/* --- Header icon buttons --- */
.header-btn {
    @apply inline-flex items-center justify-center w-9 h-9
           border border-border rounded-sm bg-bg-soft text-text-soft
           cursor-pointer p-0 transition-all duration-200 ease-in-out;
}
.header-btn:hover {
    @apply bg-bg-hover text-text border-text-muted;
}

/* --- Hamburger --- */
.hamburger {
    @apply flex flex-col justify-center items-center gap-[5px]
           w-9 h-9 border border-border rounded-sm bg-bg-soft
           cursor-pointer p-0 transition-all duration-200 ease-in-out;
}
.hamburger span {
    @apply block w-[18px] h-0.5 bg-text-soft rounded-xs;
    transition: all 0.25s ease;
}
.hamburger.active span:nth-child(1) {
    transform: translateY(7px) rotate(45deg);
}
.hamburger.active span:nth-child(2) {
    @apply opacity-0;
}
.hamburger.active span:nth-child(3) {
    transform: translateY(-7px) rotate(-45deg);
}

/* --- Mobile nav links --- */
.mobile-nav-link {
    @apply px-4 py-3 text-[0.9rem] font-medium text-text-soft
           rounded-sm cursor-pointer no-underline
           transition-all duration-200 ease-in-out;
}
.mobile-nav-link:hover,
.mobile-nav-link.active {
    @apply text-primary bg-primary-bg;
}

/* --- Slide-down transition --- */
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
