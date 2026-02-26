// ===================================================================
// RevolutionVolume.ts — Pure TypeScript Revolution Volume page
//
// Replaces RevolutionVolume.vue with direct DOM manipulation.
// All algorithms and logic are preserved exactly as they were.
// ===================================================================

import { t, onLocaleChange } from "@/i18n";
import katex from "katex";
import DOMPurify from "dompurify";
import {
  createCanvas2D,
  type Canvas2DInstance,
  type Canvas2DProps,
} from "@/components/revolution/Canvas2D";
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

import { h, clearElement, setSafeHTML } from "@/utils/dom";
import {
  icon,
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
} from "@/utils/icons";

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

interface CurveInput {
  id: string;
  equation: string;
  color: string;
}

// ===== Module-level state =====

let curveInputs: CurveInput[] = [];
let xMin = -2;
let xMax = 2;
let axis: RotationAxis = "x";
let axisValue = 0;
let display: DisplayOptions = { ...defaultDisplayOptions };
let region: ComputedRegion | null = null;
let result: RevolutionResult | null = null;
let errorMsg = "";
let activeView: "2d" | "3d" = "3d";
let showHelp = false;
let formulaCopied = false;
let isGenerated = false;
let resultCollapsed = false;

// Three.js scene
let threeContainerEl: HTMLElement | null = null;
let threeScene: ReturnType<typeof useThreeScene> | null = null;

// Canvas2D — persistent across renderMain() calls so that viewport state
// (pan / zoom) is preserved and observer / listener churn is avoided.
let canvas2dInstance: Canvas2DInstance | null = null;
let canvas2dContainerEl: HTMLElement | null = null;

// DOM element references for dynamic updates
let rootEl: HTMLElement | null = null;
let sidebarContentEl: HTMLElement | null = null;
let mainContentEl: HTMLElement | null = null;
let cleanupFns: Array<() => void> = [];

// ===== Computed helpers =====

function getParsedCurves(): CurveDefinition[] {
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
}

function isValidEquation(eq: string): boolean {
  return eq.trim() !== "" && parseEquation(eq) !== null;
}

function getCurveLatexMap(): Record<string, string> {
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
}

function getVolumeFormatted(): ReturnType<typeof formatVolume> | null {
  if (!result) return null;
  return formatVolume(result.volume);
}

function getFormulaHtml(): string {
  if (!result) return "";
  try {
    return DOMPurify.sanitize(
      katex.renderToString(result.formulaLatex, {
        throwOnError: false,
        displayMode: true,
      }),
    );
  } catch {
    return DOMPurify.sanitize(result.formulaLatex);
  }
}

function getVolumeHtml(): string {
  const vf = getVolumeFormatted();
  if (!vf) return "";
  try {
    const latex = `V = ${vf.latex} \\approx ${result!.volume.toFixed(4)}`;
    return DOMPurify.sanitize(
      katex.renderToString(latex, {
        throwOnError: false,
        displayMode: true,
      }),
    );
  } catch {
    return "";
  }
}

function canGenerate(): boolean {
  return getParsedCurves().length >= 2;
}

// ===== Actions =====

function addCurve(): void {
  if (curveInputs.length >= 8) return;
  curveInputs.push({
    id: makeId(),
    equation: "",
    color: defaultCurveColors[curveInputs.length % defaultCurveColors.length]!,
  });
  renderSidebar();
}

function removeCurve(index: number): void {
  if (curveInputs.length <= 1) return;
  curveInputs.splice(index, 1);
  renderSidebar();
}

function handleAutoDetect(): void {
  errorMsg = "";
  try {
    const valid = getParsedCurves();
    if (valid.length < 2) {
      return;
    }
    const bounds = autoDetectBounds(valid);
    xMin = parseFloat(bounds.xMin.toFixed(4));
    xMax = parseFloat(bounds.xMax.toFixed(4));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errorMsg = msg;
  }
}

function handleEquationBlur(): void {
  if (getParsedCurves().length >= 2) {
    handleAutoDetect();
  }
  renderSidebar();
  renderMain();
}

