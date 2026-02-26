// ===================================================================
// Curve Defaults — centralised numeric constants & diagnostics
//
// Every magic number that controls y-sampling windows, sample counts,
// search ranges, or visual extents for curves lives here.  Changing a
// value in this file propagates to every consumer automatically.
//
// Modules that use these constants:
//   curveEngine.ts   — createInverseFunction, sampleCurve
//   volumeEngine.ts  — autoDetectBounds
//   regionEngine.ts  — computeRegion (via InverseFunctionOptions)
// ===================================================================

// ————— Inverse-function sampling (createInverseFunction) —————

/** Default lower bound of the y-sampling window for inverse functions. */
export const INVERSE_Y_MIN = -50;

/** Default upper bound of the y-sampling window for inverse functions. */
export const INVERSE_Y_MAX = 50;

/** Default number of evenly-spaced samples within the inverse y-window. */
export const INVERSE_SAMPLE_COUNT = 1000;

// ————— Direct x_of_y sampling (sampleCurve) —————

/** Default lower bound of the y-range when sampling an x=g(y) curve for drawing. */
export const SAMPLE_CURVE_Y_MIN = -10;

/** Default upper bound of the y-range when sampling an x=g(y) curve for drawing. */
export const SAMPLE_CURVE_Y_MAX = 10;

// ————— Vertical-line visual extent (sampleCurve, x_const) —————

/**
 * When drawing a vertical line (x = const), we emit two sentinel points at
 * ±VERTICAL_LINE_EXTENT so the line spans the visible canvas.
 */
export const VERTICAL_LINE_EXTENT = 1000;

// ————— Auto-detect bounds (autoDetectBounds) —————

/** Default x-search range used by `autoDetectBounds` when scanning for intersections. */
export const AUTO_DETECT_SEARCH_MIN = -20;

/** Default x-search range used by `autoDetectBounds` when scanning for intersections. */
export const AUTO_DETECT_SEARCH_MAX = 20;

// ===================================================================
// Debug-gated, deduplicated warning utility
//
// `computeRegion` and `autoDetectBounds` may be called on every
// keystroke / slider drag.  Without deduplication the console fills
// with identical warnings for the same failing curve.
//
// Usage:
//   import { warnOnce } from "./curveDefaults";
//   warnOnce("computeRegion", expr, "could not build inverse …");
//
// Set `CURVE_ENGINE_DEBUG = true` to see warnings; when false all
// diagnostic output is suppressed.
// ===================================================================

/**
 * Master switch for curve-engine diagnostic warnings.
 *
 * Automatically `true` during development (`vite dev`) and `false` in
 * production builds, driven by Vite's built-in `import.meta.env.DEV`.
 *
 * Override at runtime for debugging:
 *   `(window as any).__CURVE_ENGINE_DEBUG = true;`
 * or at build time via Vite `define` config.
 */
export const CURVE_ENGINE_DEBUG: boolean = import.meta.env.DEV;

/** Set of `"tag|key"` strings we have already warned about. */
const _warnedKeys = new Set<string>();

/**
 * Emit a `console.warn` at most once per unique `(tag, key)` pair,
 * and only when {@link CURVE_ENGINE_DEBUG} is `true`.
 *
 * @param tag   Short label for the call site, e.g. `"computeRegion"`.
 * @param key   A value that identifies the specific warning instance,
 *              typically the curve expression string.
 * @param message  Human-readable description of the issue.
 */
export function warnOnce(tag: string, key: string, message: string): void {
  if (!CURVE_ENGINE_DEBUG) return;

  const dedup = `${tag}|${key}`;
  if (_warnedKeys.has(dedup)) return;
  _warnedKeys.add(dedup);

  console.warn(`[${tag}] ${message}`);
}

/**
 * Reset the dedup set.  Useful in tests or when the set of curves
 * changes substantially (e.g. user loads a new preset).
 */
export function resetWarnings(): void {
  _warnedKeys.clear();
}
