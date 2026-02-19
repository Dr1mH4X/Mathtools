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
  <div class="placeholder-page">
    <div class="placeholder-content">
      <div class="placeholder-icon">🚧</div>
      <h1 class="placeholder-title">{{ t(titleKey) }}</h1>
      <p class="placeholder-desc">{{ t("home.comingSoon") }}</p>
      <div class="placeholder-decoration">
        <div class="deco-line"></div>
        <div class="deco-dot"></div>
        <div class="deco-line"></div>
      </div>
      <p class="placeholder-hint text-muted">
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
.placeholder-page {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  min-height: calc(100vh - var(--header-height) - 80px);
}

.placeholder-content {
  text-align: center;
  max-width: 420px;
}

.placeholder-icon {
  font-size: 4rem;
  margin-bottom: 24px;
  line-height: 1;
  animation: bounce 2s ease-in-out infinite;
}

@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.placeholder-title {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--c-text);
  margin-bottom: 8px;
  letter-spacing: -0.02em;
}

.placeholder-desc {
  font-size: 1.1rem;
  color: var(--c-warning);
  font-weight: 600;
  margin-bottom: 24px;
}

.placeholder-decoration {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 24px;
}

.deco-line {
  width: 48px;
  height: 2px;
  background: var(--c-border);
  border-radius: 1px;
}

.deco-dot {
  width: 6px;
  height: 6px;
  background: var(--c-primary);
  border-radius: 50%;
}

.placeholder-hint {
  font-size: 0.9rem;
  margin-bottom: 32px;
  line-height: 1.6;
}
</style>