function handleGenerate(): void {
  errorMsg = "";
  result = null;
  region = null;
  isGenerated = false;

  try {
    const validCurves = getParsedCurves();
    if (validCurves.length < 2) {
      errorMsg = t("revolution.errors.needAtLeast2");
      renderMain();
      return;
    }

    // Always auto-detect bounds before generating
    handleAutoDetect();

    if (xMin >= xMax) {
      errorMsg = t(
        "revolution.errors.invalidBounds",
        "Could not determine valid bounds. Check your curves.",
      );
      renderMain();
      return;
    }

    const computedRegion = computeRegion(
      validCurves,
      xMin,
      xMax,
      display.resolution * 2,
    );
    region = computedRegion;

    const volumeResult = computeVolume(computedRegion, axis, axisValue);
    result = volumeResult;
    isGenerated = true;
    resultCollapsed = false;

    // Build 3D scene
    if (threeScene && threeScene.getIsReady()) {
      threeScene.buildSolid(computedRegion, axis, axisValue, {
        ...display,
      });
    }

    // If animate is on, start the animation
    if (display.animate) {
      requestAnimationFrame(() => {
        threeScene?.startAnimation(2500);
      });
    }

    // Update Canvas2D
    updateCanvas2D();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errorMsg = msg;
  }

  renderSidebar();
  renderMain();
}

function handleReset(): void {
  curveInputs = [];
  nextCurveId = 1;
  curveInputs.push(
    { id: makeId(), equation: "y = x^2", color: defaultCurveColors[0]! },
    { id: makeId(), equation: "y = 4", color: defaultCurveColors[1]! },
  );
  xMin = -2;
  xMax = 2;
  axis = "x";
  axisValue = 0;
  display = { ...defaultDisplayOptions };
  region = null;
  result = null;
  errorMsg = "";
  isGenerated = false;
  resultCollapsed = false;
  threeScene?.clearScene();
  updateCanvas2D();
  renderSidebar();
  renderMain();
}

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

async function loadPreset(index: number): Promise<void> {
  const preset = presetExamples[index];
  if (!preset) return;

  curveInputs = [];
  nextCurveId = 1;
  for (const c of preset.curves) {
    curveInputs.push({
      id: makeId(),
      equation:
        c.equation ||
        `${c.type === "x_const" || c.type === "x_of_y" ? "x" : "y"} = ${c.expression}`,
      color:
        c.color ||
        defaultCurveColors[curveInputs.length % defaultCurveColors.length]!,
    });
  }
  xMin = preset.xMin;
  xMax = preset.xMax;
  axis = preset.axis;
  axisValue = preset.axisValue;

  renderSidebar();
  renderMain();

  await yieldToMain();

  handleGenerate();
}

function handleDisplayChange(): void {
  if (threeScene && threeScene.getIsReady()) {
    threeScene.updateDisplay({ ...display });
  }
}

function handleAnimateToggle(): void {
  if (display.animate && isGenerated && region) {
    threeScene?.startAnimation(2500);
  } else {
    threeScene?.stopAnimation();
  }
}

function handleExport(): void {
  const dataUrl = threeScene?.takeScreenshot();
  if (!dataUrl) return;
  const link = document.createElement("a");
  link.download = "revolution-volume.png";
  link.href = dataUrl;
  link.click();
}

function handleCopyFormula(): void {
  if (!result) return;
  navigator.clipboard.writeText(result.formulaLatex).then(() => {
    formulaCopied = true;
    renderMain();
    setTimeout(() => {
      formulaCopied = false;
      renderMain();
    }, 2000);
  });
}

function updateCanvas2D(): void {
  if (canvas2dInstance) {
    canvas2dInstance.update({
      curves: getParsedCurves(),
      region,
      xMin,
      xMax,
      axis,
      axisValue,
    });
  }
}

// ===== Build sidebar DOM =====

