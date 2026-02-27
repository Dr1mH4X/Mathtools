import { parse, compile, evaluate } from "mathjs";
import type {
  CurveType,
  CurveDefinition,
  CompiledCurve,
  ProfilePoint,
} from "./types";
import { normalizeExpression } from "./latex";
import {
  INVERSE_Y_MIN,
  INVERSE_Y_MAX,
  INVERSE_SAMPLE_COUNT,
  SAMPLE_CURVE_Y_MIN,
  SAMPLE_CURVE_Y_MAX,
  VERTICAL_LINE_EXTENT,
  warnOnce,
} from "./curveDefaults";

// ===================================================================
// Curve Engine
//
// Handles all curve-level operations:
//   0. evalConst              — safely evaluate a constant expression string
//   1. parseEquation         — raw equation string → { type, expression }
//   2. isConstantExpression   — detect if expression has no free variable
//   3. compileCurve           — CurveDefinition → CompiledCurve (mathjs compiled)
//   4. evalCurve              — evaluate a compiled curve at a parameter value
//   5. createInverseFunction  — approximate inverse for x=g(y) curves
//   6. tryCreateInverseFunction — safe wrapper (no throw)
//   7. findIntersectionsXRange — scan+bisect to find intersection x-values
//   8. sampleCurve            — sample a curve for 2D canvas drawing
// ===================================================================

// ===== Constant expression evaluation =====

/**
 * Maximum allowed length for an expression passed to {@link evalConst}.
 *
 * Expressions longer than this are rejected before reaching `mathjs`
 * to prevent pathologically complex inputs from consuming excessive
 * CPU time.  200 characters is generous enough for any realistic
 * constant expression (e.g. `((sqrt(2))/(pi))`) while blocking
 * crafted mega-strings.
 */
const EVAL_CONST_MAX_LENGTH = 200;

/**
 * Whitelist pattern for characters allowed in a constant expression.
 *
 * Only digits, decimal points, arithmetic operators, parentheses,
 * whitespace, and ASCII letters (for names like `pi`, `sqrt`, `exp`)
 * are permitted.  Everything else — including semicolons, brackets,
 * quotes, and backslashes — is rejected before evaluation.
 */
const EVAL_CONST_ALLOWED = /^[0-9a-zA-Z+\-*/^()._ \t]+$/;

/**
 * Safely evaluate a constant expression string to a finite number.
 *
 * Handles plain numeric strings (`"0.5"`), normalised mathjs
 * expressions (`"((1)/(2))"`), and symbolic constants (`"pi"`,
 * `"sqrt(2)"`).
 *
 * **Security / performance guards** (addresses untrusted-input concerns):
 *
 * 1. **Length limit** — expressions longer than
 *    {@link EVAL_CONST_MAX_LENGTH} characters are rejected immediately.
 * 2. **Character whitelist** — only alphanumeric characters, basic
 *    arithmetic operators, parentheses, decimal points, and
 *    whitespace are allowed.  This blocks assignment (`=`), indexing
 *    (`[]`), string literals, semicolons, and other constructs that
 *    could trigger heavier mathjs code paths.
 * 3. **`parseFloat` fast-path** — trivial numeric strings never
 *    reach `evaluate()` at all.
 *
 * Returns `NaN` if the expression is invalid, too long, contains
 * disallowed characters, or does not evaluate to a finite number.
 */
