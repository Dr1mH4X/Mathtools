<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, nextTick, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import katex from "katex";
import DOMPurify from "dompurify";
import Canvas2D from "@/components/revolution/Canvas2D.vue";
import { useThreeScene, defaultDisplayOptions, type DisplayOptions } from "@/composables/useThreeScene";
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
      map[ci.id] = DOMPurify.sanitize(katex.renderToString(tex, {
        throwOnError: false,
        displayMode: false,
      }));
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
    return DOMPurify.sanitize(katex.renderToString(result.value.formulaLatex, {
      throwOnError: false,
      displayMode: true,
    }));
  } catch {
    return DOMPurify.sanitize(result.value.formulaLatex);
  }
});

const volumeHtml = computed(() => {
  if (!volumeFormatted.value) return "";
  try {
    const latex = `V = ${volumeFormatted.value.latex} \\approx ${result.value!.volume.toFixed(4)}`;
    return DOMPurify.sanitize(katex.renderToString(latex, {
      throwOnError: false,
      displayMode: true,
    }));
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
    color: defaultCurveColors[curveInputs.length % defaultCurveColors.length]!,
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
      errorMsg.value = t("revolution.errors.invalidBounds", "Could not determine valid bounds. Check your curves.");
      return;
    }

    const computedRegion = computeRegion(validCurves, xMin.value, xMax.value, display.resolution * 2);
    region.value = computedRegion;

    const volumeResult = computeVolume(computedRegion, axis.value, axisValue.value);
    result.value = volumeResult;
    isGenerated.value = true;
    resultCollapsed.value = false;

    // Build 3D scene
    if (threeReady.value) {
      buildSolid(computedRegion, axis.value, axisValue.value, { ...display });
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
    { id: makeId(), equation: "y = 4", color: defaultCurveColors[1]! }
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

function loadPreset(index: number) {
  const preset = presetExamples[index];
  if (!preset) return;

  curveInputs.splice(0, curveInputs.length);
  nextCurveId = 1;
  for (const c of preset.curves) {
    curveInputs.push({
      id: makeId(),
      equation: c.equation || `${c.type === "x_const" || c.type === "x_of_y" ? "x" : "y"} = ${c.expression}`,
      color: c.color || defaultCurveColors[curveInputs.length % defaultCurveColors.length]!,
    });
  }
  xMin.value = preset.xMin;
  xMax.value = preset.xMax;
  axis.value = preset.axis;
  axisValue.value = preset.axisValue;

  nextTick(() => {
    handleGenerate();
  });
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
  () => [display.mode, display.opacity, display.color, display.showAxes, display.showGrid, display.showCrossSection],
  () => {
    handleDisplayChange();
  }
);

watch(
  () => display.animate,
  () => {
    handleAnimateToggle();
  }
);

// Watch theme
let themeObserver: MutationObserver | null = null;
onMounted(() => {
  themeObserver = new MutationObserver(() => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
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
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    updateBackground(isDark);
  }
});
</script>

<template>
  <div class="rev-page">
    <!-- Left Panel: Controls (only this scrolls) -->
    <aside class="rev-sidebar">
      <div class="sidebar-scroll">
        <!-- Title -->
        <div class="sidebar-header">
          <h1 class="sidebar-title">
            <RefreshCw :size="18" class="title-icon" />
            {{ t("revolution.title") }}
          </h1>
          <p class="sidebar-desc text-soft">{{ t("revolution.description") }}</p>
        </div>

        <!-- Curves Section -->
        <section class="panel-section card">
          <div class="card-header">
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
          <div class="card-body">
            <div
              v-for="(curve, index) in curveInputs"
              :key="curve.id"
              class="curve-row"
            >
              <div class="curve-row__color-dot" :style="{ background: curve.color }"></div>
              <div class="curve-row__fields">
                <div class="curve-row__input-wrap">
                  <input
                    type="text"
                    v-model="curve.equation"
                    placeholder="y = x^2, y = 0, x = 3 …"
                    class="curve-row__input font-mono"
                    :class="{ 'curve-row__input--invalid': curve.equation.trim() !== '' && !isValidEquation(curve.equation) }"
                    @keydown.enter="handleGenerate"
                    @blur="handleEquationBlur"
                  />
                </div>
                <div
                  v-if="curveLatexMap[curve.id]"
                  class="curve-row__latex-preview"
                  v-html="curveLatexMap[curve.id]"
                ></div>
              </div>
              <button
                class="btn btn-sm btn-danger curve-row__remove"
                :disabled="curveInputs.length <= 1"
                @click="removeCurve(index)"
                :title="t('revolution.curves.remove')"
              >
                <X :size="14" />
              </button>
            </div>
            <p class="curve-hint text-muted">{{ t("revolution.curves.hint") }}</p>
          </div>
        </section>

        <!-- Axis of Revolution -->
        <section class="panel-section card">
          <div class="card-header">
            <RefreshCw :size="16" />
            {{ t("revolution.axis.title") }}
          </div>
          <div class="card-body">
            <div class="axis-buttons">
              <button
                class="axis-btn"
                :class="{ active: axis === 'x' }"
                @click="axis = 'x'"
              >
                <MoveHorizontal :size="14" class="axis-btn__icon" />
                {{ t("revolution.axis.xAxis") }}
              </button>
              <button
                class="axis-btn"
                :class="{ active: axis === 'y' }"
                @click="axis = 'y'"
              >
                <MoveVertical :size="14" class="axis-btn__icon" />
                {{ t("revolution.axis.yAxis") }}
              </button>
            </div>
            <div class="axis-value-row">
              <label>{{ t("revolution.axis.axisValue") }}</label>
              <input type="number" v-model.number="axisValue" step="0.5" />
            </div>
          </div>
        </section>

        <!-- Display Options -->
        <section class="panel-section card">
          <div class="card-header">
            <Settings :size="16" />
            {{ t("revolution.display.title") }}
          </div>
          <div class="card-body display-options">
            <!-- Render mode -->
            <div class="display-row">
              <label>{{ t("revolution.display.solid") }}</label>
              <div class="mode-buttons">
                <button
                  class="mode-btn"
                  :class="{ active: display.mode === 'solid' }"
                  @click="display.mode = 'solid'"
                >
                  {{ t("revolution.display.solid") }}
                </button>
                <button
                  class="mode-btn"
                  :class="{ active: display.mode === 'wireframe' }"
                  @click="display.mode = 'wireframe'"
                >
                  {{ t("revolution.display.wireframe") }}
                </button>
                <button
                  class="mode-btn"
                  :class="{ active: display.mode === 'transparent' }"
                  @click="display.mode = 'transparent'"
                >
                  {{ t("revolution.display.transparent") }}
                </button>
              </div>
            </div>

            <!-- Opacity (only for transparent mode) -->
            <div v-if="display.mode === 'transparent'" class="display-row">
              <label>{{ t("revolution.display.opacity") }}: {{ display.opacity.toFixed(2) }}</label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                v-model.number="display.opacity"
              />
            </div>

            <!-- Color -->
            <div class="display-row display-row--inline">
              <label>{{ t("revolution.display.color") }}</label>
              <input type="color" v-model="display.color" />
            </div>

            <!-- Resolution -->
            <div class="display-row">
              <label>{{ t("revolution.display.resolution") }}: {{ display.resolution }}</label>
              <input
                type="range"
                min="16"
                max="128"
                step="8"
                v-model.number="display.resolution"
              />
            </div>

            <!-- Toggles -->
            <div class="display-row display-row--inline">
              <label>{{ t("revolution.display.showAxes") }}</label>
              <label class="toggle">
                <input type="checkbox" v-model="display.showAxes" />
                <span class="slider"></span>
              </label>
            </div>

            <div class="display-row display-row--inline">
              <label>{{ t("revolution.display.showGrid") }}</label>
              <label class="toggle">
                <input type="checkbox" v-model="display.showGrid" />
                <span class="slider"></span>
              </label>
            </div>

            <div class="display-row display-row--inline">
              <label>{{ t("revolution.display.showCrossSection") }}</label>
              <label class="toggle">
                <input type="checkbox" v-model="display.showCrossSection" />
                <span class="slider"></span>
              </label>
            </div>

            <div class="display-row display-row--inline">
              <label>{{ t("revolution.display.animate") }}</label>
              <label class="toggle">
                <input type="checkbox" v-model="display.animate" />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </section>

        <!-- Presets -->
        <section class="panel-section card">
          <div class="card-header">
            <BookOpen :size="16" />
            {{ t("revolution.presets.title") }}
          </div>
          <div class="card-body presets-list">
            <button
              v-for="(preset, idx) in presetExamples"
              :key="idx"
              class="preset-btn"
              @click="loadPreset(idx)"
            >
              <div class="preset-btn__name">{{ t(preset.nameKey) }}</div>
              <div class="preset-btn__desc text-muted">{{ t(preset.descKey) }}</div>
            </button>
          </div>
        </section>

        <!-- Action Buttons -->
        <div class="sidebar-actions">
          <button
            class="btn btn-primary action-btn"
            :disabled="!canGenerate"
            @click="handleGenerate"
          >
            <Play :size="16" />
            {{ t("revolution.generate") }}
          </button>
          <button class="btn action-btn" @click="handleReset">
            <RotateCcw :size="16" />
            {{ t("revolution.reset") }}
          </button>
        </div>

        <!-- Help toggle -->
        <button class="help-toggle text-soft" @click="showHelp = !showHelp">
          <HelpCircle :size="14" />
          {{ t("revolution.help.title") }}
        </button>

        <!-- Help panel -->
        <transition name="fade">
          <section v-if="showHelp" class="panel-section card help-card">
            <div class="card-body">
              <h3 class="help-title">{{ t("revolution.help.title") }}</h3>
              <ol class="help-steps">
                <li>{{ t("revolution.help.step1") }}</li>
                <li>{{ t("revolution.help.step2") }}</li>
                <li>{{ t("revolution.help.step3") }}</li>
                <li>{{ t("revolution.help.step4") }}</li>
              </ol>
              <p class="help-tip">
                <Lightbulb :size="14" class="help-tip__icon" /> {{ t("revolution.help.tip") }}
              </p>
            </div>
          </section>
        </transition>
      </div>
    </aside>

    <!-- Main Content: Visualization (does NOT scroll) -->
    <main class="rev-main">
      <!-- Error banner -->
      <transition name="fade">
        <div v-if="errorMsg" class="error-banner">
          <XCircle :size="16" />
          <span>{{ errorMsg }}</span>
          <button class="error-close" @click="errorMsg = ''">
            <X :size="14" />
          </button>
        </div>
      </transition>

      <!-- View Tabs -->
      <div class="view-tabs">
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
        <div class="view-tabs__right">
          <button
            v-if="activeView === '3d'"
            class="btn btn-sm"
            @click="resetCamera"
            title="Reset camera"
          >
            <Eye :size="14" />
          </button>
          <button class="btn btn-sm" @click="handleExport" :title="t('revolution.export')">
            <Download :size="14" />
            {{ t("revolution.export") }}
          </button>
        </div>
      </div>

      <!-- 3D View -->
      <div class="view-container" v-show="activeView === '3d'">
        <div ref="threeContainer" class="three-container" />
        <div v-if="!isGenerated" class="view-placeholder">
          <div class="view-placeholder__content">
            <Palette :size="28" class="view-placeholder__icon" />
            <p>{{ t("revolution.description") }}</p>
            <button class="btn btn-primary btn-sm" :disabled="!canGenerate" @click="handleGenerate">
              {{ t("revolution.generate") }}
            </button>
          </div>
        </div>
        <div v-if="isAnimating" class="animating-indicator">
          <div class="spinner"></div>
          <span>{{ t("revolution.display.animate") }}...</span>
        </div>
      </div>

      <!-- 2D View -->
      <div class="view-container" v-show="activeView === '2d'">
        <Canvas2D
          :curves="parsedCurves"
          :region="region"
          :x-min="xMin"
          :x-max="xMax"
          :axis="axis"
          :axis-value="axisValue"
        />
      </div>

      <!-- Result Panel (collapsible) -->
      <transition name="slide-result">
        <div v-if="result" class="result-panel card">
          <div class="result-panel__header" @click="resultCollapsed = !resultCollapsed">
            <div class="result-panel__header-left">
              <TrendingUp :size="16" />
              {{ t("revolution.result.title") }}
              <span class="badge badge-success">
                {{ t(result.methodKey) }}
              </span>
            </div>
            <button class="result-panel__toggle">
              <ChevronDown v-if="resultCollapsed" :size="18" />
              <ChevronUp v-else :size="18" />
            </button>
          </div>
          <transition name="collapse">
            <div v-show="!resultCollapsed" class="result-panel__body">
              <div class="result-body">
                <div class="result-volume">
                  <div class="result-label text-soft">{{ t("revolution.result.volume") }}</div>
                  <div class="result-value" v-html="volumeHtml"></div>
                </div>
                <div class="result-formula">
                  <div class="result-label text-soft">
                    {{ t("revolution.result.formula") }}
                    <button class="copy-btn" @click.stop="handleCopyFormula" :title="t('revolution.result.copyFormula')">
                      <Check v-if="formulaCopied" :size="13" class="copy-icon--success" />
                      <Copy v-else :size="13" />
                      <span v-if="formulaCopied" class="copy-label">{{ t("revolution.result.copied") }}</span>
                    </button>
                  </div>
                  <div class="result-formula-content" v-html="formulaHtml"></div>
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
.rev-page {
  display: flex;
  flex: 1;
  height: calc(100vh - var(--header-height));
  min-height: calc(100vh - var(--header-height));
  max-height: calc(100vh - var(--header-height));
  overflow: hidden;
}

/* ===== Sidebar (only scrollable part) ===== */
.rev-sidebar {
  width: 380px;
  min-width: 380px;
  height: 100%;
  min-height: 0;
  border-right: 1px solid var(--c-border);
  background: var(--c-bg-soft);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-gutter: stable;
  padding: 20px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sidebar-header {
  margin-bottom: 4px;
}

.sidebar-title {
  font-size: 1.25rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.title-icon {
  color: var(--c-primary);
  flex-shrink: 0;
}

.sidebar-desc {
  font-size: 0.82rem;
  line-height: 1.55;
}

/* ===== Panel sections ===== */
.panel-section {
  flex-shrink: 0;
}

.panel-section .card-header {
  padding: 12px 16px;
  font-size: 0.85rem;
}

.panel-section .card-body {
  padding: 14px 16px;
}

.ml-auto {
  margin-left: auto;
}

/* ===== Curves ===== */
.curve-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--c-border-light);
}

.curve-row:last-of-type {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.curve-row__color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 10px;
}

.curve-row__fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.curve-row__input-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.curve-row__input {
  flex: 1;
  font-size: 0.85rem;
  padding: 7px 10px;
  min-width: 0;
}

.curve-row__input--invalid {
  border-color: var(--c-danger);
}

.curve-row__input--invalid:focus {
  box-shadow: 0 0 0 3px var(--c-danger-bg);
}

.curve-row__latex-preview {
  padding: 4px 8px;
  background: var(--c-bg-hover);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  line-height: 1.6;
  overflow-x: auto;
}

/* Ensure KaTeX MathML accessibility layer is always hidden
   (prevents doubled text if CDN CSS fails to load) */
.curve-row__latex-preview :deep(.katex-mathml) {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.curve-row__latex-preview :deep(.katex) {
  font-size: 0.95em;
}

.curve-hint {
  font-size: 0.75rem;
  margin-top: 4px;
  line-height: 1.5;
}

.curve-row__remove {
  flex-shrink: 0;
  margin-top: 4px;
  padding: 6px;
  width: 28px;
  height: 28px;
}

/* ===== Axis ===== */
.axis-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.axis-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  font-size: 0.82rem;
  font-weight: 500;
  font-family: var(--font-sans);
  border: 2px solid var(--c-border);
  border-radius: var(--radius-sm);
  background: var(--c-bg-input);
  color: var(--c-text-soft);
  cursor: pointer;
  transition: all var(--transition);
}

.axis-btn:hover {
  border-color: var(--c-primary-border);
  color: var(--c-text);
}

.axis-btn.active {
  border-color: var(--c-primary);
  background: var(--c-primary-bg);
  color: var(--c-primary);
}

.axis-btn__icon {
  flex-shrink: 0;
}

.axis-value-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.axis-value-row label {
  margin-bottom: 0;
  white-space: nowrap;
}

.axis-value-row input {
  width: 100px;
  font-size: 0.85rem;
  padding: 7px 10px;
}

/* ===== Display Options ===== */
.display-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.display-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.display-row label {
  margin-bottom: 0;
}

.display-row--inline {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.mode-buttons {
  display: flex;
  gap: 4px;
}

.mode-btn {
  flex: 1;
  padding: 6px 8px;
  font-size: 0.78rem;
  font-weight: 500;
  font-family: var(--font-sans);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  background: var(--c-bg-input);
  color: var(--c-text-soft);
  cursor: pointer;
  transition: all var(--transition);
  text-align: center;
}

.mode-btn:hover {
  border-color: var(--c-primary-border);
}

.mode-btn.active {
  border-color: var(--c-primary);
  background: var(--c-primary-bg);
  color: var(--c-primary);
  font-weight: 600;
}

/* ===== Presets ===== */
.presets-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preset-btn {
  text-align: left;
  padding: 10px 14px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  background: var(--c-bg-input);
  cursor: pointer;
  transition: all var(--transition);
  font-family: var(--font-sans);
}

.preset-btn:hover {
  border-color: var(--c-primary-border);
  background: var(--c-primary-bg);
}

.preset-btn__name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--c-text);
  margin-bottom: 2px;
}

.preset-btn__desc {
  font-size: 0.75rem;
  line-height: 1.4;
}

/* ===== Sidebar Actions ===== */
.sidebar-actions {
  display: flex;
  gap: 10px;
  padding-top: 4px;
}

.action-btn {
  flex: 1;
}

/* ===== Help ===== */
.help-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  cursor: pointer;
  background: none;
  border: none;
  padding: 4px 0;
  font-family: var(--font-sans);
  color: var(--c-text-soft);
  transition: color var(--transition);
}

.help-toggle:hover {
  color: var(--c-primary);
}

.help-card {
  background: var(--c-primary-bg);
  border-color: var(--c-primary-border);
}

.help-title {
  font-size: 0.9rem;
  font-weight: 700;
  margin-bottom: 10px;
  color: var(--c-primary);
}

.help-steps {
  padding-left: 20px;
  margin-bottom: 12px;
  font-size: 0.82rem;
  line-height: 1.8;
  color: var(--c-text-soft);
}

.help-tip {
  margin-top: 12px;
  font-size: 0.8rem;
  color: var(--c-text-soft);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.help-tip__icon {
  color: var(--c-warning);
  flex-shrink: 0;
}

/* ===== Main Content (no scroll) ===== */
.rev-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

/* ===== Error banner ===== */
.error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--c-danger-bg);
  color: var(--c-danger);
  font-size: 0.85rem;
  font-weight: 500;
  border-bottom: 1px solid rgba(231, 76, 60, 0.2);
  flex-shrink: 0;
}