function buildCurvesSection(): HTMLElement {
  const latexMap = getCurveLatexMap();

  const addBtn = h(
    "button",
    {
      class: "btn btn-sm ml-auto",
      on: { click: () => addCurve() },
    },
    icon(Plus, { size: 14 }) as unknown as HTMLElement,
    " " + t("revolution.curves.add"),
  );
  if (curveInputs.length >= 8) {
    addBtn.setAttribute("disabled", "");
    addBtn.classList.add("opacity-50", "cursor-not-allowed");
  }

  const header = h(
    "div",
    { class: "card-header !px-4 !py-3 !text-[0.85rem]" },
    icon(Activity, { size: 16 }) as unknown as HTMLElement,
    " " + t("revolution.curves.title"),
    addBtn,
  );

  const curveRows: HTMLElement[] = curveInputs.map((curve, index) => {
    const dot = h("div", {
      class: "w-2.5 h-2.5 rounded-full shrink-0 mt-2.5",
      style: `background: ${curve.color}`,
    });

    const input = h("input", {
      type: "text",
      class:
        "flex-1 !text-[0.85rem] !px-2.5 !py-[7px] min-w-0 font-mono" +
        (curve.equation.trim() !== "" && !isValidEquation(curve.equation)
          ? " !border-danger focus:!shadow-[0_0_0_3px_var(--c-danger-bg)]"
          : ""),
      placeholder: "y = x^2, y = 0, x = 3 …",
      value: curve.equation,
      on: {
        input: (e: Event) => {
          curve.equation = (e.target as HTMLInputElement).value;
          // Update latex preview inline
          const previewEl = (e.target as HTMLElement)
            .closest(".curve-row")
            ?.querySelector(".latex-preview") as HTMLElement | null;
          if (previewEl) {
            const tex = equationToLatex(curve.equation);
            if (tex) {
              try {
                setSafeHTML(
                  previewEl,
                  katex.renderToString(tex, {
                    throwOnError: false,
                    displayMode: false,
                  }),
                );
                previewEl.style.display = "";
              } catch {
                previewEl.style.display = "none";
              }
            } else {
              previewEl.style.display = "none";
            }
          }
          // Update input border
          const inputEl = e.target as HTMLInputElement;
          if (
            curve.equation.trim() !== "" &&
            !isValidEquation(curve.equation)
          ) {
            inputEl.classList.add(
              "!border-danger",
              "focus:!shadow-[0_0_0_3px_var(--c-danger-bg)]",
            );
          } else {
            inputEl.classList.remove(
              "!border-danger",
              "focus:!shadow-[0_0_0_3px_var(--c-danger-bg)]",
            );
          }
        },
        keydown: (e: Event) => {
          if ((e as KeyboardEvent).key === "Enter") handleGenerate();
        },
        blur: () => handleEquationBlur(),
      },
    }) as HTMLInputElement;

    const inputRow = h("div", { class: "flex items-center gap-1.5" }, input);

    const latexPreview = h("div", {
      class: "latex-preview",
      style: latexMap[curve.id] ? "" : "display:none",
      safeHTML: latexMap[curve.id] || "",
    });

    const textBlock = h(
      "div",
      { class: "flex-1 flex flex-col gap-1.5 min-w-0" },
      inputRow,
      latexPreview,
    );

    const removeBtn = h(
      "button",
      {
        class: "btn btn-sm btn-danger shrink-0 mt-1 !p-1.5 !w-7 !h-7",
        title: t("revolution.curves.remove"),
        on: { click: () => removeCurve(index) },
      },
      icon(X, { size: 14 }) as unknown as HTMLElement,
    );
    if (curveInputs.length <= 1) {
      removeBtn.setAttribute("disabled", "");
      removeBtn.classList.add("opacity-50", "cursor-not-allowed");
    }

    return h(
      "div",
      {
        class:
          "curve-row flex items-start gap-2.5 mb-3 pb-3 border-b border-border-light last:mb-0 last:pb-0 last:border-b-0",
      },
      dot,
      textBlock,
      removeBtn,
    );
  });

  const hint = h(
    "p",
    { class: "text-[0.75rem] text-text-muted mt-1 leading-normal" },
    t("revolution.curves.hint"),
  );

  const body = h(
    "div",
    { class: "card-body !px-4 !py-3.5" },
    ...curveRows,
    hint,
  );

  return h("section", { class: "shrink-0 card" }, header, body);
}

function buildAxisSection(): HTMLElement {
  const header = h(
    "div",
    { class: "card-header !px-4 !py-3 !text-[0.85rem]" },
    icon(RefreshCw, { size: 16 }) as unknown as HTMLElement,
    " " + t("revolution.axis.title"),
  );

  const xBtn = h(
    "button",
    {
      class: "axis-btn" + (axis === "x" ? " active" : ""),
      on: {
        click: () => {
          axis = "x";
          renderSidebar();
        },
      },
    },
    icon(MoveHorizontal, {
      size: 14,
      class: "shrink-0",
    }) as unknown as HTMLElement,
    " " + t("revolution.axis.xAxis"),
  );

  const yBtn = h(
    "button",
    {
      class: "axis-btn" + (axis === "y" ? " active" : ""),
      on: {
        click: () => {
          axis = "y";
          renderSidebar();
        },
      },
    },
    icon(MoveVertical, {
      size: 14,
      class: "shrink-0",
    }) as unknown as HTMLElement,
    " " + t("revolution.axis.yAxis"),
  );

  const btnGroup = h(
    "div",
    { class: "flex gap-2 mb-3 max-sm:flex-col" },
    xBtn,
    yBtn,
  );

  const axisLabel = h(
    "label",
    { class: "!mb-0 whitespace-nowrap" },
    t("revolution.axis.axisValue"),
  );

  const axisInput = h("input", {
    type: "number",
    class: "!w-[100px] !text-[0.85rem] !px-2.5 !py-[7px]",
    value: String(axisValue),
    step: "0.5",
    on: {
      input: (e: Event) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(val)) axisValue = val;
      },
    },
  });

  const axisRow = h(
    "div",
    { class: "flex items-center gap-2.5" },
    axisLabel,
    axisInput,
  );

  const body = h(
    "div",
    { class: "card-body !px-4 !py-3.5" },
    btnGroup,
    axisRow,
  );

  return h("section", { class: "shrink-0 card" }, header, body);
}

