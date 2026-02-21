<script setup lang="ts">
import {
    ref,
    reactive,
    computed,
    watch,
    onMounted,
    nextTick,
    onUnmounted,
} from "vue";
import { useI18n } from "vue-i18n";
import katex from "katex";
import DOMPurify from "dompurify";
import Canvas2D from "@/components/revolution/Canvas2D.vue";
import {
    useThreeScene,
    defaultDisplayOptions,
    type DisplayOptions,
} from "@/composables/useThreeScene";
import {
    computeRegion,
    computeVolume,
    autoDetectBounds,
    formatVolume,
    parseEquation,
    equationToLatex,
    presetExamples,
    type CurveDefinition,
    type RotationAxis,
    type ComputedRegion,
    type RevolutionResult,
} from "@/utils/mathEngine";

import {
    Activity,
    Plus,
    X,
    RefreshCw,
    Settings,
    BookOpen,
    Play,
    RotateCcw,
    HelpCircle,
    XCircle,
    Layers,
    LayoutGrid,
    Eye,
    Download,
    TrendingUp,
    Copy,
    Check,
    ChevronDown,
    ChevronUp,
    MoveHorizontal,
    MoveVertical,
    Lightbulb,
    Palette,
} from "lucide-vue-next";

const { t } = useI18n();

// ===== State =====

let nextCurveId = 1;
function makeId(): string {
    return String(nextCurveId++);
}

const defaultCurveColors = [
    "#4f6ef7",
    "#e74c8b",
    "#2ecc71",
    "#f0a500",
    "#9b59b6",
    "#1abc9c",
    "#e67e22",
    "#3498db",
];

/** Each curve stores its raw equation string; type/expression are derived via parseEquation */
interface CurveInput {
    id: string;
    equation: string;
    color: string;
}

const curveInputs = reactive<CurveInput[]>([
    { id: makeId(), equation: "y = x^2", color: defaultCurveColors[0]! },
    { id: makeId(), equation: "y = 4", color: defaultCurveColors[1]! },
]);

const xMin = ref(-2);
const xMax = ref(2);
const axis = ref<RotationAxis>("x");
const axisValue = ref(0);

/** Convert CurveInput[] to CurveDefinition[] by parsing each equation */
const parsedCurves = computed<CurveDefinition[]>(() => {
    const res: CurveDefinition[] = [];
    for (const ci of curveInputs) {
        const parsed = parseEquation(ci.equation);
        if (parsed) {
            res.push({
                id: ci.id,
                type: parsed.type,
                expression: parsed.expression,
                equation: ci.equation.trim(),
                color: ci.color,
            });
        }
    }
    return res;
});

const display = reactive<DisplayOptions>({ ...defaultDisplayOptions });

const region = ref<ComputedRegion | null>(null);
const result = ref<RevolutionResult | null>(null);
const errorMsg = ref("");
const activeView = ref<"2d" | "3d">("3d");
const showHelp = ref(false);
const formulaCopied = ref(false);
const isGenerated = ref(false);
const resultCollapsed = ref(false);

// ===== Three.js scene =====

const threeContainer = ref<HTMLElement | null>(null);

const {
    isReady: threeReady,
    isAnimating,
    init: initThree,
    buildSolid,
    clearScene,
    updateDisplay: updateThreeDisplay,
    updateBackground,
    startAnimation,
    stopAnimation,
    takeScreenshot,
    resetCamera,
} = useThreeScene(threeContainer);

// ===== Computed =====

/** Whether a given equation string is parseable */
function isValidEquation(eq: string): boolean {
    return eq.trim() !== "" && parseEquation(eq) !== null;
}

/** Cached KaTeX HTML map keyed by curve id — avoids double-rendering in v-if + v-html */
const curveLatexMap = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const ci of curveInputs) {
        if (!ci.equation.trim()) continue;
        const tex = equationToLatex(ci.equation);
        if (!tex) continue;
        try {
            map[ci.id] = DOMPurify.sanitize(
                katex.renderToString(tex, {
                    throwOnError: false,
                    displayMode: false,
                }),
            );
        } catch {
            // skip
        }
    }
    return map;
});

