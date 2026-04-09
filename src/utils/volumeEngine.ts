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

      let R: number;
      let r: number;

      // FIXED: Correctly determine inner and outer radii
      // The axis can be: below both curves, above both curves, or between them
      if (
        (axisValue >= yLo && axisValue <= yUp) ||
        (axisValue >= yUp && axisValue <= yLo)
      ) {
        // Axis is between the curves - solid disk (no hole)
        R = Math.max(d1, d2);
        r = 0;
      } else {
        // Axis is outside - washer with hole
        // Outer radius: distance to the curve FARTHER from axis
        // Inner radius: distance to the curve CLOSER to axis
        R = Math.max(d1, d2);
        r = Math.min(d1, d2);
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
 *
 * Algorithm:
 * 1. Find all intersection points between curves
 * 2. If there are multiple intersections, use the full span (min to max)
 *    as the default bounds - this captures the entire enclosed region
 * 3. Only use the "best interval" scoring when there's a single interval
 *    or when the full span doesn't make sense
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

  const xConsts = compiled
    .filter((c) => c.def.type === "x_const")
    .map((c) => c.constVal!)
    .filter(isFinite);

  const funcCurves = compiled.filter(
    (c) =>
      c.def.type === "y_of_x" ||
      c.def.type === "y_const" ||
      c.def.type === "x_of_y",
  );

  const yFunctions: ((x: number) => number)[] = funcCurves.map((cc) => {
    if (cc.def.type === "y_of_x" || cc.def.type === "y_const") {
      return (x: number) => evalCurve(cc, x);
    } else if (cc.def.type === "x_of_y") {
      return tryCreateInverseFunction(cc, inverseOptions);
    }
    return (_x: number) => NaN;
  });

  const allXValues: number[] = [...xConsts];

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
    return { xMin: -5, xMax: 5 };
  }

  // Deduplicate and sort candidate x-values
  const dedupedXValues = allXValues
    .map((v) => parseFloat(v.toFixed(6)))
    .filter((v, i, arr) => i === 0 || Math.abs(v - arr[i - 1]!) > 1e-4)
    .sort((a, b) => a - b);

  if (dedupedXValues.length < 2) {
    return { xMin: -5, xMax: 5 };
  }

  // NEW APPROACH: Use the full span of intersection points as the default
  // This captures the entire enclosed region formed by all curves
  // The full span is the region from the leftmost to the rightmost intersection
  const fullSpanMin = dedupedXValues[0]!;
  const fullSpanMax = dedupedXValues[dedupedXValues.length - 1]!;
  const fullSpanWidth = fullSpanMax - fullSpanMin;

  // Check if the full span has meaningful area (curves that enclose a region)
  // Sample across the full span to check if there's actual enclosed area
  const sampleCount = 20;
  let fullSpanValidSamples = 0;
  let fullSpanTotalGap = 0;

  for (let s = 0; s <= sampleCount; s++) {
    const x = fullSpanMin + (s / sampleCount) * fullSpanWidth;
    const ys = yFunctions.map((f) => f(x)).filter((v) => isFinite(v));
    if (ys.length >= 2) {
      ys.sort((a, b) => a - b);
      // Find the minimum adjacent gap
      let minGap = Infinity;
      for (let m = 0; m < ys.length - 1; m++) {
        const gap = ys[m + 1]! - ys[m]!;
        if (gap < minGap) minGap = gap;
      }
      if (minGap < Infinity) {
        fullSpanTotalGap += minGap;
        fullSpanValidSamples++;
      }
    }
  }

  // If the full span has valid samples with reasonable gaps, use it
  // This is the primary case for enclosed regions
  if (fullSpanValidSamples > sampleCount * 0.3 && fullSpanWidth > 1e-6) {
    const avgGap = fullSpanTotalGap / fullSpanValidSamples;
    // If there's meaningful enclosed area across the full span, use it
    if (avgGap > 1e-6) {
      return {
        xMin: parseFloat(fullSpanMin.toFixed(4)),
        xMax: parseFloat(fullSpanMax.toFixed(4)),
      };
    }
  }

  // FALLBACK: Among all adjacent sub-intervals [xValues[k], xValues[k+1]],
  // find the one with the largest enclosed area (max average gap between curves).
  // This is used when the full span doesn't have meaningful enclosed area.
  let bestXMin = dedupedXValues[0]!;
  let bestXMax = dedupedXValues[1]!;
  let bestScore = -Infinity;

  for (let k = 0; k < dedupedXValues.length - 1; k++) {
    const xa = dedupedXValues[k]!;
    const xb = dedupedXValues[k + 1]!;
    const width = xb - xa;
    if (width < 1e-6) continue;

    // Sample the minimum gap between any two curves in this interval
    // to check if this interval is actually "enclosed"
    const intervalSampleCount = 10;
    let totalMinGap = 0;
    let validSamples = 0;

    for (let s = 0; s <= intervalSampleCount; s++) {
      const x = xa + (s / intervalSampleCount) * width;
      const ys = yFunctions.map((f) => f(x)).filter((v) => isFinite(v));
      if (ys.length < 2) continue;
      ys.sort((a, b) => a - b);
      // Find the minimum adjacent gap — this is the "tightest" pair
      let minGap = Infinity;
      for (let m = 0; m < ys.length - 1; m++) {
        const gap = ys[m + 1]! - ys[m]!;
        if (gap < minGap) minGap = gap;
      }
      totalMinGap += minGap;
      validSamples++;
    }

    if (validSamples === 0) continue;

    // Score = area proxy: width × average min-gap
    // This prefers intervals where curves form a tight, well-defined enclosure
    const avgMinGap = totalMinGap / validSamples;
    const score = width * avgMinGap;

    if (score > bestScore) {
      bestScore = score;
      bestXMin = xa;
      bestXMax = xb;
    }
  }

  return {
    xMin: parseFloat(bestXMin.toFixed(4)),
    xMax: parseFloat(bestXMax.toFixed(4)),
  };
}
