import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "@/i18n";
import katex from "katex";
import DOMPurify from "dompurify";
import Canvas2D from "@/components/revolution/Canvas2D";
import type { Canvas2DHandle } from "@/components/revolution/Canvas2D";
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
  Check,
  ChevronDown,
  ChevronUp,
  MoveHorizontal,
  MoveVertical,
  Lightbulb,
  Palette,
  Copy,
} from "lucide-react";

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

export default function RevolutionVolume() {
  const { t } = useTranslation();

  // Default: use the "parabola & line" preset values (y=x^2 and y=x, bounds 0–1)
  const [curveInputs, setCurveInputs] = useState<CurveInput[]>([
    { id: makeId(), equation: "y = x^2", color: defaultCurveColors[0] },
    { id: makeId(), equation: "y = x", color: defaultCurveColors[1] },
  ]);
  const [xMin, setXMin] = useState(0);
  const [xMax, setXMax] = useState(1);
  const [axis, setAxis] = useState<RotationAxis>("x");
  const [axisValue, setAxisValue] = useState(0);
  const [display, setDisplay] = useState<DisplayOptions>(defaultDisplayOptions);

  const [region, setRegion] = useState<ComputedRegion | null>(null);
  const [result, setResult] = useState<RevolutionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeView, setActiveView] = useState<"2d" | "3d">("3d");
  const [showHelp, setShowHelp] = useState(false);
  const [formulaCopied, setFormulaCopied] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const [resultCollapsed, setResultCollapsed] = useState(false);
  const [shouldGenerate, setShouldGenerate] = useState(false);

  const threeContainerRef = useRef<HTMLDivElement>(null);
  const threeSceneRef = useRef<ReturnType<typeof useThreeScene> | null>(null);
  const canvas2DRef = useRef<Canvas2DHandle>(null);

  // Initialize Three.js scene — Strict Mode safe
  useEffect(() => {
    const sceneInstance = useThreeScene(() => threeContainerRef.current);
    threeSceneRef.current = sceneInstance;

    const rafId = requestAnimationFrame(() => {
      if (threeContainerRef.current && !sceneInstance.getIsReady()) {
        sceneInstance.init();
        const isDark =
          document.documentElement.getAttribute("data-theme") === "dark";
        sceneInstance.updateBackground(isDark);
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
      sceneInstance.dispose();
      if (threeSceneRef.current === sceneInstance) {
        threeSceneRef.current = null;
      }
    };
  }, []);

  // Watch theme for Three.js
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isDark =
        document.documentElement.getAttribute("data-theme") === "dark";
      if (threeSceneRef.current) {
        threeSceneRef.current.updateBackground(isDark);
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Update Three.js display options
  useEffect(() => {
    if (threeSceneRef.current && isGenerated) {
      threeSceneRef.current.updateDisplay(display);
    }
  }, [display, isGenerated]);

  // Sync 3D solid color with the first curve's color when curves change
  useEffect(() => {
    if (threeSceneRef.current && isGenerated) {
      const solidColor = curveInputs[0]?.color || defaultCurveColors[0];
      threeSceneRef.current.updateDisplay({ color: solidColor });
    }
  }, [curveInputs, isGenerated]);

  // Disable right-click on the entire revolution page
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  const parsedCurves = useMemo(() => {
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
  }, [curveInputs]);

  const canGenerate = parsedCurves.length >= 2;

  const handleAddCurve = () => {
    if (curveInputs.length >= 8) return;
    setCurveInputs([
      ...curveInputs,
      {
        id: makeId(),
        equation: "",
        color:
          defaultCurveColors[curveInputs.length % defaultCurveColors.length],
      },
    ]);
  };

  const handleRemoveCurve = (id: string) => {
    setCurveInputs(curveInputs.filter((c) => c.id !== id));
  };

  const handleCurveChange = (
    id: string,
    field: keyof CurveInput,
    value: string,
  ) => {
    setCurveInputs(
      curveInputs.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  };

  const handleAutoDetect = () => {
    if (parsedCurves.length < 2) {
      setErrorMsg(
        t(
          "revolution.errors.needTwoCurves",
          "Need at least two valid curves to auto-detect bounds.",
        ),
      );
      return;
    }
    try {
      const bounds = autoDetectBounds(parsedCurves);
      if (bounds) {
        setXMin(bounds.xMin);
        setXMax(bounds.xMax);
        setErrorMsg("");
      } else {
        setErrorMsg(
          t(
            "revolution.errors.noIntersections",
            "Could not find valid intersections. Please set bounds manually.",
          ),
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Auto-detect failed.");
    }
  };

  const handleGenerate = useCallback(() => {
    if (!canGenerate) {
      setErrorMsg(
        t("revolution.errors.needTwoCurves", "Need at least two valid curves."),
      );
      return;
    }
    if (xMin >= xMax) {
      setErrorMsg(
        t("revolution.errors.invalidBounds", "xMin must be less than xMax."),
      );
      return;
    }

    try {
      const computedRegion = computeRegion(parsedCurves, xMin, xMax);
      if (!computedRegion || computedRegion.upperProfile.length === 0) {
        throw new Error(
          t("revolution.errors.noRegion", "Could not compute a valid region."),
        );
      }

      const volumeResult = computeVolume(computedRegion, axis, axisValue);

      setRegion(computedRegion);
      setResult(volumeResult);
      setIsGenerated(true);
      setErrorMsg("");
      setResultCollapsed(false);

      // Auto switch to 3D view after generate
      setActiveView("3d");

      // Derive 3D solid color from the first curve's color
      const solidColor = curveInputs[0]?.color || defaultCurveColors[0];
      const displayWithCurveColor = { ...display, color: solidColor };

      const buildIt = () => {
        if (threeSceneRef.current && threeSceneRef.current.getIsReady()) {
          threeSceneRef.current.buildSolid(
            computedRegion,
            axis,
            axisValue,
            displayWithCurveColor,
          );
          if (display.animate) {
            requestAnimationFrame(() => {
              threeSceneRef.current?.startAnimation(2500);
            });
          }
        }
      };

      buildIt();
      requestAnimationFrame(buildIt);
    } catch (err: any) {
      setErrorMsg(err.message || "Generation failed.");
      setIsGenerated(false);
    }
  }, [
    canGenerate,
    parsedCurves,
    xMin,
    xMax,
    axis,
    axisValue,
    display,
    curveInputs,
    t,
  ]);

  useEffect(() => {
    if (shouldGenerate) {
      handleGenerate();
      setShouldGenerate(false);
    }
  }, [shouldGenerate, handleGenerate]);

  const handleReset = () => {
    setCurveInputs([
      { id: makeId(), equation: "", color: defaultCurveColors[0] },
      { id: makeId(), equation: "", color: defaultCurveColors[1] },
    ]);
    setXMin(0);
    setXMax(1);
    setAxis("x");
    setAxisValue(0);
    setRegion(null);
    setResult(null);
    setIsGenerated(false);
    setErrorMsg("");
    if (threeSceneRef.current) {
      threeSceneRef.current.clearScene();
    }
  };

  const loadPreset = (preset: any) => {
    setCurveInputs(
      preset.curves.map((c: any, i: number) => ({
        id: makeId(),
        equation: c.equation,
        color: c.color || defaultCurveColors[i % defaultCurveColors.length],
      })),
    );
    setXMin(preset.xMin);
    setXMax(preset.xMax);
    setAxis(preset.axis);
    setAxisValue(preset.axisValue);
    setShouldGenerate(true);
  };

  // Click-to-copy formula (replaces the copy button)
  const handleCopyFormula = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.formulaLatex).then(() => {
      setFormulaCopied(true);
      setTimeout(() => setFormulaCopied(false), 2000);
    });
  };

  // Export image — works for both 2D and 3D
  const handleExport = () => {
    if (activeView === "3d" && threeSceneRef.current) {
      const dataUrl = threeSceneRef.current.takeScreenshot();
      if (dataUrl) {
        const link = document.createElement("a");
        link.download = "revolution-3d.png";
        link.href = dataUrl;
        link.click();
      }
    } else if (activeView === "2d" && canvas2DRef.current) {
      const dataUrl = canvas2DRef.current.takeScreenshot();
      if (dataUrl) {
        const link = document.createElement("a");
        link.download = "revolution-2d.png";
        link.href = dataUrl;
        link.click();
      }
    }
  };

  const renderLatex = (equation: string) => {
    if (!equation.trim()) return null;
    const tex = equationToLatex(equation);
    if (!tex) return null;
    try {
      const html = katex.renderToString(tex, {
        throwOnError: false,
        displayMode: false,
      });
      return (
        <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
      );
    } catch {
      return null;
    }
  };

  const volumeFormatted = result ? formatVolume(result.volume) : null;
  const volumeHtml = volumeFormatted
    ? DOMPurify.sanitize(
        katex.renderToString(
          `V = ${volumeFormatted.latex} \\approx ${result!.volume.toFixed(4)}`,
          {
            throwOnError: false,
            displayMode: true,
          },
        ),
      )
    : "";

  const formulaHtml = result
    ? DOMPurify.sanitize(
        katex.renderToString(result.formulaLatex, {
          throwOnError: false,
          displayMode: true,
        }),
      )
    : "";

  // Height of the collapsed result bar
  const resultBarHeight = isGenerated && result ? "44px" : "0px";

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg text-text">
      {/* Sidebar */}
      <aside className="w-full md:w-[380px] lg:w-[420px] h-full flex flex-col border-r border-border bg-bg-soft shrink-0 z-10 overflow-y-auto custom-scrollbar">
        <div className="p-5 flex flex-col gap-6">
          {/* Title */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-primary">
              <RefreshCw size={24} />
              <h1 className="text-xl font-bold tracking-tight">
                {t("revolution.title", "Revolution Volume")}
              </h1>
            </div>
            <button
              className="p-2 rounded-md text-text-soft hover:text-text hover:bg-bg transition-colors"
              onClick={() => setShowHelp(!showHelp)}
              title={t("revolution.help.title", "Help")}
            >
              <HelpCircle size={20} />
            </button>
          </div>

          {/* Help Section — unified .card style */}
          {showHelp && (
            <div className="card">
              <div className="card-header text-primary">
                <BookOpen size={16} />
                <span>{t("revolution.help.howToUse", "How to use")}</span>
              </div>
              <div className="card-body text-sm text-text-soft leading-relaxed">
                <ul className="list-disc pl-5 space-y-1.5 mb-3">
                  <li>
                    {t(
                      "revolution.help.step1",
                      "Enter at least two curves (e.g., y = x^2, y = x).",
                    )}
                  </li>
                  <li>
                    {t(
                      "revolution.help.step2",
                      "Set the x-axis bounds or use Auto-detect.",
                    )}
                  </li>
                  <li>
                    {t(
                      "revolution.help.step3",
                      "Choose the axis of revolution.",
                    )}
                  </li>
                  <li>
                    {t(
                      "revolution.help.step4",
                      "Click Generate to compute the volume and visualize.",
                    )}
                  </li>
                </ul>
                <p className="text-xs opacity-80">
                  {t(
                    "revolution.help.supported",
                    "Supported functions: sin, cos, tan, sqrt, exp, log, pi, e, etc.",
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Curves Section */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-text uppercase tracking-wider flex items-center gap-2">
                <Activity size={16} className="text-primary" />
                {t("revolution.curves.title", "Curves")}
              </h2>
              <button
                className="btn btn-sm bg-bg border border-border hover:border-primary hover:text-primary text-xs gap-1"
                onClick={handleAddCurve}
                disabled={curveInputs.length >= 8}
              >
                <Plus size={14} />
                {t("revolution.curves.add", "Add")}
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              {curveInputs.map((curve) => (
                <div key={curve.id} className="card flex flex-col gap-1.5 p-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: curve.color }}
                    />
                    <input
                      type="text"
                      className="flex-1 bg-transparent border-none outline-none text-sm font-mono text-text placeholder:text-text-muted"
                      placeholder={`e.g. y = x^2`}
                      value={curve.equation}
                      onChange={(e) =>
                        handleCurveChange(curve.id, "equation", e.target.value)
                      }
                    />
                    <input
                      type="color"
                      className="w-6 h-6 p-0 border-0 rounded cursor-pointer shrink-0 bg-transparent"
                      value={curve.color}
                      onChange={(e) =>
                        handleCurveChange(curve.id, "color", e.target.value)
                      }
                    />
                    <button
                      className="p-1.5 text-text-muted hover:text-danger rounded-md transition-colors"
                      onClick={() => handleRemoveCurve(curve.id)}
                      disabled={curveInputs.length <= 2}
                      title={t("revolution.curves.remove", "Remove")}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {curve.equation.trim() && (
                    <div className="pl-5 text-xs text-text-soft min-h-5 flex items-center overflow-x-auto hide-scrollbar">
                      {renderLatex(curve.equation)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Bounds Section */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-text uppercase tracking-wider flex items-center gap-2">
                <MoveHorizontal size={16} className="text-primary" />
                {t("revolution.bounds.title", "Bounds (x)")}
              </h2>
              <button
                className="btn btn-sm bg-bg border border-border hover:border-primary hover:text-primary text-xs gap-1"
                onClick={handleAutoDetect}
              >
                <Activity size={14} />
                {t("revolution.bounds.auto", "Auto")}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2 bg-bg border border-border rounded-md px-3 py-2 focus-within:border-primary">
                <span className="text-text-soft text-sm font-mono">min</span>
                <input
                  type="number"
                  className="flex-1 bg-transparent border-none outline-none text-sm w-full"
                  value={xMin}
                  onChange={(e) => setXMin(parseFloat(e.target.value) || 0)}
                  step="0.1"
                />
              </div>
              <span className="text-text-muted">to</span>
              <div className="flex-1 flex items-center gap-2 bg-bg border border-border rounded-md px-3 py-2 focus-within:border-primary">
                <span className="text-text-soft text-sm font-mono">max</span>
                <input
                  type="number"
                  className="flex-1 bg-transparent border-none outline-none text-sm w-full"
                  value={xMax}
                  onChange={(e) => setXMax(parseFloat(e.target.value) || 0)}
                  step="0.1"
                />
              </div>
            </div>
          </section>

          {/* Axis Section */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-bold text-text uppercase tracking-wider flex items-center gap-2">
              <MoveVertical size={16} className="text-primary" />
              {t("revolution.axis.title", "Axis of Revolution")}
            </h2>
            <div className="flex flex-col gap-3">
              <div className="flex bg-bg border border-border rounded-md p-1">
                <button
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    axis === "x"
                      ? "bg-primary text-white shadow-sm"
                      : "text-text-soft hover:text-text"
                  }`}
                  onClick={() => setAxis("x")}
                >
                  {t("revolution.axis.xAxis", "X-Axis (y=c)")}
                </button>
                <button
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    axis === "y"
                      ? "bg-primary text-white shadow-sm"
                      : "text-text-soft hover:text-text"
                  }`}
                  onClick={() => setAxis("y")}
                >
                  {t("revolution.axis.yAxis", "Y-Axis (x=c)")}
                </button>
              </div>
              <div className="flex items-center gap-3 bg-bg border border-border rounded-md px-3 py-2 focus-within:border-primary">
                <span className="text-text-soft text-sm font-mono font-bold">
                  {axis === "x" ? "y =" : "x ="}
                </span>
                <input
                  type="number"
                  className="flex-1 bg-transparent border-none outline-none text-sm w-full"
                  value={axisValue}
                  onChange={(e) =>
                    setAxisValue(parseFloat(e.target.value) || 0)
                  }
                  step="0.1"
                />
              </div>
            </div>
          </section>

          {/* Display Options */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-bold text-text uppercase tracking-wider flex items-center gap-2">
              <Palette size={16} className="text-primary" />
              {t("revolution.display.title", "Display Options")}
            </h2>
            <div className="card">
              <div className="card-body flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-soft">
                    {t("revolution.display.mode", "Mode")}
                  </span>
                  <div className="flex bg-bg-soft border border-border rounded-md p-0.5">
                    {(["solid", "wireframe", "transparent"] as const).map(
                      (mode) => (
                        <button
                          key={mode}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                            display.mode === mode
                              ? "bg-bg border border-border shadow-sm text-text"
                              : "text-text-muted hover:text-text border border-transparent"
                          }`}
                          onClick={() => setDisplay({ ...display, mode })}
                        >
                          {t(`revolution.display.modes.${mode}`, mode)}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                {display.mode === "transparent" && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-text-soft w-16">
                      {t("revolution.display.opacity", "Opacity")}
                    </span>
                    <input
                      type="range"
                      min="0.1"
                      max="0.9"
                      step="0.1"
                      value={display.opacity}
                      onChange={(e) =>
                        setDisplay({
                          ...display,
                          opacity: parseFloat(e.target.value),
                        })
                      }
                      className="flex-1"
                    />
                    <span className="text-xs text-text-muted w-8 text-right">
                      {display.opacity}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <span className="text-sm text-text-soft w-16">
                    {t("revolution.display.resolution", "Resolution")}
                  </span>
                  <input
                    type="range"
                    min="32"
                    max="256"
                    step="32"
                    value={display.resolution}
                    onChange={(e) =>
                      setDisplay({
                        ...display,
                        resolution: parseInt(e.target.value),
                      })
                    }
                    className="flex-1"
                  />
                  <span className="text-xs text-text-muted w-8 text-right">
                    {display.resolution}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={display.showAxes}
                      onChange={(e) =>
                        setDisplay({ ...display, showAxes: e.target.checked })
                      }
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-text-soft">
                      {t("revolution.display.showAxes", "Axes")}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={display.showGrid}
                      onChange={(e) =>
                        setDisplay({ ...display, showGrid: e.target.checked })
                      }
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-text-soft">
                      {t("revolution.display.showGrid", "Grid")}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={display.showCrossSection}
                      onChange={(e) =>
                        setDisplay({
                          ...display,
                          showCrossSection: e.target.checked,
                        })
                      }
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-text-soft">
                      {t(
                        "revolution.display.showCrossSection",
                        "Cross Section",
                      )}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={display.animate}
                      onChange={(e) => {
                        const animate = e.target.checked;
                        setDisplay({ ...display, animate });
                        if (animate && isGenerated && region) {
                          threeSceneRef.current?.startAnimation(2500);
                        } else {
                          threeSceneRef.current?.stopAnimation();
                        }
                      }}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-text-soft">
                      {t("revolution.display.animate", "Animate")}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* Presets */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-bold text-text uppercase tracking-wider flex items-center gap-2">
              <Lightbulb size={16} className="text-primary" />
              {t("revolution.presets.title", "Examples")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {presetExamples.map((preset, idx) => (
                <button
                  key={idx}
                  className="px-3 py-1.5 text-xs font-medium bg-bg border border-border rounded-full text-text-soft hover:text-primary hover:border-primary/50 transition-colors"
                  onClick={() => loadPreset(preset)}
                >
                  {t(preset.nameKey)}
                </button>
              ))}
            </div>
          </section>

          {/* Actions */}
          <div className="flex gap-3 mt-2 sticky bottom-0 bg-bg-soft pt-2 pb-4 z-10">
            <button
              className="btn btn-primary flex-1 py-3 text-base font-bold shadow-md hover:shadow-lg transition-all"
              onClick={handleGenerate}
            >
              <Play size={18} className="mr-2" />
              {t("revolution.actions.generate", "Generate")}
            </button>
            <button
              className="btn bg-bg border border-border hover:bg-bg-soft text-text px-4"
              onClick={handleReset}
              title={t("revolution.actions.reset", "Reset")}
            >
              <RotateCcw size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative bg-bg">
        {/* Error Banner */}
        {errorMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-danger/10 border border-danger/20 text-danger px-4 py-2.5 rounded-lg shadow-sm backdrop-blur-sm">
            <XCircle size={18} />
            <span className="text-sm font-medium">{errorMsg}</span>
            <button
              onClick={() => setErrorMsg("")}
              className="ml-2 p-1 hover:bg-danger/10 rounded-md"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* View Tabs */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-1 bg-bg-soft/80 backdrop-blur-md border border-border p-1 rounded-lg shadow-sm">
          <button
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeView === "3d"
                ? "bg-bg shadow-sm text-primary"
                : "text-text-soft hover:text-text"
            }`}
            onClick={() => setActiveView("3d")}
          >
            <Layers size={16} />
            {t("revolution.view.3d", "3D View")}
          </button>
          <button
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeView === "2d"
                ? "bg-bg shadow-sm text-primary"
                : "text-text-soft hover:text-text"
            }`}
            onClick={() => setActiveView("2d")}
          >
            <LayoutGrid size={16} />
            {t("revolution.view.2d", "2D Profile")}
          </button>
        </div>

        {/* Right Actions — shared for both views */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          {activeView === "3d" && (
            <button
              className="p-2 bg-bg-soft/80 backdrop-blur-md border border-border rounded-lg text-text-soft hover:text-text hover:bg-bg shadow-sm transition-colors"
              onClick={() => threeSceneRef.current?.resetCamera()}
              title={t("revolution.view.resetCam", "Reset Camera")}
            >
              <Eye size={18} />
            </button>
          )}
          {/* Export button available on both views */}
          <button
            className="p-2 bg-bg-soft/80 backdrop-blur-md border border-border rounded-lg text-text-soft hover:text-text hover:bg-bg shadow-sm transition-colors"
            onClick={handleExport}
            title={t("revolution.view.export", "Export Image")}
          >
            <Download size={18} />
          </button>
        </div>

        {/* Viewport — both views use the same card area */}
        <div
          className="flex-1 relative"
          style={{
            paddingBottom:
              isGenerated && result
                ? resultCollapsed
                  ? resultBarHeight
                  : undefined
                : undefined,
          }}
        >
          {/* Shared card container for both 2D and 3D */}
          <div
            className="absolute inset-0 p-4 pt-16"
            style={{
              paddingBottom:
                isGenerated && result
                  ? resultCollapsed
                    ? "60px"
                    : "0px"
                  : "16px",
            }}
          >
            <div className="w-full h-full rounded-xl overflow-hidden border border-border shadow-sm relative">
              {/* 3D View (inside the card) */}
              <div
                ref={threeContainerRef}
                className={`absolute inset-0 ${
                  activeView === "3d"
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
              />

              {/* 3D Placeholder */}
              {activeView === "3d" && !isGenerated && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted pointer-events-none bg-bg">
                  <Layers size={48} className="mb-4 opacity-20" />
                  <p className="text-lg font-medium">
                    {t(
                      "revolution.view.placeholder",
                      "Enter curves and click Generate",
                    )}
                  </p>
                </div>
              )}

              {/* Animation Indicator */}
              {activeView === "3d" && isGenerated && display.animate && (
                <div className="absolute top-3 left-3 flex items-center gap-2 px-3.5 py-1.5 bg-bg-soft/80 backdrop-blur-sm border border-border rounded-full text-xs text-text-soft z-10 shadow-sm">
                  <div className="spinner w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span>{t("revolution.display.animate", "Animating")}...</span>
                </div>
              )}

              {/* 2D View (inside the same card) */}
              <div
                className={`absolute inset-0 ${
                  activeView === "2d"
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
              >
                <Canvas2D
                  ref={canvas2DRef}
                  curves={parsedCurves as any}
                  region={region}
                  axis={axis}
                  axisValue={axisValue}
                  xMin={xMin}
                  xMax={xMax}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Result Panel — full width bottom card */}
        {isGenerated && result && (
          <div
            className={`absolute bottom-0 left-0 right-0 z-30 bg-bg/95 backdrop-blur-xl border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.1)] transition-all duration-300 ${
              resultCollapsed
                ? "translate-y-[calc(100%-44px)]"
                : "translate-y-0"
            }`}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-2.5 cursor-pointer border-b border-border/50"
              onClick={() => setResultCollapsed(!resultCollapsed)}
            >
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <TrendingUp size={16} />
                <span>
                  {t("revolution.result.title", "Calculation Result")}
                </span>
              </div>
              <button className="text-text-soft hover:text-text p-1">
                {resultCollapsed ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>
            </div>

            {/* Body */}
            <div
              className={`px-6 py-4 flex items-start gap-8 transition-all duration-300 overflow-x-auto hide-scrollbar ${
                resultCollapsed
                  ? "opacity-0 pointer-events-none max-h-0 py-0"
                  : "opacity-100 max-h-[300px]"
              }`}
            >
              {/* Volume */}
              <div className="flex flex-col gap-1 shrink-0">
                <span className="text-xs font-bold text-text-soft uppercase tracking-wider">
                  {t("revolution.result.volume", "Volume")}
                </span>
                <div
                  className="text-lg md:text-xl font-serif text-text overflow-x-auto hide-scrollbar"
                  dangerouslySetInnerHTML={{ __html: volumeHtml }}
                />
              </div>

              {/* Formula — click to copy, no separate button */}
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-text-soft uppercase tracking-wider">
                    {t("revolution.result.formula", "Integral Formula")}
                  </span>
                  {formulaCopied && (
                    <span className="flex items-center gap-1 text-xs text-success font-medium">
                      <Check size={12} />
                      {t("common.copied", "Copied!")}
                    </span>
                  )}
                </div>
                <div
                  className="bg-bg-soft border border-border rounded-lg p-3 overflow-x-auto hide-scrollbar cursor-pointer hover:border-primary/50 transition-colors group relative"
                  onClick={handleCopyFormula}
                  title={t(
                    "revolution.result.clickToCopy",
                    "Click to copy LaTeX",
                  )}
                >
                  <div dangerouslySetInnerHTML={{ __html: formulaHtml }} />
                  {/* Copy hint icon on hover */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-60 transition-opacity">
                    <Copy size={14} className="text-text-muted" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