const volumeFormatted = computed(() => {
    if (!result.value) return null;
    return formatVolume(result.value.volume);
});

const formulaHtml = computed(() => {
    if (!result.value) return "";
    try {
        return DOMPurify.sanitize(
            katex.renderToString(result.value.formulaLatex, {
                throwOnError: false,
                displayMode: true,
            }),
        );
    } catch {
        return DOMPurify.sanitize(result.value.formulaLatex);
    }
});

const volumeHtml = computed(() => {
    if (!volumeFormatted.value) return "";
    try {
        const latex = `V = ${volumeFormatted.value.latex} \\approx ${result.value!.volume.toFixed(4)}`;
        return DOMPurify.sanitize(
            katex.renderToString(latex, {
                throwOnError: false,
                displayMode: true,
            }),
        );
    } catch {
        return "";
    }
});

const canGenerate = computed(() => {
    return parsedCurves.value.length >= 2;
});

// ===== Curve management =====

function addCurve() {
    if (curveInputs.length >= 8) return;
    curveInputs.push({
        id: makeId(),
        equation: "",
        color: defaultCurveColors[
            curveInputs.length % defaultCurveColors.length
        ]!,
    });
}

function removeCurve(index: number) {
    if (curveInputs.length <= 1) return;
    curveInputs.splice(index, 1);
}

// ===== Auto detect bounds =====

function handleAutoDetect() {
    errorMsg.value = "";
    try {
        const valid = parsedCurves.value;
        if (valid.length < 2) {
            return;
        }
        const bounds = autoDetectBounds(valid);
        xMin.value = parseFloat(bounds.xMin.toFixed(4));
        xMax.value = parseFloat(bounds.xMax.toFixed(4));
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errorMsg.value = msg;
    }
}

/** Auto-detect bounds on input blur if we have enough curves */
function handleEquationBlur() {
    if (parsedCurves.value.length >= 2) {
        handleAutoDetect();
    }
}

// ===== Generate solid =====

function handleGenerate() {
    errorMsg.value = "";
    result.value = null;
    region.value = null;
    isGenerated.value = false;

    try {
        const validCurves = parsedCurves.value;
        if (validCurves.length < 2) {
            errorMsg.value = t("revolution.errors.needAtLeast2");
            return;
        }

        // Always auto-detect bounds before generating
        handleAutoDetect();

        if (xMin.value >= xMax.value) {
            errorMsg.value = t(
                "revolution.errors.invalidBounds",
                "Could not determine valid bounds. Check your curves.",
            );
            return;
        }

        const computedRegion = computeRegion(
            validCurves,
            xMin.value,
            xMax.value,
            display.resolution * 2,
        );
        region.value = computedRegion;

        const volumeResult = computeVolume(
            computedRegion,
            axis.value,
            axisValue.value,
        );
        result.value = volumeResult;
        isGenerated.value = true;
        resultCollapsed.value = false;

        // Build 3D scene
        if (threeReady.value) {
            buildSolid(computedRegion, axis.value, axisValue.value, {
                ...display,
            });
        }

        // If animate is on, start the animation
        if (display.animate) {
            nextTick(() => {
                startAnimation(2500);
            });
        }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errorMsg.value = msg;
    }
}

// ===== Reset =====

function handleReset() {
    curveInputs.splice(0, curveInputs.length);
    nextCurveId = 1;
    curveInputs.push(
        { id: makeId(), equation: "y = x^2", color: defaultCurveColors[0]! },
        { id: makeId(), equation: "y = 4", color: defaultCurveColors[1]! },
    );
    xMin.value = -2;
    xMax.value = 2;
    axis.value = "x";
    axisValue.value = 0;
    Object.assign(display, { ...defaultDisplayOptions });
    region.value = null;
    result.value = null;
    errorMsg.value = "";
    isGenerated.value = false;
    resultCollapsed.value = false;
    clearScene();
}

// ===== Load preset =====

/**
 * Yield to the main thread so the browser can paint before we run heavy work.
 * Uses the modern `scheduler.yield()` when available, otherwise falls back
 * to rAF + setTimeout(0) which guarantees at least one frame is painted.
 */