.error-close {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--c-danger);
  display: flex;
  align-items: center;
}

/* ===== View Tabs ===== */
.view-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--c-border);
  background: var(--c-bg-soft);
  flex-shrink: 0;
  z-index: 10;
}

.view-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  font-size: 0.82rem;
  font-weight: 500;
  font-family: var(--font-sans);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--c-text-soft);
  cursor: pointer;
  transition: all var(--transition);
}

.view-tab:hover {
  background: var(--c-bg-hover);
  color: var(--c-text);
}

.view-tab.active {
  background: var(--c-primary-bg);
  color: var(--c-primary);
  border-color: var(--c-primary-border);
  font-weight: 600;
}

.view-tabs__right {
  margin-left: auto;
  display: flex;
  gap: 6px;
}

/* ===== View Container (fills remaining space) ===== */
.view-container {
  flex: 1;
  position: relative;
  min-height: 0;
  overflow: hidden;
  background: var(--c-bg);
}

.three-container {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
}

.view-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 2;
  background: var(--c-bg);
}

.view-placeholder__content {
  text-align: center;
  pointer-events: auto;
}

.view-placeholder__icon {
  margin-bottom: 10px;
  color: var(--c-primary);
}

.view-placeholder__content p {
  font-size: 0.9rem;
  color: var(--c-text-muted);
  max-width: 320px;
  margin: 0 auto 20px;
  line-height: 1.6;
}

