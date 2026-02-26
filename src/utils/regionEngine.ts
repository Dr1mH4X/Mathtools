import type { CurveDefinition, ComputedRegion, ProfilePoint } from "./types";
import { compileCurve, evalCurve, createInverseFunction } from "./curveEngine";

// ===================================================================
// Region Engine
//
// Computes the 2D bounded region between curves:
//   1. computeRegion           — general N-curve region computation
//   2. computeRegionTwoCurves  — optimised two-curve variant
//   3. computeRegionMultiCurves — simple multi-curve max/min variant
// ===================================================================

/**
 * Given a set of curves and x-bounds, compute the upper and lower boundary
 * profiles of the bounded region.
 *
 * Revised Algorithm:
 * 1. Scan the x-range iteratively.
 * 2. At each step, identify all valid adjacent curve pairs.
 * 3. Maintain the "active" boundary pair.
 * 4. If the active pair ceases to be valid (e.g., intersection/split),
 *    select the new pair that maintains continuity (matches the previous height).
 */
export function computeRegion(
  curves: CurveDefinition[],
  xMin: number,
  xMax: number,
  resolution: number = 200,
): ComputedRegion {
  if (curves.length < 2) {
    throw new Error("At least 2 curves are needed to define a region.");
  }

  const compiled = curves.map(compileCurve);

  // Separate constant-x curves (vertical lines) which define x boundaries
  let effectiveXMin = xMin;
  let effectiveXMax = xMax;

  const xConstCurves = compiled.filter((c) => c.def.type === "x_const");
  const funcCurves = compiled.filter((c) => c.def.type !== "x_const");

  if (xConstCurves.length >= 2) {
    // Only when we have two or more vertical lines do we use them to bound the region
    const xVals = xConstCurves.map((c) => c.constVal!).sort((a, b) => a - b);
    const first = xVals[0];
    const last = xVals[xVals.length - 1];
    if (first !== undefined) effectiveXMin = Math.max(effectiveXMin, first);
    if (last !== undefined) effectiveXMax = Math.min(effectiveXMax, last);
  }
  // FIX: When there's only one vertical line, do NOT modify the bounds.
  // A single vertical line doesn't define a closed region boundary.
  // Let the intersection detection handle finding the correct x range.

  if (effectiveXMin >= effectiveXMax) {
    throw new Error(
      "Invalid bounds: xMin >= xMax after processing vertical lines.",
    );
  }

  // Convert remaining curves to y(x) functions
  const yFunctions: ((x: number) => number)[] = funcCurves.map((cc) => {
    if (cc.def.type === "y_of_x" || cc.def.type === "y_const") {
      return (x: number) => evalCurve(cc, x);
    } else if (cc.def.type === "x_of_y") {
      return createInverseFunction(cc);
    }
    return (_x: number) => NaN;
  });

  const upperPts: ProfilePoint[] = [];
  const lowerPts: ProfilePoint[] = [];

  const dx = (effectiveXMax - effectiveXMin) / resolution;

  let currentTopIdx: number | null = null;
  let currentBotIdx: number | null = null;
  let prevHeight = 0;

  // Helper to safely evaluate
  const evalFn = (fn: (x: number) => number, x: number): number => {
    const v = fn(x);
    return isFinite(v) ? v : NaN;
  };

  for (let i = 0; i <= resolution; i++) {
    const x = effectiveXMin + i * dx;

    // 1. Evaluate all curves at x
    const values = yFunctions.map((fn, idx) => ({ y: evalFn(fn, x), idx }));

    // Filter valid numbers and sort by y
    const validPoints = values
      .filter((p) => isFinite(p.y))
      .sort((a, b) => a.y - b.y);

    if (validPoints.length < 2) {
      // Not enough curves to define a region at this x
      continue;
    }

    // 2. Identify adjacent pairs
    type Candidate = {
      topIdx: number;
      botIdx: number;
      topY: number;
      botY: number;
      height: number;
    };
    const candidates: Candidate[] = [];

    for (let k = 0; k < validPoints.length - 1; k++) {
      const pBot = validPoints[k]!;
      const pTop = validPoints[k + 1]!;

      const height = pTop.y - pBot.y;

      candidates.push({
        topIdx: pTop.idx,
        botIdx: pBot.idx,
        topY: pTop.y,
        botY: pBot.y,
        height: height,
      });
    }

    // 3. Select the best candidate
    let bestPair: Candidate | null = null;

    if (currentTopIdx === null || currentBotIdx === null) {
      // Initialization: pick the pair with the largest height
      bestPair = candidates.reduce(
        (prev, curr) => (curr.height > prev.height ? curr : prev),
        candidates[0]!,
      );
    } else {
      // Try to maintain current pair
      const samePair = candidates.find(
        (c) => c.topIdx === currentTopIdx && c.botIdx === currentBotIdx,
      );

      if (samePair) {
        bestPair = samePair;
      } else {
        // The current pair split or merged. Need to switch.
        // Strategy: Continuity of Height.
        const possibleSwitches = candidates.filter(
          (c) =>
            (c.topIdx === currentTopIdx || c.botIdx === currentBotIdx) &&
            !(c.topIdx === currentTopIdx && c.botIdx === currentBotIdx),
        );

        if (possibleSwitches.length > 0) {
          bestPair = possibleSwitches.reduce((best, curr) => {
            const bestDiff = Math.abs(best.height - prevHeight);
            const currDiff = Math.abs(curr.height - prevHeight);
            return currDiff < bestDiff ? curr : best;
          }, possibleSwitches[0]!);
        } else {
          // Complete change — fallback: closest height to previous
          bestPair = candidates.reduce((best, curr) => {
            const bestDiff = Math.abs(best.height - prevHeight);
            const currDiff = Math.abs(curr.height - prevHeight);
            return currDiff < bestDiff ? curr : best;
          }, candidates[0]!);
        }
      }
    }

    if (bestPair) {
      upperPts.push({ x, y: bestPair.topY });
      lowerPts.push({ x, y: bestPair.botY });

      currentTopIdx = bestPair.topIdx;
      currentBotIdx = bestPair.botIdx;
      prevHeight = bestPair.height;
    }
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