function yieldToMain(): Promise<void> {
    if (
        "scheduler" in window &&
        typeof (window as any).scheduler.yield === "function"
    ) {
        return (window as any).scheduler.yield();
    }
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            setTimeout(resolve, 0);
        });
    });
}

async function loadPreset(index: number) {
    const preset = presetExamples[index];
    if (!preset) return;

    curveInputs.splice(0, curveInputs.length);
    nextCurveId = 1;
    for (const c of preset.curves) {
        curveInputs.push({
            id: makeId(),
            equation:
                c.equation ||
                `${c.type === "x_const" || c.type === "x_of_y" ? "x" : "y"} = ${c.expression}`,
            color:
                c.color ||
                defaultCurveColors[
                    curveInputs.length % defaultCurveColors.length
                ]!,
        });
    }
    xMin.value = preset.xMin;
    xMax.value = preset.xMax;
    axis.value = preset.axis;
    axisValue.value = preset.axisValue;

    // Let Vue flush DOM updates, then yield to the browser so it can paint
    // the reactive state change (button highlight, input fields) before
    // we start the expensive computeRegion / buildSolid work.
    await nextTick();
    await yieldToMain();

    handleGenerate();
}

// ===== Display option changes =====

function handleDisplayChange() {
    if (threeReady.value) {
        updateThreeDisplay({ ...display });
    }
}

function handleAnimateToggle() {
    if (display.animate && isGenerated.value && region.value) {
        startAnimation(2500);
    } else {
        stopAnimation();
    }
}

// ===== Export screenshot =====

function handleExport() {
    const dataUrl = takeScreenshot();
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.download = "revolution-volume.png";
    link.href = dataUrl;
    link.click();
}

// ===== Copy formula =====

function handleCopyFormula() {
    if (!result.value) return;
    navigator.clipboard.writeText(result.value.formulaLatex).then(() => {
        formulaCopied.value = true;
        setTimeout(() => {
            formulaCopied.value = false;
        }, 2000);
    });
}

// ===== Watch display option changes =====

watch(
    () => [
        display.mode,
        display.opacity,
        display.color,
        display.showAxes,
        display.showGrid,
        display.showCrossSection,
    ],
    () => {
        handleDisplayChange();
    },
);

watch(
    () => display.animate,
    () => {
        handleAnimateToggle();
    },
);

// Watch theme
let themeObserver: MutationObserver | null = null;
onMounted(() => {
    themeObserver = new MutationObserver(() => {
        const isDark =
            document.documentElement.getAttribute("data-theme") === "dark";
        updateBackground(isDark);
    });
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
    });
});
onUnmounted(() => {
    themeObserver?.disconnect();
});

// ===== Initialize Three.js =====

onMounted(async () => {
    await nextTick();
    if (threeContainer.value) {
        initThree();
        const isDark =
            document.documentElement.getAttribute("data-theme") === "dark";
        updateBackground(isDark);
    }
});
</script>

