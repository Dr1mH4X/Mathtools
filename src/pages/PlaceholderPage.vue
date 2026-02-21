<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { computed } from "vue";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const titleKey = computed(() => {
    return (route.meta.titleKey as string) || "app.title";
});
</script>

<template>
    <div
        class="flex-1 flex items-center justify-center px-6 py-12 min-h-[calc(100vh-var(--header-height)-80px)]"
    >
        <div class="text-center max-w-[420px]">
            <div class="text-[4rem] mb-6 leading-none animate-bounce-slow">
                🚧
            </div>
            <h1 class="text-[1.8rem] font-bold text-text mb-2 tracking-tight">
                {{ t(titleKey) }}
            </h1>
            <p class="text-[1.1rem] text-warning font-semibold mb-6">
                {{ t("home.comingSoon") }}
            </p>
            <div class="flex items-center justify-center gap-3 mb-6">
                <div class="w-12 h-0.5 bg-border rounded-xs"></div>
                <div class="w-1.5 h-1.5 bg-primary rounded-full"></div>
                <div class="w-12 h-0.5 bg-border rounded-xs"></div>
            </div>
            <p class="text-[0.9rem] text-text-muted mb-8 leading-relaxed">
                {{ t("app.subtitle") }}
            </p>
            <button class="btn btn-primary" @click="router.push('/')">
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                </svg>
                <span>{{ t("app.nav.home") }}</span>
            </button>
        </div>
    </div>
</template>

<style scoped>
@keyframes bounce-slow {
    0%,
    100% {
        transform: translateY(0);
    }
    50% {
        transform: translateY(-10px);
    }
}
.animate-bounce-slow {
    animation: bounce-slow 2s ease-in-out infinite;
}
</style>
