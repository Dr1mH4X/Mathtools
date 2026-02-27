import { create } from "zustand";
import type { DisplayOptions } from "@/composables/useThreeScene";
import { defaultDisplayOptions } from "@/composables/useThreeScene";
import type {
  ComputedRegion,
  RevolutionResult,
  RotationAxis,
} from "@/utils/mathEngine";

// ===================================================================
// Revolution Page State — Zustand Store
//
// Replaces the 15+ useState calls that were previously scattered
// across RevolutionVolume.tsx.  All revolution-specific state now
// lives in a single, testable store that any child component can
// subscribe to without prop-drilling.
// ===================================================================

let nextCurveId = 1;
export function makeId(): string {
  return String(nextCurveId++);
}

export const defaultCurveColors = [
  "#4f6ef7",
  "#e74c8b",
  "#2ecc71",
  "#f0a500",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#3498db",
];

export interface CurveInput {
  id: string;
  equation: string;
  color: string;
}

interface RevolutionState {
  // --- Curve Inputs ---
  curveInputs: CurveInput[];
  setCurveInputs: (inputs: CurveInput[]) => void;
  addCurve: () => void;
  removeCurve: (id: string) => void;
  updateCurve: (id: string, field: keyof CurveInput, value: string) => void;

  // --- Bounds ---
  xMin: number;
  xMax: number;
  setXMin: (v: number) => void;
  setXMax: (v: number) => void;

  // --- Axis ---
  axis: RotationAxis;
  axisValue: number;
  setAxis: (a: RotationAxis) => void;
  setAxisValue: (v: number) => void;

  // --- Display ---
  display: DisplayOptions;
  setDisplay: (d: DisplayOptions | Partial<DisplayOptions>) => void;

  // --- Computed Results ---
  region: ComputedRegion | null;
  result: RevolutionResult | null;
  setRegion: (r: ComputedRegion | null) => void;
  setResult: (r: RevolutionResult | null) => void;

  // --- UI State ---
  errorMsg: string;
  setErrorMsg: (msg: string) => void;
  activeView: "2d" | "3d";
  setActiveView: (v: "2d" | "3d") => void;
  showHelp: boolean;
  setShowHelp: (v: boolean) => void;
  toggleHelp: () => void;
  formulaCopied: boolean;
  setFormulaCopied: (v: boolean) => void;
  isGenerated: boolean;
  setIsGenerated: (v: boolean) => void;
  resultCollapsed: boolean;
  setResultCollapsed: (v: boolean) => void;
  toggleResultCollapsed: () => void;
  shouldGenerate: boolean;
  setShouldGenerate: (v: boolean) => void;

  // --- Reset ---
  reset: () => void;
}

function createDefaultCurves(): CurveInput[] {
  return [
    { id: makeId(), equation: "y = x^2", color: defaultCurveColors[0] },
    { id: makeId(), equation: "y = x", color: defaultCurveColors[1] },
  ];
}

export const useRevolutionStore = create<RevolutionState>()((set, get) => ({
  // --- Curve Inputs ---
  curveInputs: createDefaultCurves(),
  setCurveInputs: (inputs) => set({ curveInputs: inputs }),
  addCurve: () => {
    const { curveInputs } = get();
    if (curveInputs.length >= 8) return;
    set({
      curveInputs: [
        ...curveInputs,
        {
          id: makeId(),
          equation: "",
          color:
            defaultCurveColors[curveInputs.length % defaultCurveColors.length],
        },
      ],
    });
  },
  removeCurve: (id) =>
    set((state) => ({
      curveInputs: state.curveInputs.filter((c) => c.id !== id),
    })),
  updateCurve: (id, field, value) =>
    set((state) => ({
      curveInputs: state.curveInputs.map((c) =>
        c.id === id ? { ...c, [field]: value } : c,
      ),
    })),

  // --- Bounds ---
  xMin: 0,
  xMax: 1,
  setXMin: (v) => set({ xMin: v }),
  setXMax: (v) => set({ xMax: v }),

  // --- Axis ---
  axis: "x",
  axisValue: 0,
  setAxis: (a) => set({ axis: a }),
  setAxisValue: (v) => set({ axisValue: v }),

  // --- Display ---
  display: defaultDisplayOptions,
  setDisplay: (d) =>
    set((state) => ({
      display: { ...state.display, ...d },
    })),

  // --- Computed Results ---
  region: null,
  result: null,
  setRegion: (r) => set({ region: r }),
  setResult: (r) => set({ result: r }),

  // --- UI State ---
  errorMsg: "",
  setErrorMsg: (msg) => set({ errorMsg: msg }),
  activeView: "2d",
  setActiveView: (v) => set({ activeView: v }),
  showHelp: false,
  setShowHelp: (v) => set({ showHelp: v }),
  toggleHelp: () => set((state) => ({ showHelp: !state.showHelp })),
  formulaCopied: false,
  setFormulaCopied: (v) => set({ formulaCopied: v }),
  isGenerated: false,
  setIsGenerated: (v) => set({ isGenerated: v }),
  resultCollapsed: false,
  setResultCollapsed: (v) => set({ resultCollapsed: v }),
  toggleResultCollapsed: () =>
    set((state) => ({ resultCollapsed: !state.resultCollapsed })),
  shouldGenerate: false,
  setShouldGenerate: (v) => set({ shouldGenerate: v }),

  // --- Reset ---
  reset: () =>
    set({
      curveInputs: createDefaultCurves(),
      xMin: 0,
      xMax: 1,
      axis: "x",
      axisValue: 0,
      region: null,
      result: null,
      isGenerated: false,
      errorMsg: "",
      activeView: "2d",
      shouldGenerate: false,
      resultCollapsed: false,
      formulaCopied: false,
    }),
}));
