<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import {
  ArrowRight,
  ChevronRight,
  RefreshCw,
  Calculator,
  LineChart,
  FunctionSquare,
  Ruler,
  BarChart3,
} from "lucide-vue-next";

const { t } = useI18n();
const router = useRouter();

interface ToolCard {
  path: string;
  nameKey: string;
  icon: any;
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

function goTo(tool: ToolCard) {
  router.push(tool.path);
}
</script>

<template>
  <div class="home-page">
    <section class="hero">
      <div class="hero-bg">
        <div class="hero-circle c1"></div>
        <div class="hero-circle c2"></div>
        <div class="hero-circle c3"></div>
      </div>
      <div class="hero-content">
        <h1 class="hero-title">{{ t("home.hero") }}</h1>
        <p class="hero-desc">{{ t("home.heroDesc") }}</p>
        <button class="btn btn-primary hero-cta" @click="goTo(tools[0]!)">
          <span>{{ t("app.nav.revolution") }}</span>
          <ArrowRight :size="16" />
        </button>
      </div>
    </section>

    <section class="tools-section">
      <h2 class="section-title">{{ t("home.tools") }}</h2>
      <div class="tools-grid">
        <div
          v-for="tool in tools"
          :key="tool.path"
          class="tool-card card"
          :class="{ 'tool-card--disabled': !tool.ready }"
          @click="goTo(tool)"
          role="button"
          tabindex="0"
          @keydown.enter="goTo(tool)"
        >
          <div class="tool-card__icon">
            <component :is="tool.icon" :size="24" />
          </div>
          <div class="tool-card__body">
            <h3 class="tool-card__name">
              {{ t(tool.nameKey) }}
              <span v-if="!tool.ready" class="badge badge-warning">
                {{ t("home.comingSoon") }}
              </span>
            </h3>
            <p v-if="tool.descKey && tool.ready" class="tool-card__desc text-soft">
              {{ t(tool.descKey) }}
            </p>
          </div>
          <div class="tool-card__arrow">
            <ChevronRight :size="18" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home-page {
  flex: 1;
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px 64px;
  width: 100%;
}

/* ===== Hero ===== */
.hero {
  position: relative;
  padding: 80px 0 60px;
  text-align: center;
  overflow: hidden;
}

.hero-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.hero-circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.12;
  filter: blur(60px);
}

.hero-circle.c1 {
  width: 400px;
  height: 400px;
  background: var(--c-primary);
  top: -120px;
  left: -80px;
  animation: float 12s ease-in-out infinite;
}

.hero-circle.c2 {
  width: 300px;
  height: 300px;
  background: var(--c-accent);
  top: -40px;
  right: -60px;
  animation: float 15s ease-in-out infinite reverse;
}

.hero-circle.c3 {
  width: 200px;
  height: 200px;
  background: var(--c-success);
  bottom: -40px;
  left: 40%;
  animation: float 10s ease-in-out infinite 2s;
}

@keyframes float {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(15px, -20px) scale(1.05);
  }
  66% {
    transform: translate(-10px, 10px) scale(0.97);
  }
}

.hero-content {
  position: relative;
  z-index: 1;
}



.hero-title {
  font-size: 2.8rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin-bottom: 16px;
  background: linear-gradient(135deg, var(--c-text) 0%, var(--c-primary) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-desc {
  font-size: 1.1rem;
  color: var(--c-text-soft);
  max-width: 540px;
  margin: 0 auto 32px;
  line-height: 1.7;
}

.hero-cta {
  padding: 12px 28px;
  font-size: 1rem;
  gap: 10px;
}

/* ===== Tools Section ===== */
.tools-section {
  padding-top: 16px;
}

.section-title {
  font-size: 1.3rem;
  font-weight: 700;
  margin-bottom: 24px;
  color: var(--c-text);
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.tool-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.tool-card:hover {
  border-color: var(--c-primary-border);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.tool-card:active {
  transform: translateY(0);
}

.tool-card--disabled {
  opacity: 0.6;
  cursor: default;
}

.tool-card--disabled:hover {
  border-color: var(--c-border);
  box-shadow: var(--shadow-card);
  transform: none;
}

.tool-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  color: var(--c-primary);
  background: var(--c-bg);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.tool-card__body {
  flex: 1;
  min-width: 0;
}

.tool-card__name {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--c-text);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.tool-card__desc {
  font-size: 0.82rem;
  margin-top: 4px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tool-card__arrow {
  color: var(--c-text-muted);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.tool-card:hover .tool-card__arrow {
  transform: translateX(3px);
  color: var(--c-primary);
}

/* ===== Responsive ===== */
@media (max-width: 768px) {
  .hero {
    padding: 48px 0 40px;
  }

  .hero-title {
    font-size: 2rem;
  }

  .hero-desc {
    font-size: 0.95rem;
  }

  .tools-grid {
    grid-template-columns: 1fr;
  }
}
</style>
