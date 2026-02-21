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
    <div class="flex-1 max-w-[1100px] mx-auto px-6 pb-16 w-full">
        <!-- Hero -->
        <section
            class="relative py-20 max-md:py-12 text-center overflow-hidden"
        >
            <!-- Background blobs -->
            <div class="absolute inset-0 pointer-events-none overflow-hidden">
                <div
                    class="hero-circle absolute w-[400px] h-[400px] bg-primary rounded-full opacity-12 blur-[60px] -top-[120px] -left-[80px] animate-float"
                ></div>
                <div
                    class="hero-circle absolute w-[300px] h-[300px] bg-accent rounded-full opacity-12 blur-[60px] -top-[40px] -right-[60px] animate-float-reverse"
                ></div>
                <div
                    class="hero-circle absolute w-[200px] h-[200px] bg-success rounded-full opacity-12 blur-[60px] -bottom-[40px] left-[40%] animate-float-delayed"
                ></div>
            </div>

            <div class="relative z-[1]">
                <h1
                    class="text-[2.8rem] max-md:text-[2rem] font-extrabold tracking-tight leading-[1.15] mb-4 hero-title-gradient"
                >
                    {{ t("home.hero") }}
                </h1>
                <p
                    class="text-[1.1rem] max-md:text-[0.95rem] text-text-soft max-w-[540px] mx-auto mb-8 leading-relaxed"
                >
                    {{ t("home.heroDesc") }}
                </p>
                <button
                    class="btn btn-primary px-7 py-3 text-base gap-2.5"
                    @click="goTo(tools[0]!)"
                >
                    <span>{{ t("app.nav.revolution") }}</span>
                    <ArrowRight :size="16" />
                </button>
            </div>
        </section>

        <!-- Tools -->
        <section class="pt-4">
            <h2 class="text-[1.3rem] font-bold mb-6 text-text">
                {{ t("home.tools") }}
            </h2>
            <div
                class="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] max-md:grid-cols-1 gap-4"
            >
                <div
                    v-for="tool in tools"
                    :key="tool.path"
                    class="card tool-card"
                    :class="{ 'tool-card--disabled': !tool.ready }"
                    @click="goTo(tool)"
                    role="button"
                    tabindex="0"
                    @keydown.enter="goTo(tool)"
                >
                    <div
                        class="flex items-center justify-center w-[52px] h-[52px] text-primary bg-bg rounded-md shrink-0"
                    >
                        <component :is="tool.icon" :size="24" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3
                            class="text-[0.95rem] font-semibold text-text flex items-center gap-2.5 flex-wrap"
                        >
                            {{ t(tool.nameKey) }}
                            <span
                                v-if="!tool.ready"
                                class="badge badge-warning"
                            >
                                {{ t("home.comingSoon") }}
                            </span>
                        </h3>
                        <p
                            v-if="tool.descKey && tool.ready"
                            class="text-[0.82rem] text-text-soft mt-1 leading-normal line-clamp-2"
                        >
                            {{ t(tool.descKey) }}
                        </p>
                    </div>
                    <div class="tool-card__arrow text-text-muted shrink-0">
                        <ChevronRight :size="18" />
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped>
@reference "../style.css";

/* --- Hero gradient title --- */
.hero-title-gradient {
    background: linear-gradient(
        135deg,
        var(--c-text) 0%,
        var(--c-primary) 100%
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

/* --- Float animations --- */
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
.animate-float {
    animation: float 12s ease-in-out infinite;
}
.animate-float-reverse {
    animation: float 15s ease-in-out infinite reverse;
}
.animate-float-delayed {
    animation: float 10s ease-in-out infinite 2s;
}

/* --- Opacity helper (Tailwind v4 doesn't have opacity-12 by default) --- */
.opacity-12 {
    opacity: 0.12;
}

/* --- Tool cards --- */
.tool-card {
    @apply flex items-center gap-4 px-6 py-5 cursor-pointer select-none
           transition-all duration-200 ease-in-out;
}
.tool-card:hover {
    @apply border-primary-border shadow-md;
    transform: translateY(-2px);
}
.tool-card:active {
    transform: translateY(0);
}
.tool-card--disabled {
    @apply opacity-60 cursor-default;
}
.tool-card--disabled:hover {
    @apply border-border shadow-card;
    transform: none;
}
.tool-card__arrow {
    transition: transform 0.2s ease;
}
.tool-card:hover .tool-card__arrow {
    transform: translateX(3px);
    @apply text-primary;
}
</style>