function buildDisplaySection(): HTMLElement {
  const header = h(
    "div",
    { class: "card-header !px-4 !py-3 !text-[0.85rem]" },
    icon(Settings, { size: 16 }) as unknown as HTMLElement,
    " " + t("revolution.display.title"),
  );

  // Render mode buttons
  const modeLabel = h("label", {}, t("revolution.display.solid"));
  const modes: Array<{ key: DisplayOptions["mode"]; label: string }> = [
    { key: "solid", label: t("revolution.display.solid") },
    { key: "wireframe", label: t("revolution.display.wireframe") },
    { key: "transparent", label: t("revolution.display.transparent") },
  ];
  const modeButtons = modes.map((m) =>
    h(
      "button",
      {
        class: "mode-btn" + (display.mode === m.key ? " active" : ""),
        on: {
          click: () => {
            display.mode = m.key;
            handleDisplayChange();
            renderSidebar();
          },
        },
      },
      m.label,
    ),
  );
  const modeRow = h(
    "div",
    { class: "flex flex-col gap-1.5" },
    modeLabel,
    h("div", { class: "flex gap-1 max-sm:flex-wrap" }, ...modeButtons),
  );

  // Opacity (only when transparent)
  let opacityRow: HTMLElement | null = null;
  if (display.mode === "transparent") {
    const opacityLabel = h(
      "label",
      {},
      t("revolution.display.opacity") + ": " + display.opacity.toFixed(2),
    );
    const opacityInput = h("input", {
      type: "range",
      min: "0.1",
      max: "1",
      step: "0.05",
      value: String(display.opacity),
      on: {
        input: (e: Event) => {
          display.opacity = parseFloat((e.target as HTMLInputElement).value);
          handleDisplayChange();
          // Update label text
          const label = (e.target as HTMLElement).parentElement?.querySelector(
            "label",
          );
          if (label)
            label.textContent =
              t("revolution.display.opacity") +
              ": " +
              display.opacity.toFixed(2);
        },
      },
    });
    opacityRow = h(
      "div",
      { class: "flex flex-col gap-1.5" },
      opacityLabel,
      opacityInput,
    );
  }

  // Color
  const colorLabel = h(
    "label",
    { class: "!mb-0" },
    t("revolution.display.color"),
  );
  const colorInput = h("input", {
    type: "color",
    value: display.color,
    on: {
      input: (e: Event) => {
        display.color = (e.target as HTMLInputElement).value;
        handleDisplayChange();
      },
    },
  });
  const colorRow = h(
    "div",
    { class: "flex flex-row items-center justify-between gap-1.5" },
    colorLabel,
    colorInput,
  );

  // Resolution
  const resLabel = h(
    "label",
    {},
    t("revolution.display.resolution") + ": " + display.resolution,
  );
  const resInput = h("input", {
    type: "range",
    min: "16",
    max: "128",
    step: "8",
    value: String(display.resolution),
    on: {
      input: (e: Event) => {
        display.resolution = parseInt((e.target as HTMLInputElement).value, 10);
        const label = (e.target as HTMLElement).parentElement?.querySelector(
          "label",
        );
        if (label)
          label.textContent =
            t("revolution.display.resolution") + ": " + display.resolution;
      },
    },
  });
  const resRow = h(
    "div",
    { class: "flex flex-col gap-1.5" },
    resLabel,
    resInput,
  );

  // Toggle helpers
  function createToggle(
    labelText: string,
    checked: boolean,
    onChange: (val: boolean) => void,
  ): HTMLElement {
    const lbl = h("label", { class: "!mb-0" }, labelText);
    const input = h("input", {
      type: "checkbox",
      on: {
        change: (e: Event) => {
          onChange((e.target as HTMLInputElement).checked);
        },
      },
    }) as HTMLInputElement;
    input.checked = checked;
    const slider = h("span", { class: "slider" });
    const toggle = h("label", { class: "toggle" }, input, slider);
    return h(
      "div",
      { class: "flex flex-row items-center justify-between gap-1.5" },
      lbl,
      toggle,
    );
  }

  const axesToggle = createToggle(
    t("revolution.display.showAxes"),
    display.showAxes,
    (v) => {
      display.showAxes = v;
      handleDisplayChange();
    },
  );
  const gridToggle = createToggle(
    t("revolution.display.showGrid"),
    display.showGrid,
    (v) => {
      display.showGrid = v;
      handleDisplayChange();
    },
  );
  const csToggle = createToggle(
    t("revolution.display.showCrossSection"),
    display.showCrossSection,
    (v) => {
      display.showCrossSection = v;
      handleDisplayChange();
    },
  );
  const animToggle = createToggle(
    t("revolution.display.animate"),
    display.animate,
    (v) => {
      display.animate = v;
      handleAnimateToggle();
    },
  );

  const body = h(
    "div",
    { class: "card-body !px-4 !py-3.5 flex flex-col gap-3" },
    modeRow,
    ...(opacityRow ? [opacityRow] : []),
    colorRow,
    resRow,
    axesToggle,
    gridToggle,
    csToggle,
    animToggle,
  );

  return h("section", { class: "shrink-0 card" }, header, body);
}