<template>
    <div
        class="flex flex-1 h-[calc(100vh-var(--header-height))] min-h-[calc(100vh-var(--header-height))] max-h-[calc(100vh-var(--header-height))] overflow-hidden max-lg:flex-col max-lg:h-auto max-lg:min-h-[calc(100vh-var(--header-height))] max-lg:max-h-none"
    >
        <!-- ==================== Left Panel ==================== -->
        <aside
            class="w-[380px] min-w-[380px] h-full min-h-0 border-r border-border bg-bg-soft flex flex-col overflow-hidden max-lg:w-full max-lg:min-w-0 max-lg:max-h-[50vh] max-lg:border-r-0 max-lg:border-b"
        >
            <div
                class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-5 pb-6 flex flex-col gap-3.5 max-sm:px-3 max-sm:pt-3.5 max-sm:pb-5"
                style="
                    -webkit-overflow-scrolling: touch;
                    scrollbar-gutter: stable;
                "
            >
                <!-- Title -->
                <div class="mb-1">
                    <h1
                        class="text-[1.25rem] font-bold flex items-center gap-2 mb-1.5"
                    >
                        <RefreshCw :size="18" class="text-primary shrink-0" />
                        {{ t("revolution.title") }}
                    </h1>
                    <p class="text-[0.82rem] leading-relaxed text-text-soft">
                        {{ t("revolution.description") }}
                    </p>
                </div>

                <!-- Curves Section -->
                <section class="shrink-0 card">
                    <div class="card-header !px-4 !py-3 !text-[0.85rem]">
                        <Activity :size="16" />
                        {{ t("revolution.curves.title") }}
                        <button
                            class="btn btn-sm ml-auto"
                            @click="addCurve"
                            :disabled="curveInputs.length >= 8"
                        >
                            <Plus :size="14" />
                            {{ t("revolution.curves.add") }}
                        </button>
                    </div>
                    <div class="card-body !px-4 !py-3.5">
                        <div
                            v-for="(curve, index) in curveInputs"
                            :key="curve.id"
                            class="flex items-start gap-2.5 mb-3 pb-3 border-b border-border-light last:mb-0 last:pb-0 last:border-b-0"
                        >
                            <div
                                class="w-2.5 h-2.5 rounded-full shrink-0 mt-2.5"
                                :style="{ background: curve.color }"
                            ></div>
                            <div class="flex-1 flex flex-col gap-1.5 min-w-0">
                                <div class="flex items-center gap-1.5">
                                    <input
                                        type="text"
                                        v-model="curve.equation"
                                        placeholder="y = x^2, y = 0, x = 3 …"
                                        class="flex-1 !text-[0.85rem] !px-2.5 !py-[7px] min-w-0 font-mono"
                                        :class="{
                                            '!border-danger focus:!shadow-[0_0_0_3px_var(--c-danger-bg)]':
                                                curve.equation.trim() !== '' &&
                                                !isValidEquation(
                                                    curve.equation,
                                                ),
                                        }"
                                        @keydown.enter="handleGenerate"
                                        @blur="handleEquationBlur"
                                    />
                                </div>
                                <div
                                    v-if="curveLatexMap[curve.id]"
                                    class="latex-preview"
                                    v-html="curveLatexMap[curve.id]"
                                ></div>
                            </div>
                            <button
                                class="btn btn-sm btn-danger shrink-0 mt-1 !p-1.5 !w-7 !h-7"
                                :disabled="curveInputs.length <= 1"
                                @click="removeCurve(index)"
                                :title="t('revolution.curves.remove')"
                            >
                                <X :size="14" />
                            </button>
                        </div>
                        <p
                            class="text-[0.75rem] text-text-muted mt-1 leading-normal"
                        >
                            {{ t("revolution.curves.hint") }}
                        </p>
                    </div>
                </section>

                <!-- Axis of Revolution -->
                <section class="shrink-0 card">
                    <div class="card-header !px-4 !py-3 !text-[0.85rem]">
                        <RefreshCw :size="16" />
                        {{ t("revolution.axis.title") }}
                    </div>
                    <div class="card-body !px-4 !py-3.5">
                        <div class="flex gap-2 mb-3 max-sm:flex-col">
                            <button
                                class="axis-btn"
                                :class="{ active: axis === 'x' }"
                                @click="axis = 'x'"
                            >
                                <MoveHorizontal :size="14" class="shrink-0" />
                                {{ t("revolution.axis.xAxis") }}
                            </button>
                            <button
                                class="axis-btn"
                                :class="{ active: axis === 'y' }"
                                @click="axis = 'y'"
                            >
                                <MoveVertical :size="14" class="shrink-0" />
                                {{ t("revolution.axis.yAxis") }}
                            </button>
                        </div>
                        <div class="flex items-center gap-2.5">
                            <label class="!mb-0 whitespace-nowrap">{{
                                t("revolution.axis.axisValue")
                            }}</label>
                            <input
                                type="number"
                                v-model.number="axisValue"
                                step="0.5"
                                class="!w-[100px] !text-[0.85rem] !px-2.5 !py-[7px]"
                            />
                        </div>
                    </div>
                </section>

                <!-- Display Options -->
                <section class="shrink-0 card">
                    <div class="card-header !px-4 !py-3 !text-[0.85rem]">
                        <Settings :size="16" />
                        {{ t("revolution.display.title") }}
                    </div>
                    <div class="card-body !px-4 !py-3.5 flex flex-col gap-3">
                        <!-- Render mode -->
                        <div class="flex flex-col gap-1.5">
                            <label>{{ t("revolution.display.solid") }}</label>
                            <div class="flex gap-1 max-sm:flex-wrap">
                                <button
                                    class="mode-btn"
                                    :class="{
                                        active: display.mode === 'solid',
                                    }"
                                    @click="display.mode = 'solid'"
                                >
                                    {{ t("revolution.display.solid") }}
                                </button>
                                <button
                                    class="mode-btn"
                                    :class="{
                                        active: display.mode === 'wireframe',
                                    }"
                                    @click="display.mode = 'wireframe'"
                                >
                                    {{ t("revolution.display.wireframe") }}
                                </button>
                                <button
                                    class="mode-btn"
                                    :class="{
                                        active: display.mode === 'transparent',
                                    }"
                                    @click="display.mode = 'transparent'"
                                >
                                    {{ t("revolution.display.transparent") }}
                                </button>
                            </div>
                        </div>

                        <!-- Opacity -->
                        <div
                            v-if="display.mode === 'transparent'"
                            class="flex flex-col gap-1.5"
                        >
                            <label
                                >{{ t("revolution.display.opacity") }}:
                                {{ display.opacity.toFixed(2) }}</label
                            >
                            <input
                                type="range"
                                min="0.1"
                                max="1"
                                step="0.05"
                                v-model.number="display.opacity"
                            />
                        </div>

                        <!-- Color -->
                        <div
                            class="flex flex-row items-center justify-between gap-1.5"
                        >
                            <label class="!mb-0">{{
                                t("revolution.display.color")
                            }}</label>
                            <input type="color" v-model="display.color" />
                        </div>

                        <!-- Resolution -->
                        <div class="flex flex-col gap-1.5">
                            <label
                                >{{ t("revolution.display.resolution") }}:
                                {{ display.resolution }}</label
                            >
                            <input
                                type="range"
                                min="16"
                                max="128"
                                step="8"
                                v-model.number="display.resolution"
                            />
                        </div>

                        <!-- Toggles -->
                        <div
                            class="flex flex-row items-center justify-between gap-1.5"
                        >
                            <label class="!mb-0">{{
                                t("revolution.display.showAxes")
                            }}</label>
                            <label class="toggle">
                                <input
                                    type="checkbox"
                                    v-model="display.showAxes"
                                />
                                <span class="slider"></span>
                            </label>
                        </div>

                        <div
                            class="flex flex-row items-center justify-between gap-1.5"
                        >
                            <label class="!mb-0">{{
                                t("revolution.display.showGrid")
                            }}</label>
                            <label class="toggle">
                                <input
                                    type="checkbox"
                                    v-model="display.showGrid"
                                />
                                <span class="slider"></span>
                            </label>
                        </div>

                        <div
                            class="flex flex-row items-center justify-between gap-1.5"
                        >
                            <label class="!mb-0">{{
                                t("revolution.display.showCrossSection")
                            }}</label>
                            <label class="toggle">
                                <input
                                    type="checkbox"
                                    v-model="display.showCrossSection"
                                />
                                <span class="slider"></span>
                            </label>
                        </div>

                        <div
                            class="flex flex-row items-center justify-between gap-1.5"
                        >
                            <label class="!mb-0">{{
                                t("revolution.display.animate")
                            }}</label>
                            <label class="toggle">
                                <input
                                    type="checkbox"
                                    v-model="display.animate"
                                />
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </section>

                <!-- Presets -->
                <section class="shrink-0 card">
                    <div class="card-header !px-4 !py-3 !text-[0.85rem]">
                        <BookOpen :size="16" />
                        {{ t("revolution.presets.title") }}
                    </div>
                    <div class="card-body !px-4 !py-3.5 flex flex-col gap-2">
                        <button
                            v-for="(preset, idx) in presetExamples"
                            :key="idx"
                            class="preset-btn"
                            @click="loadPreset(idx)"
                        >
                            <div
                                class="text-[0.85rem] font-semibold text-text mb-0.5"
                            >
                                {{ t(preset.nameKey) }}
                            </div>
                            <div
                                class="text-[0.75rem] text-text-muted leading-snug"
                            >
                                {{ t(preset.descKey) }}
                            </div>
                        </button>
                    </div>
                </section>

                <!-- Action Buttons -->
                <div class="flex gap-2.5 pt-1 max-sm:flex-col">
                    <button
                        class="btn btn-primary flex-1"
                        :disabled="!canGenerate"
                        @click="handleGenerate"
                    >
                        <Play :size="16" />
                        {{ t("revolution.generate") }}
                    </button>
                    <button class="btn flex-1" @click="handleReset">
                        <RotateCcw :size="16" />
                        {{ t("revolution.reset") }}
                    </button>
                </div>

                <!-- Help toggle -->
                <button
                    class="flex items-center gap-1.5 text-[0.82rem] cursor-pointer bg-transparent border-none p-0 text-text-soft hover:text-primary transition-colors duration-200"
                    style="font-family: var(--font-sans)"
                    @click="showHelp = !showHelp"
                >
                    <HelpCircle :size="14" />
                    {{ t("revolution.help.title") }}
                </button>

                <!-- Help panel -->
                <transition name="fade">
                    <section
                        v-if="showHelp"
                        class="shrink-0 card bg-primary-bg !border-primary-border"
                    >
                        <div class="card-body !px-4 !py-3.5">
                            <h3
                                class="text-[0.9rem] font-bold mb-2.5 text-primary"
                            >
                                {{ t("revolution.help.title") }}
                            </h3>
                            <ol
                                class="pl-5 mb-3 text-[0.82rem] leading-loose text-text-soft"
                            >
                                <li>{{ t("revolution.help.step1") }}</li>
                                <li>{{ t("revolution.help.step2") }}</li>
                                <li>{{ t("revolution.help.step3") }}</li>
                                <li>{{ t("revolution.help.step4") }}</li>
                            </ol>
                            <p
                                class="mt-3 text-[0.8rem] text-text-soft inline-flex items-center gap-1.5"
                            >
                                <Lightbulb
                                    :size="14"
                                    class="text-warning shrink-0"
                                />
                                {{ t("revolution.help.tip") }}
                            </p>
                        </div>
                    </section>
                </transition>
            </div>
        </aside>

        <!-- ==================== Main Content ==================== -->
        <main
            class="flex-1 flex flex-col min-w-0 overflow-hidden max-lg:min-h-[400px]"
        >
            <!-- Error banner -->
            <transition name="fade">
                <div
                    v-if="errorMsg"
                    class="flex items-center gap-2.5 px-4 py-2.5 bg-danger-bg text-danger text-[0.85rem] font-medium border-b border-danger/20 shrink-0"
                >
                    <XCircle :size="16" />
                    <span>{{ errorMsg }}</span>
                    <button
                        class="ml-auto bg-transparent border-none cursor-pointer p-1 text-danger flex items-center"
                        @click="errorMsg = ''"
                    >
                        <X :size="14" />
                    </button>
                </div>
            </transition>

            <!-- View Tabs -->
            <div
                class="flex items-center gap-1 px-4 py-2 border-b border-border bg-bg-soft shrink-0 z-10"
            >
                <button
                    class="view-tab"
                    :class="{ active: activeView === '3d' }"
                    @click="activeView = '3d'"
                >
                    <Layers :size="14" />
                    {{ t("revolution.view3D") }}
                </button>
                <button
                    class="view-tab"
                    :class="{ active: activeView === '2d' }"
                    @click="activeView = '2d'"
                >
                    <LayoutGrid :size="14" />
                    {{ t("revolution.view2D") }}
                </button>
                <div class="ml-auto flex gap-1.5">
                    <button
                        v-if="activeView === '3d'"
                        class="btn btn-sm"
                        @click="resetCamera"
                        title="Reset camera"
                    >
                        <Eye :size="14" />
                    </button>
                    <button
                        class="btn btn-sm"
                        @click="handleExport"
                        :title="t('revolution.export')"
                    >
                        <Download :size="14" />
                        {{ t("revolution.export") }}
                    </button>
                </div>
            </div>

            <!-- 3D View -->
            <div
                class="flex-1 relative min-h-0 overflow-hidden bg-bg max-lg:min-h-[300px]"
                v-show="activeView === '3d'"
            >
                <div
                    ref="threeContainer"
                    class="w-full h-full absolute inset-0"
                />
                <div
                    v-if="!isGenerated"
                    class="absolute inset-0 flex items-center justify-center pointer-events-none z-[2] bg-bg"
                >
                    <div class="text-center pointer-events-auto">
                        <Palette
                            :size="28"
                            class="mb-2.5 text-primary mx-auto"
                        />
                        <p
                            class="text-[0.9rem] text-text-muted max-w-[320px] mx-auto mb-5 leading-relaxed"
                        >
                            {{ t("revolution.description") }}
                        </p>
                        <button
                            class="btn btn-primary btn-sm"
                            :disabled="!canGenerate"
                            @click="handleGenerate"
                        >
                            {{ t("revolution.generate") }}
                        </button>
                    </div>
                </div>
                <div
                    v-if="isAnimating"
                    class="absolute top-3 left-3 flex items-center gap-2 px-3.5 py-1.5 bg-bg-soft border border-border rounded-full text-[0.78rem] text-text-soft z-[5]"
                >
                    <div class="spinner"></div>
                    <span>{{ t("revolution.display.animate") }}...</span>
                </div>
            </div>

            <!-- 2D View -->
            <div
                class="flex-1 relative min-h-0 overflow-hidden bg-bg max-lg:min-h-[300px]"
                v-show="activeView === '2d'"
            >
                <Canvas2D
                    :curves="parsedCurves"
                    :region="region"
                    :x-min="xMin"
                    :x-max="xMax"
                    :axis="axis"
                    :axis-value="axisValue"
                />
            </div>

            <!-- Result Panel -->
            <transition name="slide-result">
                <div
                    v-if="result"
                    class="shrink-0 card !rounded-none !border-x-0 !border-b-0 border-t border-border"
                >
                    <div
                        class="flex items-center justify-between px-5 py-3 cursor-pointer select-none border-b border-border text-[0.85rem] font-semibold gap-2.5 hover:bg-bg-hover transition-colors duration-200"
                        @click="resultCollapsed = !resultCollapsed"
                    >
                        <div class="flex items-center gap-2.5">
                            <TrendingUp :size="16" />
                            {{ t("revolution.result.title") }}
                            <span class="badge badge-success">
                                {{ t(result.methodKey) }}
                            </span>
                        </div>
                        <button
                            class="bg-transparent border-none p-1 text-text-muted flex items-center cursor-pointer hover:text-text transition-colors duration-200"
                        >
                            <ChevronDown v-if="resultCollapsed" :size="18" />
                            <ChevronUp v-else :size="18" />
                        </button>
                    </div>
                    <transition name="collapse">
                        <div v-show="!resultCollapsed" class="overflow-hidden">
                            <div
                                class="flex gap-8 px-5 py-4 flex-wrap max-lg:flex-col max-lg:gap-4"
                            >
                                <div class="shrink-0">
                                    <div class="result-label text-text-soft">
                                        {{ t("revolution.result.volume") }}
                                    </div>
                                    <div
                                        class="text-[1.1rem] katex-result"
                                        v-html="volumeHtml"
                                    ></div>
                                </div>
                                <div class="flex-1 min-w-[200px]">
                                    <div class="result-label text-text-soft">
                                        {{ t("revolution.result.formula") }}
                                        <button
                                            class="copy-btn"
                                            @click.stop="handleCopyFormula"
                                            :title="
                                                t(
                                                    'revolution.result.copyFormula',
                                                )
                                            "
                                        >
                                            <Check
                                                v-if="formulaCopied"
                                                :size="13"
                                                class="text-success"
                                            />
                                            <Copy v-else :size="13" />
                                            <span
                                                v-if="formulaCopied"
                                                class="text-success font-semibold"
                                                >{{
                                                    t(
                                                        "revolution.result.copied",
                                                    )
                                                }}</span
                                            >
                                        </button>
                                    </div>
                                    <div
                                        class="overflow-x-auto katex-result"
                                        v-html="formulaHtml"
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </transition>
                </div>
            </transition>
        </main>
    </div>
