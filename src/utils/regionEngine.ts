import type {
  CurveDefinition,
  ComputedRegion,
  ProfilePoint,
  RotationAxis,
} from "./types";
import type { InverseFunctionOptions } from "./curveEngine";
import {
  compileCurve,
  evalCurve,
  tryCreateInverseFunction,
} from "./curveEngine";

// ===================================================================
// Region Engine
//
// Computes the 2D bounded region between curves:
//   1. computeRegion           — general N-curve region computation
//   2. computeRegionTwoCurves  — optimised two-curve variant
//   3. computeRegionMultiCurves — simple multi-curve max/min variant
// ===================================================================

/**
 * Options for region computation.
 */
export interface RegionOptions {
  /** The axis of rotation (affects which region is selected) */
  axis?: RotationAxis;
  /** The value of the rotation axis (e.g., y=0 for x-axis rotation) */
  axisValue?: number;
  /** Options for inverse function creation */
  inverseOptions?: InverseFunctionOptions;
}

/**
 * Given a set of curves and x-bounds, compute the upper and lower boundary
 * profiles of the bounded region.
 *
 * Revised Algorithm:
 * 1. Scan the x-range iteratively.
 * 2. At each step, identify all valid adjacent curve pairs.
 * 3. Maintain the "active" boundary pair.
 * 4. If the active pair ceases to be valid (e.g., intersection/split),
 *    select the new pair using topological crossing detection.
 * 5. When rotating around x-axis, ensure the region is above the axis.
 */
export function computeRegion(
  curves: CurveDefinition[],
  xMin: number,
  xMax: number,
  resolution: number = 200,
  options?: RegionOptions,
): ComputedRegion {
  if (curves.length < 2) {
    throw new Error("At least 2 curves are needed to define a region.");
  }

  const compiled = curves.map(compileCurve);

  // Extract rotation axis information
  const axis = options?.axis ?? "x";
  const axisValue = options?.axisValue ?? 0;
  const inverseOptions = options?.inverseOptions;

  let effectiveXMin = xMin;
  let effectiveXMax = xMax;

  const xConstCurves = compiled.filter((c) => c.def.type === "x_const");
  const funcCurves = compiled.filter((c) => c.def.type !== "x_const");

  if (xConstCurves.length >= 2) {
    const xVals = xConstCurves.map((c) => c.constVal!).sort((a, b) => a - b);
    const first = xVals[0];
    const last = xVals[xVals.length - 1];
    if (first !== undefined) effectiveXMin = Math.max(effectiveXMin, first);
    if (last !== undefined) effectiveXMax = Math.min(effectiveXMax, last);
  }

  if (effectiveXMin >= effectiveXMax) {
    throw new Error(
      "Invalid bounds: xMin >= xMax after processing vertical lines.",
    );
  }

  const yFunctions: ((x: number) => number)[] = funcCurves.map((cc) => {
    if (cc.def.type === "y_of_x" || cc.def.type === "y_const") {
      return (x: number) => evalCurve(cc, x);
    } else if (cc.def.type === "x_of_y") {
      return tryCreateInverseFunction(cc, inverseOptions);
    }
    return (_x: number) => NaN;
  });

  const evalFn = (fn: (x: number) => number, x: number): number => {
    const v = fn(x);
    return isFinite(v) ? v : NaN;
  };

  const isXAxisRotation = axis === "x";

  // ---------------------------------------------------------------
  // FIX: Only add the rotation axis as a virtual boundary if the user
  // provided fewer than 2 explicit curves. When 2+ curves are provided,
  // we must respect the user's intention and let the algorithm find the
  // region among *their* curves. Otherwise, a spurious axis curve can
  // create a smaller sub-region (e.g. between y=e^-x and y=0 instead of
  // y=e^x and y=e^-x) that incorrectly wins the "tightest enclosure" heuristic.
  // ---------------------------------------------------------------
  const allFunctions = [...yFunctions];
  const axisFunction = (_x: number) => axisValue;

  if (yFunctions.length < 2) {
    allFunctions.push(axisFunction);
  }

  const totalFunctions = allFunctions.length;
  let bestTopIdx = 1;
  let bestBotIdx = 0;
  let bestScore = Infinity;

  const scanSteps = Math.min(resolution, 100);
  const scanDx = (effectiveXMax - effectiveXMin) / scanSteps;

  // We want minimum average gap (tightest enclosure)
  for (let i = 0; i < totalFunctions; i++) {
    for (let j = i + 1; j < totalFunctions; j++) {
      let totalGap = 0;
      let validCount = 0;
      let nonzeroCount = 0;

      for (let s = 0; s <= scanSteps; s++) {
        const x = effectiveXMin + s * scanDx;
        const yi = evalFn(allFunctions[i]!, x);
        const yj = evalFn(allFunctions[j]!, x);
        if (!isFinite(yi) || !isFinite(yj)) continue;

        // For x-axis rotation, skip pairs where both are below the axis
        if (isXAxisRotation && Math.min(yi, yj) < axisValue - 1e-9) {
          continue;
        }

        const gap = Math.abs(yi - yj);
        totalGap += gap;
        validCount++;
        if (gap > 1e-9) nonzeroCount++;
      }

      if (validCount === 0) continue;

      const avgGap = totalGap / validCount;
      const nonzeroFrac = nonzeroCount / validCount;

      if (nonzeroFrac < 0.3) continue;

      if (avgGap < bestScore) {
        bestScore = avgGap;
        bestTopIdx = i;
        bestBotIdx = j;
      }
    }
  }

  // ---------------------------------------------------------------
  // With the best pair locked, evaluate those two curves at
  // each sample point. Apply axis constraint for x-axis rotation.
  // ---------------------------------------------------------------
  const fTop = allFunctions[bestTopIdx]!;
  const fBot = allFunctions[bestBotIdx]!;
  const upperPts: ProfilePoint[] = [];
  const lowerPts: ProfilePoint[] = [];
  const dx = (effectiveXMax - effectiveXMin) / resolution;

  for (let i = 0; i <= resolution; i++) {
    const x = effectiveXMin + i * dx;
    const ya = evalFn(fTop, x);
    const yb = evalFn(fBot, x);
    if (!isFinite(ya) || !isFinite(yb)) continue;

    let hi = Math.max(ya, yb);
    let lo = Math.min(ya, yb);

    // For x-axis rotation, clamp the lower boundary to the axis
    if (isXAxisRotation) {
      if (hi < axisValue - 1e-9) continue;
      lo = Math.max(lo, axisValue);
      if (hi < lo) continue;
    }

    upperPts.push({ x, y: hi });
    lowerPts.push({ x, y: lo });
  }

  if (upperPts.length < 2) {
    throw new Error("No valid points found for the bounded region.");
  }

  return {
    upperProfile: upperPts,
    lowerProfile: lowerPts,
    xMin: effectiveXMin,
    xMax: effectiveXMax,
  };
}

