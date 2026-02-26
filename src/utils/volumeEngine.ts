import type {
  CurveDefinition,
  ComputedRegion,
  RotationAxis,
  RevolutionResult,
  ProfilePoint,
} from "./types";
import type { InverseFunctionOptions } from "./curveEngine";
import {
  compileCurve,
  evalCurve,
  tryCreateInverseFunction,
  findIntersectionsXRange,
} from "./curveEngine";
import {
  AUTO_DETECT_SEARCH_MIN,
  AUTO_DETECT_SEARCH_MAX,
} from "./curveDefaults";
import { buildDiskFormulaLatex, buildShellFormulaLatex } from "./latex";

// ===================================================================
// Volume Engine
//
// Handles volume-of-revolution computation and supporting numerics:
//   1. computeVolume          — dispatcher (x-axis vs y-axis)
//   2. computeVolumeAroundX   — disk/washer method
//   3. computeVolumeAroundY   — shell method
//   4. simpsonsRule            — Simpson's 1/3 numerical integration
//   5. createInterpolator      — linear interpolation from profile points
//   6. autoDetectBounds        — automatic x-range estimation from intersections
// ===================================================================

// ===== Volume computation =====

/**
 * Compute volume of revolution using numerical integration (Simpson's rule).
 */
export function computeVolume(
  region: ComputedRegion,
  axis: RotationAxis,
  axisValue: number = 0,
): RevolutionResult {
  if (axis === "x") {
    return computeVolumeAroundX(region, axisValue);
  } else {
    return computeVolumeAroundY(region, axisValue);
  }
}

/**
 * Volume by revolving around a horizontal line y = axisValue (disk/washer method).
 * V = π ∫[a,b] (R(x)² - r(x)²) dx
 */
function computeVolumeAroundX(
  region: ComputedRegion,
  axisValue: number,
): RevolutionResult {
  const { upperProfile, lowerProfile, xMin, xMax } = region;
  const n = upperProfile.length;

  if (n < 2) {
    return {
      volume: 0,
      formulaLatex: "V = 0",
      region,
      methodKey: "revolution.result.diskMethod",
    };
  }

  const upperFn = createInterpolator(upperProfile);
  const lowerFn = createInterpolator(lowerProfile);

  const steps = Math.max(n * 2, 500);
  const volume = simpsonsRule(
    (x: number) => {
      const yUp = upperFn(x);
      const yLo = lowerFn(x);

      const d1 = Math.abs(yUp - axisValue);
      const d2 = Math.abs(yLo - axisValue);
      const R = Math.max(d1, d2);
      const r = Math.min(d1, d2);

      // If the axis is between the curves, the inner radius is 0
      if (
        (axisValue >= yLo && axisValue <= yUp) ||
        (axisValue >= yUp && axisValue <= yLo)
      ) {
        return R * R;
      }

      return R * R - r * r;
    },
    xMin,
    xMax,
    steps,
  );

  const vol = Math.PI * volume;

  const formulaLatex = buildDiskFormulaLatex(axisValue, xMin, xMax);

  return {
    volume: Math.abs(vol),
    formulaLatex,
    region,
    methodKey: "revolution.result.diskMethod",
  };
}

/**
 * Volume by revolving around a vertical line x = axisValue (shell method).
 * V = 2π ∫[a,b] |x - axisValue| · |upper(x) - lower(x)| dx
 */
function computeVolumeAroundY(
  region: ComputedRegion,
  axisValue: number,
): RevolutionResult {
  const { upperProfile, lowerProfile, xMin, xMax } = region;
  const n = upperProfile.length;

  if (n < 2) {
    return {
      volume: 0,
      formulaLatex: "V = 0",
      region,
      methodKey: "revolution.result.shellMethod",
    };
  }

  const upperFn = createInterpolator(upperProfile);
  const lowerFn = createInterpolator(lowerProfile);

  const steps = Math.max(n * 2, 500);
  const volume = simpsonsRule(
    (x: number) => {
      const yUp = upperFn(x);
      const yLo = lowerFn(x);
      const height = Math.abs(yUp - yLo);
      const radius = Math.abs(x - axisValue);
      return radius * height;
    },
    xMin,
    xMax,
    steps,
  );

  const vol = 2 * Math.PI * volume;

  const formulaLatex = buildShellFormulaLatex(axisValue, xMin, xMax);

  return {
    volume: Math.abs(vol),
    formulaLatex,
    region,
    methodKey: "revolution.result.shellMethod",
  };
}