</template>

<style scoped>
@reference "../style.css";

/* --- Axis toggle buttons --- */
.axis-btn {
    @apply flex-1 flex items-center justify-center gap-1.5
           px-3 py-2.5 text-[0.82rem] font-medium
           border-2 border-border rounded-sm bg-bg-input
           text-text-soft cursor-pointer
           transition-all duration-200 ease-in-out;
    font-family: var(--font-sans);
}
.axis-btn:hover {
    @apply border-primary-border text-text;
}
.axis-btn.active {
    @apply border-primary bg-primary-bg text-primary;
}

/* --- Mode toggle buttons --- */
.mode-btn {
    @apply flex-1 px-2 py-1.5 text-[0.78rem] font-medium text-center
           border border-border rounded-sm bg-bg-input text-text-soft
           cursor-pointer transition-all duration-200 ease-in-out;
    font-family: var(--font-sans);
}
.mode-btn:hover {
    @apply border-primary-border;
}
.mode-btn.active {
    @apply border-primary bg-primary-bg text-primary font-semibold;
}

/* --- Preset buttons --- */
.preset-btn {
    @apply text-left px-3.5 py-2.5 border border-border rounded-sm
           bg-bg-input cursor-pointer transition-all duration-200 ease-in-out;
    font-family: var(--font-sans);
    contain: content;
}
.preset-btn:hover,
.preset-btn:active {
    @apply border-primary-border bg-primary-bg;
}

