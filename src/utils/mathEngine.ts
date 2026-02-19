import { parse, compile, evaluate, type EvalFunction } from "mathjs";

// ===== Types =====

export type CurveType = "y_of_x" | "x_of_y" | "x_const" | "y_const";

export interface CurveDefinition {
  id: string;
  type: CurveType;
  expression: string;
  /** Raw equation string, e.g. "y = sqrt(x-1)" */
  equation: string;
  color?: string;
}

/**
 * Normalize an expression that may contain LaTeX syntax into
 * mathjs-compatible syntax.
 *
 * Examples:
 *   \sqrt{x-1}   → sqrt(x-1)
 *   sqrt{x-1}    → sqrt(x-1)
 *   \sin(x)      → sin(x)
 *   \frac{a}{b}  → ((a)/(b))
 *   x^{2}        → x^(2)
 *   \pi           → pi
 *   \ln(x)       → log(x)
 *   \cdot         → *
 */
export function normalizeExpression(expr: string): string {
  let s = expr;

  // Process brace-based patterns from inside out in a single convergence
  // loop.  Each pass only matches brace groups whose content has NO nested
  // braces (`[^{}]*`), so the innermost groups are resolved first and outer
  // ones become matchable in subsequent iterations.
  for (let iter = 0; iter < 20; iter++) {
    const prev = s;

    // x^{...} → x^(...)  — innermost exponent braces first
    s = s.replace(/\^\{([^{}]*)\}/g, "^($1)");

    // \sqrt{...} or sqrt{...} → sqrt(...)
    s = s.replace(/\\?sqrt\{([^{}]*)\}/g, "sqrt($1)");

    // \funcname{...} → funcname(...)  (sin, cos, tan, ln, log, exp, abs, arc*)
    s = s.replace(
      /\\?(sin|cos|tan|ln|log|exp|abs|arcsin|arccos|arctan)\{([^{}]*)\}/g,
      "$1($2)",
    );

    // \frac{a}{b} → ((a)/(b))
    s = s.replace(/\\?frac\{([^{}]*)\}\{([^{}]*)\}/g, "(($1)/($2))");

    // If nothing changed this pass, all nested braces have been resolved
    if (s === prev) break;
  }

  // --- Strip backslash from known function/symbol prefixes ---
  // \sin( → sin(,  \cos( → cos(,  etc.
  s = s.replace(
    /\\(sin|cos|tan|ln|log|exp|abs|arcsin|arccos|arctan|sqrt)\b/g,
    "$1",
  );

  // \pi → pi,  \e → e
  s = s.replace(/\\pi\b/g, "pi");
  s = s.replace(/\\e\b/g, "e");

  // \cdot → *
  s = s.replace(/\\cdot/g, "*");

  // \times → *
  s = s.replace(/\\times/g, "*");

  // \div → /
  s = s.replace(/\\div/g, "/");

  // \left and \right are just LaTeX sizing — remove them
  s = s.replace(/\\left/g, "");
  s = s.replace(/\\right/g, "");

  // Remove any remaining stray backslashes before letters (e.g. \alpha unsupported)
  s = s.replace(/\\([a-zA-Z])/g, "$1");

  // \ln → log  (mathjs uses log for natural logarithm)
  s = s.replace(/\bln\(/g, "log(");

  // Clean up any remaining stray braces that LaTeX uses but mathjs doesn't
  // Only remove braces that are NOT inside function call parentheses
  // Simple approach: replace { } with ( )
  s = s.replace(/\{/g, "(");
  s = s.replace(/\}/g, ")");

  return s.trim();
}

/**
 * Convert a raw equation string (e.g. "y = x^2", "y = sqrt(x-1)")
 * into a LaTeX string suitable for KaTeX rendering.
 *
 * Uses mathjs `parse().toTex()` for the RHS so we get proper LaTeX
 * (e.g. \sqrt{x}, x^{2}, \frac{a}{b}).
 *
 * Returns `null` if the equation cannot be parsed.
 */
export function equationToLatex(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalized = normalizeExpression(trimmed);

  const yMatch = normalized.match(/^y\s*=\s*(.+)$/i);
  const xMatch = normalized.match(/^x\s*=\s*(.+)$/i);

  let lhs: string;
  let rhsExpr: string;

  if (yMatch) {
    lhs = "y";
    rhsExpr = yMatch[1]!.trim();
  } else if (xMatch) {
    lhs = "x";
    rhsExpr = xMatch[1]!.trim();
  } else {
    return null;
  }

  try {
    const node = parse(rhsExpr);
    const tex = node.toTex({ parenthesis: "keep", implicit: "hide" });
    return `${lhs} = ${tex}`;
  } catch {
    // Fallback: return a simple escaped version
    return `${lhs} = ${rhsExpr}`;
  }
}

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
    // Determine if it's a constant or a function of x
    if (isConstantExpression(expr, "x")) {
      return { type: "y_const", expression: expr };
    }
    return { type: "y_of_x", expression: expr };
  }

  if (xMatch) {
    const expr = xMatch[1]!.trim();
    // Determine if it's a constant or a function of y
    if (isConstantExpression(expr, "y")) {
      return { type: "x_const", expression: expr };
    }
    return { type: "x_of_y", expression: expr };
  }

  return null;
}