// ===== Numerical utilities =====

/**
 * Simpson's 1/3 rule for numerical integration.
 */
export function simpsonsRule(
  f: (x: number) => number,
  a: number,
  b: number,
  n: number,
): number {
  // Ensure n is even
  if (n % 2 !== 0) n++;
  const h = (b - a) / n;
  let sum = f(a) + f(b);

  for (let i = 1; i < n; i++) {
    const x = a + i * h;
    const val = f(x);
    if (!isFinite(val)) continue;
    sum += (i % 2 === 0 ? 2 : 4) * val;
  }

  return (h / 3) * sum;
}

/**
 * Create a linear interpolation function from sorted profile points.
 */
export function createInterpolator(
  points: ProfilePoint[],
): (x: number) => number {
  return (x: number): number => {
    if (points.length === 0) return 0;

    const first = points[0]!;
    if (points.length === 1) return first.y;

    const last = points[points.length - 1]!;

    // Clamp to range
    if (x <= first.x) return first.y;
    if (x >= last.x) return last.y;

    // Binary search for interval
    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const midPt = points[mid]!;
      if (midPt.x <= x) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    const loPt = points[lo]!;
    const hiPt = points[hi]!;
    const t = (x - loPt.x) / (hiPt.x - loPt.x || 1);
    return loPt.y + t * (hiPt.y - loPt.y);
  };
}

// ===== Auto bound detection =====

/**
 * Try to automatically detect reasonable x-bounds for the given curves.
 * Looks for intersection points and extends slightly beyond.
 */
export function autoDetectBounds(
  curves: CurveDefinition[],
  searchRange: [number, number] = [
    AUTO_DETECT_SEARCH_MIN,
    AUTO_DETECT_SEARCH_MAX,
  ],
  inverseOptions?: InverseFunctionOptions,
): { xMin: number; xMax: number } {
  const compiled = curves.map(compileCurve);

  // Get x_const values
  const xConsts = compiled
    .filter((c) => c.def.type === "x_const")
    .map((c) => c.constVal!)
    .filter(isFinite);

  // Get y(x) functions for non-const curves (including x_of_y via inverse)
  const funcCurves = compiled.filter(
    (c) =>
      c.def.type === "y_of_x" ||
      c.def.type === "y_const" ||
      c.def.type === "x_of_y",
  );

  // Build y(x) evaluation functions.
  // For x_of_y curves we use the safe wrapper so that a single curve whose
  // y-domain lies outside the sampling window doesn't abort the entire
  // auto-detection — it will simply be skipped (treated as NaN).
  // Diagnostics are handled by the debug-gated `warnOnce` inside
  // `tryCreateInverseFunction` (no onError callback needed).
  const yFunctions: ((x: number) => number)[] = funcCurves.map((cc) => {
    if (cc.def.type === "y_of_x" || cc.def.type === "y_const") {
      return (x: number) => evalCurve(cc, x);
    } else if (cc.def.type === "x_of_y") {
      return tryCreateInverseFunction(cc, inverseOptions);
    }
    return (_x: number) => NaN;
  });

  const allXValues: number[] = [...xConsts];

  // Find pairwise intersections
  for (let i = 0; i < yFunctions.length; i++) {
    for (let j = i + 1; j < yFunctions.length; j++) {
      const f1 = yFunctions[i]!;
      const f2 = yFunctions[j]!;
      const ints = findIntersectionsXRange(
        f1,
        f2,
        searchRange[0],
        searchRange[1],
        2000,
      );
      allXValues.push(...ints);
    }
  }

  if (allXValues.length < 2) {
    // Fallback: use a reasonable default
    return { xMin: -5, xMax: 5 };
  }

  allXValues.sort((a, b) => a - b);
  const firstVal = allXValues[0]!;
  const lastVal = allXValues[allXValues.length - 1]!;

  // Use exact bounds (no margin) so the region computation can properly
  // determine the closed area bounded by intersections
  return {
    xMin: parseFloat(firstVal.toFixed(4)),
    xMax: parseFloat(lastVal.toFixed(4)),
  };
}