function buildPresetsSection(): HTMLElement {
  const header = h(
    "div",
    { class: "card-header !px-4 !py-3 !text-[0.85rem]" },
    icon(BookOpen, { size: 16 }) as unknown as HTMLElement,
    " " + t("revolution.presets.title"),
  );

  const buttons = presetExamples.map((preset, idx) =>
    h(
      "button",
      {
        class: "preset-btn",
        on: { click: () => loadPreset(idx) },
      },
      h(
        "div",
        { class: "text-[0.85rem] font-semibold text-text mb-0.5" },
        t(preset.nameKey),
      ),
      h(
        "div",
        { class: "text-[0.75rem] text-text-muted leading-snug" },
        t(preset.descKey),
      ),
    ),
  );

  const body = h(
    "div",
    { class: "card-body !px-4 !py-3.5 flex flex-col gap-2" },
    ...buttons,
  );

  return h("section", { class: "shrink-0 card" }, header, body);
}

function buildActionButtons(): HTMLElement {
  const genBtn = h(
    "button",
    {
      class: "btn btn-primary flex-1",
      on: { click: () => handleGenerate() },
    },
    icon(Play, { size: 16 }) as unknown as HTMLElement,
    " " + t("revolution.generate"),
  );
  if (!canGenerate()) {
    genBtn.setAttribute("disabled", "");
    genBtn.classList.add("opacity-50", "cursor-not-allowed");
  }

  const resetBtn = h(
    "button",
    {
      class: "btn flex-1",
      on: { click: () => handleReset() },
    },
    icon(RotateCcw, { size: 16 }) as unknown as HTMLElement,
    " " + t("revolution.reset"),
  );

  return h(
    "div",
    { class: "flex gap-2.5 pt-1 max-sm:flex-col" },
    genBtn,
    resetBtn,
  );
}

function buildHelpSection(): HTMLElement {
  const helpToggle = h(
    "button",
    {
      class:
        "flex items-center gap-1.5 text-[0.82rem] cursor-pointer bg-transparent border-none p-0 text-text-soft hover:text-primary transition-colors duration-200",
      style: "font-family: var(--font-sans)",
      on: {
        click: () => {
          showHelp = !showHelp;
          renderSidebar();
        },
      },
    },
    icon(HelpCircle, { size: 14 }) as unknown as HTMLElement,
    " " + t("revolution.help.title"),
  );

  const container = h("div", {}, helpToggle);

  if (showHelp) {
    const helpCard = h(
      "section",
      {
        class: "shrink-0 card bg-primary-bg !border-primary-border mt-3.5",
      },
      h(
        "div",
        { class: "card-body !px-4 !py-3.5" },
        h(
          "h3",
          { class: "text-[0.9rem] font-bold mb-2.5 text-primary" },
          t("revolution.help.title"),
        ),
        h(
          "ol",
          {
            class: "pl-5 mb-3 text-[0.82rem] leading-loose text-text-soft",
          },
          h("li", {}, t("revolution.help.step1")),
          h("li", {}, t("revolution.help.step2")),
          h("li", {}, t("revolution.help.step3")),
          h("li", {}, t("revolution.help.step4")),
        ),
        h(
          "p",
          {
            class:
              "mt-3 text-[0.8rem] text-text-soft inline-flex items-center gap-1.5",
          },
          icon(Lightbulb, {
            size: 14,
            class: "text-warning shrink-0",
          }) as unknown as HTMLElement,
          " " + t("revolution.help.tip"),
        ),
      ),
    );
    container.appendChild(helpCard);
  }

  return container;
}