/**
 * Compute the bounded region between exactly two y(x) functions.
 * Uses one-sided probing to handle domain boundaries (e.g. sqrt).
 */
export function computeRegionTwoCurves(
  f1: (x: number) => number,
  f2: (x: number) => number,
  xMin: number,
  xMax: number,
  resolution: number,
): ComputedRegion {
  const dx = (xMax - xMin) / resolution;
  const upper: ProfilePoint[] = [];
  const lower: ProfilePoint[] = [];

  const span = Math.max(xMax - xMin, 1);
  const probe = Math.max(1e-12, span * 1e-12);
  const zeroSnap = 1e-10;

  const snapNearZero = (v: number): number =>
    isFinite(v) && Math.abs(v) < zeroSnap ? 0 : v;

  const evalWithOneSidedProbe = (
    fn: (x: number) => number,
    x: number,
    side: "left" | "right" | null,
  ): number => {
    const y0 = fn(x);
    if (isFinite(y0)) return snapNearZero(y0);

    const rightProbes = [x + probe, x + 10 * probe];
    const leftProbes = [x - probe, x - 10 * probe];

    const probes =
      side === "right"
        ? rightProbes
        : side === "left"
          ? leftProbes
          : [x + probe, x - probe, x + 10 * probe, x - 10 * probe];

    for (const px of probes) {
      const y = fn(px);
      if (isFinite(y)) return snapNearZero(y);
    }

    return NaN;
  };

  const pushSample = (x: number, side: "left" | "right" | null): void => {
    const y1 = evalWithOneSidedProbe(f1, x, side);
    const y2 = evalWithOneSidedProbe(f2, x, side);

    if (!isFinite(y1) || !isFinite(y2)) return;

    const hi = Math.max(y1, y2);
    const lo = Math.min(y1, y2);

    upper.push({ x, y: hi });
    lower.push({ x, y: lo });
  };

  // Force endpoint samples first to preserve boundary points like (1, 0) for sqrt(x-1).
  pushSample(xMin, "right");

  for (let i = 1; i < resolution; i++) {
    const x = xMin + i * dx;
    pushSample(x, null);
  }

  pushSample(xMax, "left");

  if (upper.length < 2) {
    throw new Error("No valid points found for the bounded region.");
  }

  return { upperProfile: upper, lowerProfile: lower, xMin, xMax };
}

/**
 * Compute the bounded region among N y(x) functions by taking the
 * global max and min at each sample point.
 */
export function computeRegionMultiCurves(
  fns: ((x: number) => number)[],
  xMin: number,
  xMax: number,
  resolution: number,
): ComputedRegion {
  const dx = (xMax - xMin) / resolution;
  const upper: ProfilePoint[] = [];
  const lower: ProfilePoint[] = [];

  for (let i = 0; i <= resolution; i++) {
    const x = xMin + i * dx;
    const values = fns.map((f) => f(x)).filter((v) => isFinite(v));

    if (values.length < 2) continue;

    const hi = Math.max(...values);
    const lo = Math.min(...values);

    upper.push({ x, y: hi });
    lower.push({ x, y: lo });
  }

  if (upper.length < 2) {
    throw new Error("No valid points found for the bounded region.");
  }

  return { upperProfile: upper, lowerProfile: lower, xMin, xMax };
}