export function evalConst(expr: string): number {
  // Fast path: plain number
  const simple = parseFloat(expr);
  if (
    isFinite(simple) &&
    /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(expr.trim())
  ) {
    return simple;
  }

  // Guard: reject overly long expressions
  if (expr.length > EVAL_CONST_MAX_LENGTH) {
    return NaN;
  }

  // Guard: only allow whitelisted characters
  if (!EVAL_CONST_ALLOWED.test(expr)) {
    return NaN;
  }

  try {
    const result = Number(evaluate(expr));
    return isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
}

// ===== Equation parsing =====

/**
 * Parse a raw equation string like "y = sqrt(x-1)" or "y = \sqrt{x-1}"
 * into a CurveType and the RHS expression (mathjs-compatible).
 */
export function parseEquation(
  raw: string,
): { type: CurveType; expression: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Normalize the whole string first to handle LaTeX in the LHS too
  const normalized = normalizeExpression(trimmed);

  // Match patterns: "y = ...", "x = ..."
  const yMatch = normalized.match(/^y\s*=\s*(.+)$/i);
  const xMatch = normalized.match(/^x\s*=\s*(.+)$/i);

  if (yMatch) {
    const expr = yMatch[1]!.trim();
    // Guard: reject empty or whitespace-only RHS (e.g. after stripping
    // stray backslashes the expression may become blank)
    if (!expr) return null;
    // Determine if it's a constant or a function of x
    if (isConstantExpression(expr, "x")) {
      return { type: "y_const", expression: expr };
    }
    return { type: "y_of_x", expression: expr };
  }

  if (xMatch) {
    const expr = xMatch[1]!.trim();
    if (!expr) return null;
    // Determine if it's a constant or a function of y
    if (isConstantExpression(expr, "y")) {
      return { type: "x_const", expression: expr };
    }
    return { type: "x_of_y", expression: expr };
  }

  return null;
}

// ===== Constant detection =====

/**
 * Check whether an expression is a constant (does not depend on the given variable).
 * Tries to evaluate the expression without providing the variable.
 */
export function isConstantExpression(expr: string, variable: string): boolean {
  // Quick check: if the expression contains the variable as a standalone token, it's not constant
  // Use word boundary to avoid false positives like 'x' in 'exp', 'max', 'hex'
  const varRegex = new RegExp(`(?<![a-zA-Z])${variable}(?![a-zA-Z])`, "g");
  if (varRegex.test(expr)) {
    return false;
  }
  // Try to evaluate as constant
  try {
    const result = evaluate(expr);
    return isFinite(Number(result));
  } catch {
    return false;
  }
}

// ===== Compilation & evaluation =====

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * Compile a CurveDefinition into a CompiledCurve that can be efficiently
 * evaluated at many parameter values.
 */
export function compileCurve(curve: CurveDefinition): CompiledCurve {
  if (curve.type === "x_const" || curve.type === "y_const") {
    const val = evalConst(curve.expression);
    if (isNaN(val)) {
      throw new ParseError(`Cannot parse constant: ${curve.expression}`);
    }
    return { def: curve, fn: null, constVal: val };
  }

  try {
    // Validate the expression parses correctly
    parse(curve.expression);
    const compiled = compile(curve.expression);
    return { def: curve, fn: compiled, constVal: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ParseError(
      `Cannot parse expression "${curve.expression}": ${msg}`,
    );
  }
}

/**
 * Safely evaluate a compiled curve at a given parameter value.
 * For y_of_x curves, the parameter is x.
 * For x_of_y curves, the parameter is y.
 */
export function evalCurve(cc: CompiledCurve, paramValue: number): number {
  if (cc.constVal !== null) {
    return cc.constVal;
  }
  if (!cc.fn) return NaN;
  try {
    const varName = cc.def.type === "x_of_y" ? "y" : "x";
    const result = cc.fn.evaluate({ [varName]: paramValue });
    const num = Number(result);
    if (!isFinite(num)) return NaN;
    return num;
  } catch {
    return NaN;
  }
}

// ===== Inverse function approximation =====

/**
 * Options for controlling the y-sampling window of `createInverseFunction`.
 *
 * All fields are optional.  When omitted the centralised defaults from
 * `curveDefaults.ts` are used:
 *
 * | field         | default constant         | value  |
 * |---------------|--------------------------|--------|
 * | `yMin`        | `INVERSE_Y_MIN`          | -50    |
 * | `yMax`        | `INVERSE_Y_MAX`          |  50    |
 * | `sampleCount` | `INVERSE_SAMPLE_COUNT`   | 1000   |
 */
export interface InverseFunctionOptions {
  /** Lower bound of the y-sampling window (default: {@link INVERSE_Y_MIN}). */
  yMin?: number;
  /** Upper bound of the y-sampling window (default: {@link INVERSE_Y_MAX}). */
  yMax?: number;
  /** Number of evenly-spaced samples within the window (default: {@link INVERSE_SAMPLE_COUNT}). */
  sampleCount?: number;
}

/**
 * Create an approximate inverse function for x = g(y).
 * Samples the curve densely over a y-range and returns a function
 * that maps target-x → approximate-y via binary search + interpolation.
 *
 * **Limitation:** the default y-sampling window is
 * [`INVERSE_Y_MIN`, `INVERSE_Y_MAX`] (see `curveDefaults.ts`).
 * Curves whose relevant y-range lies outside this window
 * (e.g. `x = e^y` for large x) will produce no usable samples.
 * Pass `options.yMin` / `options.yMax` to widen or shift the window
 * as needed.  If no finite samples are found in the window the
 * function **throws** instead of silently returning `NaN`.
 *
 * For call sites that prefer graceful degradation over a thrown error,
 * use {@link tryCreateInverseFunction} instead.
 */
export function createInverseFunction(
  cc: CompiledCurve,
  options?: InverseFunctionOptions,
): (x: number) => number {
  const sampleCount = options?.sampleCount ?? INVERSE_SAMPLE_COUNT;
  const yGuessMin = options?.yMin ?? INVERSE_Y_MIN;
  const yGuessMax = options?.yMax ?? INVERSE_Y_MAX;
  const dy = (yGuessMax - yGuessMin) / sampleCount;

  const samples: { x: number; y: number }[] = [];

  // Sample x = g(y) over the y-window, keeping only finite x-values.
  for (let i = 0; i <= sampleCount; i++) {
    const y = yGuessMin + i * dy;
    const x = evalCurve(cc, y);
    if (Number.isFinite(x)) {
      samples.push({ x, y });
    }
  }

  // If we collected no finite samples at all, fail clearly instead of
  // returning NaN from the inverse function.
  if (samples.length === 0) {
    throw new Error(
      `createInverseFunction: no finite samples found in y-range [${yGuessMin}, ${yGuessMax}]. ` +
        "The curve may lie outside this window; consider widening the sampling range via options.yMin / options.yMax.",
    );
  }

  // Sort samples by x so we can binary-search by target x.
  samples.sort((a, b) => a.x - b.x);

  const xs = samples.map((s) => s.x);
  const ys = samples.map((s) => s.y);

  return function inverse(targetX: number): number {
    let lo = 0;
    let hi = xs.length - 1;

    // Clamp outside sampled range to nearest endpoint.
    if (targetX <= xs[lo]!) return ys[lo]!;
    if (targetX >= xs[hi]!) return ys[hi]!;

    // Binary search for the bracketing indices [lo, hi].
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      const midX = xs[mid]!;

      if (midX === targetX) return ys[mid]!;
      if (midX < targetX) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    const x0 = xs[lo]!;
    const x1 = xs[hi]!;
    const y0 = ys[lo]!;
    const y1 = ys[hi]!;

    // Guard against degenerate interval; fall back to y0 in that case.
    if (x1 === x0) return y0;

    const t = (targetX - x0) / (x1 - x0);
    return y0 + t * (y1 - y0);
  };
}

/**
 * Safe wrapper around {@link createInverseFunction}.
 *
 * If the inverse cannot be constructed (e.g. the curve's relevant y-domain
 * lies entirely outside the sampling window), this function returns a
 * fallback that always yields `NaN` instead of throwing.  An optional
 * `onError` callback is invoked with the caught error so callers can log
 * or surface the issue without aborting higher-level computations.
 *
 * When no `onError` is supplied the failure is reported via the
 * debug-gated {@link warnOnce} utility from `curveDefaults.ts`, which
 * deduplicates repeated messages and is silent when
 * `CURVE_ENGINE_DEBUG` is `false`.
 *
 * This is the recommended entry point for best-effort helpers such as
 * `computeRegion` and `autoDetectBounds`, where a single problematic
 * curve should not crash the entire operation.
 */
export function tryCreateInverseFunction(
  cc: CompiledCurve,
  options?: InverseFunctionOptions,
  onError?: (err: unknown) => void,
): (x: number) => number {
  try {
    return createInverseFunction(cc, options);
  } catch (err: unknown) {
    if (onError) {
      onError(err);
    } else {
      // Fall back to the debug-gated, deduplicated warning so callers
      // that don't supply a callback still get diagnostics without
      // flooding the console on every re-evaluation.
      warnOnce(
        "tryCreateInverseFunction",
        cc.def.expression,
        `Could not build inverse for "${cc.def.expression}": ${err instanceof Error ? err.message : err}`,
      );
    }
    // Return a fallback inverse that signals "no data" for every input.
    return (_x: number) => NaN;
  }
}

// ===== Intersection finding =====

/**
 * Find approximate intersection x-values of two y=f(x) style functions
 * within [a, b] by scanning and bisection.
 */
export function findIntersectionsXRange(
  f1: (x: number) => number,
  f2: (x: number) => number,
  a: number,
  b: number,
  scanSteps: number = 500,
): number[] {
  const intersections: number[] = [];
  const dx = (b - a) / scanSteps;

  let prevDiff = f1(a) - f2(a);

  for (let i = 1; i <= scanSteps; i++) {
    const x = a + i * dx;
    const diff = f1(x) - f2(x);

    if (prevDiff * diff < 0) {
      // Sign change detected — bisect
      let lo = x - dx;
      let hi = x;
      for (let j = 0; j < 50; j++) {
        const mid = (lo + hi) / 2;
        const midDiff = f1(mid) - f2(mid);
        if (Math.abs(midDiff) < 1e-12) {
          lo = mid;
          break;
        }
        if (midDiff * (f1(lo) - f2(lo)) < 0) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      intersections.push((lo + hi) / 2);
    } else if (Math.abs(diff) < 1e-10) {
      intersections.push(x);
    }

    prevDiff = diff;
  }

  return intersections;
}

// ===== Curve sampling (for 2D canvas drawing) =====

/**
 * Evaluate a single curve expression over the given x range.
 * Returns an array of { x, y } points (NaN values are filtered out).
 * Handles domain-boundary detection via bisection so curves like
 * y = sqrt(x-1) start precisely at (1, 0).
 *
 * For `x_of_y` curves the y-range defaults to
 * [`SAMPLE_CURVE_Y_MIN`, `SAMPLE_CURVE_Y_MAX`] from `curveDefaults.ts`.
 * For `x_const` vertical lines the visual extent is
 * ±`VERTICAL_LINE_EXTENT`.
 */
export function sampleCurve(
  curve: CurveDefinition,
  xMin: number,
  xMax: number,
  steps: number = 300,
): ProfilePoint[] {
  // If type is not set but equation is, try to parse it
  let effectiveCurve = curve;
  if ((!curve.type || !curve.expression) && curve.equation) {
    const parsed = parseEquation(curve.equation);
    if (parsed) {
      effectiveCurve = {
        ...curve,
        type: parsed.type,
        expression: parsed.expression,
      };
    }
  }

  let cc: CompiledCurve;
  try {
    cc = compileCurve(effectiveCurve);
  } catch (err: unknown) {
    // compileCurve throws ParseError for user-input validation failures.
    // For those we silently return an empty sample set so the canvas
    // draws nothing for this curve instead of crashing React mid-render.
    if (err instanceof ParseError) {
      return [];
    }
    // Unexpected / programming error — log so it doesn't go unnoticed.
    console.error(
      "[curveEngine] sampleCurve: unexpected error from compileCurve",
      err,
    );
    // In development, rethrow to avoid swallowing real bugs.
    if (import.meta.env.DEV) {
      throw err;
    }
    // In production, return [] to keep the UI from white-screening.
    return [];
  }
  const dx = (xMax - xMin) / steps;
  const pts: ProfilePoint[] = [];

  if (effectiveCurve.type === "x_const") {
    const xVal = cc.constVal ?? 0;
    pts.push({ x: xVal, y: -VERTICAL_LINE_EXTENT });
    pts.push({ x: xVal, y: VERTICAL_LINE_EXTENT });
    return pts;
  }

  if (effectiveCurve.type === "y_const") {
    const yVal = cc.constVal ?? 0;
    pts.push({ x: xMin, y: yVal });
    pts.push({ x: xMax, y: yVal });
    return pts;
  }

  if (effectiveCurve.type === "x_of_y") {
    const yMin = SAMPLE_CURVE_Y_MIN;
    const yMax = SAMPLE_CURVE_Y_MAX;
    const dyStep = (yMax - yMin) / steps;
    for (let i = 0; i <= steps; i++) {
      const y = yMin + i * dyStep;
      const x = evalCurve(cc, y);
      if (isFinite(x)) {
        pts.push({ x, y });
      }
    }
    return pts;
  }

  // y_of_x — with domain-boundary detection.
  // When fn transitions NaN→finite, bisect to find the exact domain edge
  // so curves like y=sqrt(x-1) start precisely at (1, 0).
  const bisectDomainEdge = (
    xNaN: number,
    xFin: number,
  ): { x: number; y: number } | null => {
    let nanSide = xNaN;
    let finSide = xFin;
    let bestX = xFin;
    let bestY = evalCurve(cc, xFin);
    if (!isFinite(bestY)) return null;
    for (let iter = 0; iter < 60; iter++) {
      const mid = (nanSide + finSide) / 2;
      const yMid = evalCurve(cc, mid);
      if (isFinite(yMid)) {
        finSide = mid;
        bestX = mid;
        bestY = yMid;
      } else nanSide = mid;
      if (Math.abs(finSide - nanSide) < 1e-12) break;
    }
    return { x: bestX, y: bestY };
  };

  const rawYs: (number | null)[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + i * dx;
    const y = evalCurve(cc, x);
    rawYs.push(isFinite(y) ? y : null);
  }

  let prevNull = rawYs[0] === null;
  for (let i = 0; i <= steps; i++) {
    const x = xMin + i * dx;
    const yRaw = rawYs[i];
    const currNull = yRaw === null;

    if (!currNull && prevNull && i > 0) {
      const edge = bisectDomainEdge(xMin + (i - 1) * dx, x);
      if (edge) pts.push(edge);
    } else if (currNull && !prevNull && i > 0) {
      const edge = bisectDomainEdge(x, xMin + (i - 1) * dx);
      if (edge) pts.push(edge);
    }
    if (!currNull) pts.push({ x, y: yRaw! });
    prevNull = currNull;
  }

  return pts;
}