function renderSidebar(): void {
  if (!sidebarContentEl) return;
  clearElement(sidebarContentEl);

  // Title
  const titleSection = h(
    "div",
    { class: "mb-1" },
    h(
      "h1",
      {
        class: "text-[1.25rem] font-bold flex items-center gap-2 mb-1.5",
      },
      icon(RefreshCw, {
        size: 18,
        class: "text-primary shrink-0",
      }) as unknown as HTMLElement,
      " " + t("revolution.title"),
    ),
    h(
      "p",
      { class: "text-[0.82rem] leading-relaxed text-text-soft" },
      t("revolution.description"),
    ),
  );

  sidebarContentEl.appendChild(titleSection);
  sidebarContentEl.appendChild(buildCurvesSection());
  sidebarContentEl.appendChild(buildAxisSection());
  sidebarContentEl.appendChild(buildDisplaySection());
  sidebarContentEl.appendChild(buildPresetsSection());
  sidebarContentEl.appendChild(buildActionButtons());
  sidebarContentEl.appendChild(buildHelpSection());
}

// ===== Build main content DOM =====

function buildErrorBanner(): HTMLElement | null {
  if (!errorMsg) return null;

  const banner = h(
    "div",
    {
      class:
        "flex items-center gap-2.5 px-4 py-2.5 bg-danger-bg text-danger text-[0.85rem] font-medium border-b border-danger/20 shrink-0",
    },
    icon(XCircle, { size: 16 }) as unknown as HTMLElement,
    h("span", {}, errorMsg),
    h(
      "button",
      {
        class:
          "ml-auto bg-transparent border-none cursor-pointer p-1 text-danger flex items-center",
        on: {
          click: () => {
            errorMsg = "";
            renderMain();
          },
        },
      },
      icon(X, { size: 14 }) as unknown as HTMLElement,
    ),
  );

  return banner;
}

function buildViewTabs(): HTMLElement {
  const tab3d = h(
    "button",
    {
      class: "view-tab" + (activeView === "3d" ? " active" : ""),
      on: {
        click: () => {
          activeView = "3d";
          renderMain();
        },
      },
    },
    icon(Layers, { size: 14 }) as unknown as HTMLElement,
    " " + t("revolution.view3D"),
  );

  const tab2d = h(
    "button",
    {
      class: "view-tab" + (activeView === "2d" ? " active" : ""),
      on: {
        click: () => {
          activeView = "2d";
          renderMain();
        },
      },
    },
    icon(LayoutGrid, { size: 14 }) as unknown as HTMLElement,
    " " + t("revolution.view2D"),
  );

  const rightActions = h("div", { class: "ml-auto flex gap-1.5" });

  if (activeView === "3d") {
    const resetCamBtn = h(
      "button",
      {
        class: "btn btn-sm",
        title: "Reset camera",
        on: { click: () => threeScene?.resetCamera() },
      },
      icon(Eye, { size: 14 }) as unknown as HTMLElement,
    );
    rightActions.appendChild(resetCamBtn);
  }

  const exportBtn = h(
    "button",
    {
      class: "btn btn-sm",
      title: t("revolution.export"),
      on: { click: () => handleExport() },
    },
    icon(Download, { size: 14 }) as unknown as HTMLElement,
    " " + t("revolution.export"),
  );
  rightActions.appendChild(exportBtn);

  return h(
    "div",
    {
      class:
        "flex items-center gap-1 px-4 py-2 border-b border-border bg-bg-soft shrink-0 z-10",
    },
    tab3d,
    tab2d,
    rightActions,
  );
}

function build3DView(): HTMLElement {
  const container = h("div", {
    class: "flex-1 relative min-h-0 overflow-hidden bg-bg max-lg:min-h-[300px]",
    style: activeView === "3d" ? "" : "display:none",
  });

  // Three.js container
  if (!threeContainerEl) {
    threeContainerEl = h("div", {
      class: "w-full h-full absolute inset-0",
    });
  }
  container.appendChild(threeContainerEl);

  // Placeholder when not generated
  if (!isGenerated) {
    const placeholder = h(
      "div",
      {
        class:
          "absolute inset-0 flex items-center justify-center pointer-events-none z-[2] bg-bg",
      },
      h(
        "div",
        { class: "text-center pointer-events-auto" },
        icon(Palette, {
          size: 28,
          class: "mb-2.5 text-primary mx-auto",
        }) as unknown as HTMLElement,
        h(
          "p",
          {
            class:
              "text-[0.9rem] text-text-muted max-w-[320px] mx-auto mb-5 leading-relaxed",
          },
          t("revolution.description"),
        ),
        (() => {
          const btn = h(
            "button",
            {
              class: "btn btn-primary btn-sm",
              on: { click: () => handleGenerate() },
            },
            t("revolution.generate"),
          );
          if (!canGenerate()) {
            btn.setAttribute("disabled", "");
            btn.classList.add("opacity-50", "cursor-not-allowed");
          }
          return btn;
        })(),
      ),
    );
    container.appendChild(placeholder);
  }

  // Animation indicator
  if (threeScene?.getIsAnimating()) {
    const animIndicator = h(
      "div",
      {
        class:
          "absolute top-3 left-3 flex items-center gap-2 px-3.5 py-1.5 bg-bg-soft border border-border rounded-full text-[0.78rem] text-text-soft z-[5]",
      },
      h("div", { class: "spinner" }),
      h("span", {}, t("revolution.display.animate") + "..."),
    );
    container.appendChild(animIndicator);
  }

  return container;
}