.animating-indicator {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--c-bg-soft);
  border: 1px solid var(--c-border);
  border-radius: 999px;
  font-size: 0.78rem;
  color: var(--c-text-soft);
  z-index: 5;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--c-border);
  border-top-color: var(--c-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ===== Result Panel (collapsible, pinned to bottom) ===== */
.result-panel {
  flex-shrink: 0;
  border-top: 1px solid var(--c-border);
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-bottom: none;
}

.result-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--c-border);
  font-size: 0.85rem;
  font-weight: 600;
  gap: 10px;
  transition: background var(--transition);
}

.result-panel__header:hover {
  background: var(--c-bg-hover);
}

.result-panel__header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.result-panel__toggle {
  background: none;
  border: none;
  padding: 4px;
  color: var(--c-text-muted);
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: color var(--transition);
}

.result-panel__toggle:hover {
  color: var(--c-text);
}

.result-panel__body {
  overflow: hidden;
}

.result-body {
  display: flex;
  gap: 32px;
  padding: 16px 20px;
  flex-wrap: wrap;
}

.result-volume {
  flex-shrink: 0;
}

.result-formula {
  flex: 1;
  min-width: 200px;
}

.result-label {
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-value {
  font-size: 1.1rem;
}

.result-value :deep(.katex-display) {
  margin: 0 !important;
  text-align: left;
}

.result-value :deep(.katex-mathml) {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.result-formula-content {
  overflow-x: auto;
}

.result-formula-content :deep(.katex-display) {
  margin: 0 !important;
  text-align: left;
}

.result-formula-content :deep(.katex-mathml) {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  color: var(--c-text-muted);
  transition: color var(--transition);
  font-family: var(--font-sans);
  font-size: 0.72rem;
}

.copy-btn:hover {
  color: var(--c-primary);
}

.copy-icon--success {
  color: var(--c-success);
}

.copy-label {
  color: var(--c-success);
  font-weight: 600;
}

/* ===== Collapse Transition ===== */
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

/* ===== Result Slide Transition ===== */
.slide-result-enter-active,
.slide-result-leave-active {
  transition: all 0.3s ease;
}

.slide-result-enter-from,
.slide-result-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

/* ===== Responsive ===== */
@media (max-width: 1024px) {
  .rev-page {
    flex-direction: column;
    height: auto;
    min-height: calc(100vh - var(--header-height));
  }

  .rev-sidebar {
    width: 100%;
    min-width: unset;
    max-height: 50vh;
    border-right: none;
    border-bottom: 1px solid var(--c-border);
  }

  .rev-main {
    min-height: 400px;
  }

  .view-container {
    min-height: 300px;
  }

  .result-body {
    flex-direction: column;
    gap: 16px;
  }
}

@media (max-width: 640px) {
  .sidebar-scroll {
    padding: 14px 12px 20px;
  }

  .axis-buttons {
    flex-direction: column;
  }

  .sidebar-actions {
    flex-direction: column;
  }

  .mode-buttons {
    flex-wrap: wrap;
  }
}
</style>
