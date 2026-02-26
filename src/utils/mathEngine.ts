// ===================================================================
// mathEngine.ts — Barrel re-export
//
// This file used to be a monolithic 1400+ line module.  It has been
// refactored into focused sub-modules that each follow the Single
// Responsibility Principle while preserving every public export so
// that **no existing import path needs to change**.
//
// Sub-modules:
//   types.ts         — shared type / interface definitions
//   curveDefaults.ts — centralised numeric constants & diagnostics
//   latex.ts         — LaTeX normalisation, equation→LaTeX, volume formatting
//   curveEngine.ts   — curve parsing, compilation, evaluation, sampling
//   regionEngine.ts  — 2D bounded-region computation
//   volumeEngine.ts  — numerical integration & volume computation
//   meshEngine.ts    — 3D revolution mesh generation
//   presets.ts       — preset example data
// ===================================================================

// ————— Types —————
export type { CurveType } from "./types";
export type { CurveDefinition } from "./types";
export type { RotationAxis } from "./types";
export type { RevolutionConfig } from "./types";
export type { ProfilePoint } from "./types";
export type { ComputedRegion } from "./types";
export type { RevolutionResult } from "./types";
export type { MeshProfilePoint } from "./types";
export type { PresetExample } from "./types";
export type { CompiledCurve } from "./types";
export type { InverseFunctionOptions } from "./curveEngine";

// ————— Curve defaults (centralised constants & diagnostics) —————
export {
  INVERSE_Y_MIN,
  INVERSE_Y_MAX,
  INVERSE_SAMPLE_COUNT,
  SAMPLE_CURVE_Y_MIN,
  SAMPLE_CURVE_Y_MAX,
  VERTICAL_LINE_EXTENT,
  AUTO_DETECT_SEARCH_MIN,
  AUTO_DETECT_SEARCH_MAX,
  CURVE_ENGINE_DEBUG,
  warnOnce,
  resetWarnings,
} from "./curveDefaults";

// ————— LaTeX module —————
export {
  normalizeExpression,
  equationToLatex,
  formatNum,
  formatVolume,
  buildDiskFormulaLatex,
  buildShellFormulaLatex,
} from "./latex";

// ————— Curve engine —————
export {
  evalConst,
  parseEquation,
  isConstantExpression,
  compileCurve,
  evalCurve,
  createInverseFunction,
  tryCreateInverseFunction,
  findIntersectionsXRange,
  sampleCurve,
} from "./curveEngine";

// ————— Region engine —————
export {
  computeRegion,
  computeRegionTwoCurves,
  computeRegionMultiCurves,
} from "./regionEngine";

// ————— Volume engine —————
export {
  computeVolume,
  simpsonsRule,
  createInterpolator,
  autoDetectBounds,
} from "./volumeEngine";

// ————— Mesh engine —————
export { generateMeshProfiles, generateRevolutionGeometry } from "./meshEngine";

// ————— Presets —————
export { presetExamples } from "./presets";