function build2DView(): HTMLElement {
  // If the persistent container already exists, just re-parent it and
  // push the latest props — no destroy / re-create needed.
  if (canvas2dContainerEl && canvas2dInstance) {
    // Detach from old parent if still attached
    if (canvas2dContainerEl.parentNode) {
      canvas2dContainerEl.parentNode.removeChild(canvas2dContainerEl);
    }
    canvas2dContainerEl.style.display = activeView === "2d" ? "" : "none";
    // Push latest props without resetting viewport state
    canvas2dInstance.update({
      curves: getParsedCurves(),
      region,
      xMin,
      xMax,
      axis,
      axisValue,
    });
    return canvas2dContainerEl;
  }

  // First mount — create the wrapper and the Canvas2D instance once.
  canvas2dContainerEl = h("div", {
    class: "flex-1 relative min-h-0 overflow-hidden bg-bg max-lg:min-h-[300px]",
    style: activeView === "2d" ? "" : "display:none",
  });

  const canvasProps: Canvas2DProps = {
    curves: getParsedCurves(),
    region,
    xMin,
    xMax,
    axis,
    axisValue,
  };

  canvas2dInstance = createCanvas2D(canvas2dContainerEl, canvasProps);

  return canvas2dContainerEl;
}

function buildResultPanel(): HTMLElement | null {
  if (!result) return null;

  const headerContent = h(
    "div",
    { class: "flex items-center gap-2.5" },
    icon(TrendingUp, { size: 16 }) as unknown as HTMLElement,
    " " + t("revolution.result.title") + " ",
    h("span", { class: "badge badge-success" }, t(result.methodKey)),
  );

  const collapseIcon = resultCollapsed
    ? (icon(ChevronDown, { size: 18 }) as unknown as HTMLElement)
    : (icon(ChevronUp, { size: 18 }) as unknown as HTMLElement);

  const collapseBtn = h(
    "button",
    {
      class:
        "bg-transparent border-none p-1 text-text-muted flex items-center cursor-pointer hover:text-text transition-colors duration-200",
    },
    collapseIcon,
  );

  const panelHeader = h(
    "div",
    {
      class:
        "flex items-center justify-between px-5 py-3 cursor-pointer select-none border-b border-border text-[0.85rem] font-semibold gap-2.5 hover:bg-bg-hover transition-colors duration-200",
      on: {
        click: () => {
          resultCollapsed = !resultCollapsed;
          renderMain();
        },
      },
    },
    headerContent,
    collapseBtn,
  );

  const panel = h(
    "div",
    {
      class:
        "shrink-0 card !rounded-none !border-x-0 !border-b-0 border-t border-border",
    },
    panelHeader,
  );

  if (!resultCollapsed) {
    // Volume
    const volumeLabel = h(
      "div",
      { class: "result-label text-text-soft" },
      t("revolution.result.volume"),
    );
    const volumeKatex = h("div", {
      class: "text-[1.1rem] katex-result",
      safeHTML: getVolumeHtml(),
    });
    const volumeBlock = h(
      "div",
      { class: "shrink-0" },
      volumeLabel,
      volumeKatex,
    );

    // Formula with copy button
    const copyIcon = formulaCopied
      ? (icon(Check, {
          size: 13,
          class: "text-success",
        }) as unknown as HTMLElement)
      : (icon(Copy, { size: 13 }) as unknown as HTMLElement);
    const copyText = formulaCopied
      ? h(
          "span",
          { class: "text-success font-semibold" },
          t("revolution.result.copied"),
        )
      : null;

    const copyBtn = h(
      "button",
      {
        class: "copy-btn",
        title: t("revolution.result.copyFormula"),
        on: {
          click: (e: Event) => {
            e.stopPropagation();
            handleCopyFormula();
          },
        },
      },
      copyIcon,
      ...(copyText ? [copyText] : []),
    );

    const formulaLabel = h(
      "div",
      { class: "result-label text-text-soft" },
      t("revolution.result.formula") + " ",
      copyBtn,
    );
    const formulaKatex = h("div", {
      class: "overflow-x-auto katex-result",
      safeHTML: getFormulaHtml(),
    });
    const formulaBlock = h(
      "div",
      { class: "flex-1 min-w-[200px]" },
      formulaLabel,
      formulaKatex,
    );

    const resultBody = h(
      "div",
      {
        class: "flex gap-8 px-5 py-4 flex-wrap max-lg:flex-col max-lg:gap-4",
      },
      volumeBlock,
      formulaBlock,
    );

    const bodyWrapper = h("div", { class: "overflow-hidden" }, resultBody);

    panel.appendChild(bodyWrapper);
  }

  return panel;
}