/* --- View tabs --- */
.view-tab {
    @apply flex items-center gap-1.5 px-4 py-[7px]
           text-[0.82rem] font-medium border border-transparent
           rounded-sm bg-transparent text-text-soft cursor-pointer
           transition-all duration-200 ease-in-out;
    font-family: var(--font-sans);
}
.view-tab:hover {
    @apply bg-bg-hover text-text;
}
.view-tab.active {
    @apply bg-primary-bg text-primary border-primary-border font-semibold;
}

/* --- LaTeX preview --- */
.latex-preview {
    @apply px-2 py-1 bg-bg-hover rounded-sm text-[0.85rem] leading-relaxed overflow-x-auto;
}
.latex-preview :deep(.katex-mathml) {
    @apply absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0;
    clip: rect(0, 0, 0, 0);
}
.latex-preview :deep(.katex) {
    font-size: 0.95em;
}

/* --- KaTeX result areas --- */
.katex-result :deep(.katex-display) {
    margin: 0 !important;
    text-align: left;
}
.katex-result :deep(.katex-mathml) {
    @apply absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0;
    clip: rect(0, 0, 0, 0);
}

/* --- Result label --- */
.result-label {
    @apply text-[0.78rem] font-semibold uppercase tracking-wide mb-1.5
           flex items-center gap-2;
}

/* --- Copy button --- */
.copy-btn {
    @apply inline-flex items-center gap-1 bg-transparent border-none
           cursor-pointer px-1 py-0.5 text-text-muted text-[0.72rem]
           transition-colors duration-200 ease-in-out;
    font-family: var(--font-sans);
}
.copy-btn:hover {
    @apply text-primary;
}

/* --- Spinner --- */
.spinner {
    @apply w-3.5 h-3.5 border-2 border-border rounded-full;
    border-top-color: var(--c-primary);
    animation: spin 0.8s linear infinite;
}
@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

/* --- Collapse transition --- */
.collapse-enter-active,
.collapse-leave-active {
    transition: all 0.25s ease;
    overflow: hidden;
}
.collapse-enter-from,
.collapse-leave-to {
    max-height: 0;
    opacity: 0;
}
.collapse-enter-to,
.collapse-leave-from {
    max-height: 400px;
    opacity: 1;
}

/* --- Slide-result transition --- */
.slide-result-enter-active,
.slide-result-leave-active {
    transition: all 0.3s ease;
}
.slide-result-enter-from,
.slide-result-leave-to {
    opacity: 0;
    transform: translateY(20px);
}
</style>