/**
 * Check whether an expression is a constant (does not depend on the given variable).
 * Tries to evaluate the expression without providing the variable.
 */
function isConstantExpression(expr: string, variable: string): boolean {
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

export type RotationAxis = "x" | "y";

export interface RevolutionConfig {
  curves: CurveDefinition[];
  xMin: number;
  xMax: number;
  axis: RotationAxis;
  /** For custom axis offset: rotate around y = axisValue (if axis='x') or x = axisValue (if axis='y') */
  axisValue: number;
  resolution: number;
}

export interface ProfilePoint {
  x: number;
  y: number;
}

export interface ComputedRegion {
  /** The upper boundary profile sampled as points */
  upperProfile: ProfilePoint[];
  /** The lower boundary profile sampled as points */
  lowerProfile: ProfilePoint[];
  /** Effective x bounds after clipping */
  xMin: number;
  xMax: number;
}

export interface RevolutionResult {
  /** Numerical volume value */
  volume: number;
  /** LaTeX string for the volume formula */
  formulaLatex: string;
  /** The 2D region used */
  region: ComputedRegion;
  /** Method description key for i18n */
  methodKey: string;
}

// ===== Compiled curve cache =====

interface CompiledCurve {
  def: CurveDefinition;
  fn: EvalFunction | null;
  constVal: number | null;
}

function compileCurve(curve: CurveDefinition): CompiledCurve {
  if (curve.type === "x_const" || curve.type === "y_const") {
    const val = parseFloat(curve.expression);
    if (isNaN(val)) {
      // Try evaluating as expression (e.g. "pi", "sqrt(2)")
      try {
        const evaluated = evaluate(curve.expression);
        return { def: curve, fn: null, constVal: Number(evaluated) };
      } catch {
        throw new Error(`Cannot parse constant: ${curve.expression}`);
      }
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
    throw new Error(`Cannot parse expression "${curve.expression}": ${msg}`);
  }
}

/**
 * Safely evaluate a compiled curve at a given parameter value.
 * For y_of_x curves, the parameter is x.
 * For x_of_y curves, the parameter is y.
 */
function evalCurve(cc: CompiledCurve, paramValue: number): number {
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

// ===== Intersection finding =====

/**
 * Find approximate intersection x-values of two y=f(x) style functions
 * within [a, b] by scanning and bisection.
 */
function findIntersectionsXRange(
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

// ===== Region computation =====

/**
 * Given a set of curves and x-bounds, compute the upper and lower boundary
 * profiles of the bounded region.
 */
// ... existing imports and types ...

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

  if (xConstCurves.length > 0) {
    const xVals = xConstCurves.map((c) => c.constVal!).sort((a, b) => a - b);
    if (xConstCurves.length >= 2) {
      const first = xVals[0];
      const last = xVals[xVals.length - 1];
      if (first !== undefined) effectiveXMin = Math.max(effectiveXMin, first);
      if (last !== undefined) effectiveXMax = Math.min(effectiveXMax, last);
    } else if (xConstCurves.length === 1) {
      const xv = xVals[0];
      if (xv !== undefined) {
        if (Math.abs(xv - effectiveXMin) < Math.abs(xv - effectiveXMax)) {
          effectiveXMin = xv;
        } else {
          effectiveXMax = xv;
        }
      }
    }
  }

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

  // Add implicit y=0 if needed? No, let's rely on explicit curves or handle empty case.

  const upperPts: ProfilePoint[] = [];
  const lowerPts: ProfilePoint[] = [];

  const dx = (effectiveXMax - effectiveXMin) / resolution;
  const eps = Math.max(1e-9, (effectiveXMax - effectiveXMin) * 1e-9);

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
      // If we were tracking a region, it ends here.
      continue;
    }

    // 2. Identify adjacent pairs
    // A pair is (validPoints[j], validPoints[j+1])
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

      // Check adjacency (no other curve strictly between them - already handled by sorting neighbors)
      // We assume immediate neighbors in sorted list are adjacent.
      // However, for overlapping lines (y=0 and curve touching 0), they might have same Y.
      // We only consider pairs with height > 0?
      // Actually, height can be 0 at intersection, which is valid for continuity.

      const height = pTop.y - pBot.y;

      // Filter out "inverted" or tiny gaps if needed, but 0 height is crucial for intersections.
      // If height is 0, it's an intersection point.

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
      // Heuristic: enclosed region usually starts with the most significant gap.
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
        // Find candidate that maintains height closest to prevHeight.
        // Also, prefer switching only one boundary at a time (Top XOR Bot matches).

        const possibleSwitches = candidates.filter(
          (c) =>
            (c.topIdx === currentTopIdx || c.botIdx === currentBotIdx) &&
            !(c.topIdx === currentTopIdx && c.botIdx === currentBotIdx), // It's a change
        );

        if (possibleSwitches.length > 0) {
          // Prefer the one that keeps the height consistent
          // At an intersection (height 0 of one branch), we want the branch that preserves non-zero height if prev was non-zero.
          // Or strictly minimal height change.
          bestPair = possibleSwitches.reduce((best, curr) => {
            const bestDiff = Math.abs(best.height - prevHeight);
            const currDiff = Math.abs(curr.height - prevHeight);
            return currDiff < bestDiff ? curr : best;
          }, possibleSwitches[0]!);
        } else {
          // Complete change (e.g. entered a new disconnected region? Or logic miss)
          // Fallback: Find candidate with height closest to prevHeight
          bestPair = candidates.reduce((best, curr) => {
            const bestDiff = Math.abs(best.height - prevHeight);
            const currDiff = Math.abs(curr.height - prevHeight);
            return currDiff < bestDiff ? curr : best;
          }, candidates[0]!);
        }
      }
    }

    if (bestPair) {
      // If height is effectively 0, we might skip adding points to avoid zero-area slices,
      // but keeping them is fine for interpolation.
      if (bestPair.height < 1e-12 && i > 0 && i < resolution) {
        // Optional: Skip storing if height is zero?
        // No, storing intersection points is good for boundaries.
      }

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

function computeRegionTwoCurves(
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

function computeRegionMultiCurves(
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

/**
 * Create an approximate inverse function for x = g(y).
 */
function createInverseFunction(cc: CompiledCurve): (x: number) => number {
  const sampleCount = 1000;
  const yGuessMin = -50;
  const yGuessMax = 50;
  const dy = (yGuessMax - yGuessMin) / sampleCount;

  const samples: { x: number; y: number }[] = [];

  for (let i = 0; i <= sampleCount; i++) {
    const y = yGuessMin + i * dy;
    const x = evalCurve(cc, y);
    if (isFinite(x)) {
      samples.push({ x, y });
    }
  }

  // Sort by x for binary search
  samples.sort((a, b) => a.x - b.x);

  return (targetX: number): number => {
    if (samples.length < 2) return NaN;

    const firstSample = samples[0]!;
    const lastSample = samples[samples.length - 1]!;

    if (targetX <= firstSample.x) return firstSample.y;
    if (targetX >= lastSample.x) return lastSample.y;

    // Binary search for interval
    let lo = 0;
    let hi = samples.length - 1;

    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const midSample = samples[mid]!;
      if (midSample.x <= targetX) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    const loSample = samples[lo]!;
    const hiSample = samples[hi]!;
    const t = (targetX - loSample.x) / (hiSample.x - loSample.x || 1);
    return loSample.y + t * (hiSample.y - loSample.y);
  };
}

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

// ===== LaTeX formula builders =====

function buildDiskFormulaLatex(
  axisValue: number,
  xMin: number,
  xMax: number,
): string {
  const a = formatNum(xMin);
  const b = formatNum(xMax);
  if (axisValue === 0) {
    return `V = \\pi \\int_{${a}}^{${b}} \\left[ R(x)^2 - r(x)^2 \\right] \\, dx`;
  }
  const c = formatNum(axisValue);
  return `V = \\pi \\int_{${a}}^{${b}} \\left[ R(x)^2 - r(x)^2 \\right] \\, dx \\quad \\text{about } y = ${c}`;
}

function buildShellFormulaLatex(
  axisValue: number,
  xMin: number,
  xMax: number,
): string {
  const a = formatNum(xMin);
  const b = formatNum(xMax);
  if (axisValue === 0) {
    return `V = 2\\pi \\int_{${a}}^{${b}} x \\left| f(x) - g(x) \\right| \\, dx`;
  }
  const c = formatNum(axisValue);
  return `V = 2\\pi \\int_{${a}}^{${b}} |x - ${c}| \\cdot \\left| f(x) - g(x) \\right| \\, dx`;
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  if (Math.abs(n - Math.PI) < 1e-10) return "\\pi";
  if (Math.abs(n + Math.PI) < 1e-10) return "-\\pi";
  if (Math.abs(n - 2 * Math.PI) < 1e-10) return "2\\pi";
  return n.toFixed(4).replace(/\.?0+$/, "");
}

// ===== Numerical utilities =====

/**
 * Simpson's 1/3 rule for numerical integration.
 */
function simpsonsRule(
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
function createInterpolator(points: ProfilePoint[]): (x: number) => number {
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

// ===== 3D Mesh generation helpers =====

export interface MeshProfilePoint {
  /** Distance from the rotation axis (radius in the rotated solid) */
  radius: number;
  /** Position along the rotation axis */
  axisPos: number;
}

/**
 * Generate profile points for 3D mesh construction.
 *
 * For rotation around x-axis:
 *   - axisPos = x
 *   - radius = |y - axisValue|
 *
 * For rotation around y-axis:
 *   - axisPos = y
 *   - radius = |x - axisValue|
 *
 * Returns an array of outer and inner profiles for washer/shell construction.
 */
export function generateMeshProfiles(
  region: ComputedRegion,
  axis: RotationAxis,
  axisValue: number = 0,
): { outer: MeshProfilePoint[]; inner: MeshProfilePoint[] } {
  const { upperProfile, lowerProfile } = region;
  const outer: MeshProfilePoint[] = [];
  const inner: MeshProfilePoint[] = [];

  if (axis === "x") {
    // Rotating around y = axisValue
    for (let i = 0; i < upperProfile.length; i++) {
      const up = upperProfile[i]!;
      const lo = lowerProfile[i];
      const x = up.x;
      const yUp = up.y;
      const yLo = lo?.y ?? 0;

      const d1 = Math.abs(yUp - axisValue);
      const d2 = Math.abs(yLo - axisValue);

      const axisInside =
        axisValue >= Math.min(yUp, yLo) && axisValue <= Math.max(yUp, yLo);

      outer.push({ axisPos: x, radius: Math.max(d1, d2) });
      inner.push({ axisPos: x, radius: axisInside ? 0 : Math.min(d1, d2) });
    }
  } else {
    // Rotating around x = axisValue (shell method)
    for (let i = 0; i < upperProfile.length; i++) {
      const up = upperProfile[i]!;
      const lo = lowerProfile[i];
      const x = up.x;
      const yUp = up.y;
      const yLo = lo?.y ?? 0;
      const rOuter = Math.abs(x - axisValue);

      outer.push({ axisPos: yUp, radius: rOuter });
      inner.push({ axisPos: yLo, radius: rOuter });
    }
  }

  return { outer, inner };
}

/**
 * Generate vertices for a surface of revolution.
 * Takes a 2D profile (series of (radius, axisPos) points) and sweeps it
 * around the axis by `segments` angular steps.
 *
 * Returns flat arrays suitable for Three.js BufferGeometry:
 *   positions: Float32Array (3 * vertexCount)
 *   indices: Uint32Array (3 * triangleCount)
 *   normals: Float32Array (3 * vertexCount)
 */
export function generateRevolutionGeometry(
  region: ComputedRegion,
  axis: RotationAxis,
  axisValue: number = 0,
  angularSegments: number = 64,
  angleExtent: number = Math.PI * 2,
): {
  positions: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
} {
  const { outer, inner } = generateMeshProfiles(region, axis, axisValue);

  // Build a closed cross-section profile:
  // outer profile forward, then inner profile backward to close the loop
  const profile: MeshProfilePoint[] = [];

  // Outer from start to end
  for (const p of outer) {
    profile.push(p);
  }

  // Cap at the end: connect outer end to inner end
  if (inner.length > 0) {
    // Inner from end to start (reversed)
    for (let i = inner.length - 1; i >= 0; i--) {
      profile.push(inner[i]!);
    }
  }

  const profileLen = profile.length;
  const angSegs = angularSegments;
  const vertCount = profileLen * (angSegs + 1);
  const triCount = profileLen * angSegs * 2;

  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const indices = new Uint32Array(triCount * 3);

  // Generate vertices by sweeping profile
  for (let j = 0; j <= angSegs; j++) {
    const angle = (j / angSegs) * angleExtent;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    for (let i = 0; i < profileLen; i++) {
      const idx = j * profileLen + i;
      const pt = profile[i]!;
      const r = pt.radius;
      const h = pt.axisPos;

      let px: number, py: number, pz: number;

      if (axis === "x") {
        // Rotation axis is along X (horizontal)
        px = h;
        py = axisValue + r * cosA;
        pz = r * sinA;
      } else {
        // Rotation axis is along Y (vertical)
        px = axisValue + r * cosA;
        py = h;
        pz = r * sinA;
      }

      positions[idx * 3] = px;
      positions[idx * 3 + 1] = py;
      positions[idx * 3 + 2] = pz;
    }
  }

  // Generate indices
  let triIdx = 0;
  for (let j = 0; j < angSegs; j++) {
    for (let i = 0; i < profileLen; i++) {
      const nextI = (i + 1) % profileLen;
      const a = j * profileLen + i;
      const b = j * profileLen + nextI;
      const c = (j + 1) * profileLen + nextI;
      const d = (j + 1) * profileLen + i;

      indices[triIdx++] = a;
      indices[triIdx++] = b;
      indices[triIdx++] = c;

      indices[triIdx++] = a;
      indices[triIdx++] = c;
      indices[triIdx++] = d;
    }
  }

  // Compute normals
  computeNormals(positions, indices, normals);

  return { positions, indices, normals };
}

function computeNormals(
  positions: Float32Array,
  indices: Uint32Array,
  normals: Float32Array,
): void {
  // Zero out normals
  normals.fill(0);

  // Accumulate face normals
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i]!;
    const ib = indices[i + 1]!;
    const ic = indices[i + 2]!;

    const ax = positions[ia * 3]!,
      ay = positions[ia * 3 + 1]!,
      az = positions[ia * 3 + 2]!;
    const bx = positions[ib * 3]!,
      by = positions[ib * 3 + 1]!,
      bz = positions[ib * 3 + 2]!;
    const cx = positions[ic * 3]!,
      cy = positions[ic * 3 + 1]!,
      cz = positions[ic * 3 + 2]!;

    const e1x = bx - ax,
      e1y = by - ay,
      e1z = bz - az;
    const e2x = cx - ax,
      e2y = cy - ay,
      e2z = cz - az;

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    for (const idx of [ia, ib, ic]) {
      normals[idx * 3] = (normals[idx * 3] ?? 0) + nx;
      normals[idx * 3 + 1] = (normals[idx * 3 + 1] ?? 0) + ny;
      normals[idx * 3 + 2] = (normals[idx * 3 + 2] ?? 0) + nz;
    }
  }

  // Normalize
  for (let i = 0; i < normals.length; i += 3) {
    const nx = normals[i]!;
    const ny = normals[i + 1]!;
    const nz = normals[i + 2]!;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-8) {
      normals[i] = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
    }
  }
}

// ===== Auto bound detection =====

/**
 * Try to automatically detect reasonable x-bounds for the given curves.
 * Looks for intersection points and extends slightly beyond.
 */
export function autoDetectBounds(
  curves: CurveDefinition[],
  searchRange: [number, number] = [-20, 20],
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

  // Build y(x) evaluation functions
  const yFunctions: ((x: number) => number)[] = funcCurves.map((cc) => {
    if (cc.def.type === "y_of_x" || cc.def.type === "y_const") {
      return (x: number) => evalCurve(cc, x);
    } else if (cc.def.type === "x_of_y") {
      return createInverseFunction(cc);
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

// ===== Preset examples =====

export interface PresetExample {
  nameKey: string;
  descKey: string;
  curves: CurveDefinition[];
  xMin: number;
  xMax: number;
  axis: RotationAxis;
  axisValue: number;
}

export const presetExamples: PresetExample[] = [
  {
    nameKey: "revolution.help.example1Name",
    descKey: "revolution.help.example1Desc",
    curves: [
      {
        id: "1",
        type: "y_of_x",
        expression: "x^2",
        equation: "y = x^2",
        color: "#4f6ef7",
      },
      {
        id: "2",
        type: "y_const",
        expression: "4",
        equation: "y = 4",
        color: "#e74c8b",
      },
    ],
    xMin: -2,
    xMax: 2,
    axis: "x",
    axisValue: 0,
  },
  {
    nameKey: "revolution.help.example2Name",
    descKey: "revolution.help.example2Desc",
    curves: [
      {
        id: "1",
        type: "y_of_x",
        expression: "sin(x)",
        equation: "y = sin(x)",
        color: "#4f6ef7",
      },
      {
        id: "2",
        type: "y_const",
        expression: "0",
        equation: "y = 0",
        color: "#e74c8b",
      },
    ],
    xMin: 0,
    xMax: 3.14159,
    axis: "x",
    axisValue: 0,
  },
  {
    nameKey: "revolution.help.example3Name",
    descKey: "revolution.help.example3Desc",
    curves: [
      {
        id: "1",
        type: "y_of_x",
        expression: "x",
        equation: "y = x",
        color: "#4f6ef7",
      },
      {
        id: "2",
        type: "y_of_x",
        expression: "x^2",
        equation: "y = x^2",
        color: "#e74c8b",
      },
    ],
    xMin: 0,
    xMax: 1,
    axis: "y",
    axisValue: 0,
  },
];

// ===== Evaluation helper for 2D canvas drawing =====

/**
 * Evaluate a single curve expression at the given x values.
 * Returns an array of { x, y } points (NaN values are filtered out).
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

  const cc = compileCurve(effectiveCurve);
  const dx = (xMax - xMin) / steps;
  const pts: ProfilePoint[] = [];

  if (effectiveCurve.type === "x_const") {
    const xVal = cc.constVal ?? 0;
    pts.push({ x: xVal, y: -1000 });
    pts.push({ x: xVal, y: 1000 });
    return pts;
  }

  if (effectiveCurve.type === "y_const") {
    const yVal = cc.constVal ?? 0;
    pts.push({ x: xMin, y: yVal });
    pts.push({ x: xMax, y: yVal });
    return pts;
  }

  if (effectiveCurve.type === "x_of_y") {
    const yMin = -10;
    const yMax = 10;
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

/**
 * Format a volume value nicely, showing exact multiples of π if possible.
 */
export function formatVolume(volume: number): {
  display: string;
  latex: string;
} {
  const piMultiple = volume / Math.PI;

  // Check if it's a clean multiple of π
  if (
    Math.abs(piMultiple - Math.round(piMultiple)) < 0.0001 &&
    Math.abs(piMultiple) > 0.01
  ) {
    const n = Math.round(piMultiple);
    if (n === 1) return { display: "π", latex: "\\pi" };
    if (n === -1) return { display: "-π", latex: "-\\pi" };
    return { display: `${n}π`, latex: `${n}\\pi` };
  }

  // Check for simple fractions of π
  for (const denom of [2, 3, 4, 5, 6, 8, 10, 12]) {
    const numer = piMultiple * denom;
    if (Math.abs(numer - Math.round(numer)) < 0.001 && Math.abs(numer) > 0.01) {
      const n = Math.round(numer);
      const g = gcd(Math.abs(n), denom);
      const num = n / g;
      const den = denom / g;
      if (den === 1) {
        if (num === 1) return { display: "π", latex: "\\pi" };
        if (num === -1) return { display: "-π", latex: "-\\pi" };
        return { display: `${num}π`, latex: `${num}\\pi` };
      }
      return {
        display: `${num}π/${den}`,
        latex: `\\frac{${num}\\pi}{${den}}`,
      };
    }
  }

  // Just a decimal
  const formatted = volume.toFixed(6).replace(/\.?0+$/, "");
  return { display: formatted, latex: formatted };
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}