function renderMain(): void {
  if (!mainContentEl) return;

  // Detach persistent elements before clearing so they survive the wipe.
  if (threeContainerEl && threeContainerEl.parentNode) {
    threeContainerEl.parentNode.removeChild(threeContainerEl);
  }
  if (canvas2dContainerEl && canvas2dContainerEl.parentNode) {
    canvas2dContainerEl.parentNode.removeChild(canvas2dContainerEl);
  }

  clearElement(mainContentEl);

  // Error banner
  const errBanner = buildErrorBanner();
  if (errBanner) mainContentEl.appendChild(errBanner);

  // View tabs
  mainContentEl.appendChild(buildViewTabs());

  // 3D view
  mainContentEl.appendChild(build3DView());

  // 2D view
  mainContentEl.appendChild(build2DView());

  // Result panel
  const resultPanel = buildResultPanel();
  if (resultPanel) mainContentEl.appendChild(resultPanel);
}

// ===== Mount =====

export function mountRevolutionVolumePage(container: HTMLElement): () => void {
  // Initialize state
  curveInputs = [
    { id: makeId(), equation: "y = x^2", color: defaultCurveColors[0]! },
    { id: makeId(), equation: "y = 4", color: defaultCurveColors[1]! },
  ];
  xMin = -2;
  xMax = 2;
  axis = "x";
  axisValue = 0;
  display = { ...defaultDisplayOptions };
  region = null;
  result = null;
  errorMsg = "";
  activeView = "3d";
  showHelp = false;
  formulaCopied = false;
  isGenerated = false;
  resultCollapsed = false;
  threeContainerEl = null;
  canvas2dContainerEl = null;

  // Root layout
  rootEl = h("div", {
    class:
      "flex flex-1 h-[calc(100vh-var(--header-height))] min-h-[calc(100vh-var(--header-height))] max-h-[calc(100vh-var(--header-height))] overflow-hidden max-lg:flex-col max-lg:h-auto max-lg:min-h-[calc(100vh-var(--header-height))] max-lg:max-h-none",
  });

  // Sidebar
  const aside = h("aside", {
    class:
      "w-[380px] min-w-[380px] h-full min-h-0 border-r border-border bg-bg-soft flex flex-col overflow-hidden max-lg:w-full max-lg:min-w-0 max-lg:max-h-[50vh] max-lg:border-r-0 max-lg:border-b",
  });

  sidebarContentEl = h("div", {
    class:
      "flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-5 pb-6 flex flex-col gap-3.5 max-sm:px-3 max-sm:pt-3.5 max-sm:pb-5",
    style: "-webkit-overflow-scrolling: touch; scrollbar-gutter: stable;",
  });
  aside.appendChild(sidebarContentEl);

  // Main content
  mainContentEl = h("main", {
    class: "flex-1 flex flex-col min-w-0 overflow-hidden max-lg:min-h-[400px]",
  });

  rootEl.appendChild(aside);
  rootEl.appendChild(mainContentEl);
  container.appendChild(rootEl);

  // Initial render
  renderSidebar();
  renderMain();

  // Initialize Three.js
  requestAnimationFrame(() => {
    if (threeContainerEl) {
      threeScene = useThreeScene(() => threeContainerEl);
      threeScene.init();
      const isDark =
        document.documentElement.getAttribute("data-theme") === "dark";
      threeScene.updateBackground(isDark);
    }
  });

  // Watch theme for Three.js
  const themeObserver = new MutationObserver(() => {
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    threeScene?.updateBackground(isDark);
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  cleanupFns.push(() => themeObserver.disconnect());

  // Locale change
  const unsubLocale = onLocaleChange(() => {
    renderSidebar();
    renderMain();
  });
  cleanupFns.push(unsubLocale);

  // Cleanup function
  return () => {
    for (const fn of cleanupFns) fn();
    cleanupFns = [];

    if (canvas2dInstance) {
      canvas2dInstance.destroy();
      canvas2dInstance = null;
      canvas2dContainerEl = null;
    }

    if (threeScene) {
      threeScene.dispose();
      threeScene = null;
    }

    threeContainerEl = null;
    sidebarContentEl = null;
    mainContentEl = null;

    if (rootEl && rootEl.parentNode) {
      rootEl.parentNode.removeChild(rootEl);
    }
    rootEl = null;
  };
}
