import { parse } from "mathjs";

// ===================================================================
// LaTeX Module
//
// Handles all LaTeX-related transformations:
//   1. normalizeExpression  — LaTeX → mathjs-compatible string (for computation)
//   2. equationToLatex      — raw equation → LaTeX string (for KaTeX display)
//   3. formatVolume         — numerical volume → display/LaTeX pair
//   4. buildDiskFormulaLatex / buildShellFormulaLatex — integral formulas
//   5. formatNum            — number → clean LaTeX string
// ===================================================================

/**
 * Normalize an expression that may contain LaTeX syntax into
 * mathjs-compatible syntax.  This is used on the **computation** path
 * (parseEquation → compileCurve → numerical evaluation).
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
  // Simple approach: replace { } with ( )
  s = s.replace(/\{/g, "(");
  s = s.replace(/\}/g, ")");

  return s.trim();
}

// ===================================================================
// Equation → LaTeX  (for KaTeX display)
// ===================================================================

/**
 * Convert a raw equation string (e.g. "y = x^2", "y = \frac{1}{2}")
 * into a LaTeX string suitable for KaTeX rendering.
 *
 * Uses mathjs `parse().toTex()` for the RHS so we get proper LaTeX
 * (e.g. \sqrt{x}, x^{2}, \frac{a}{b}).
 *
 * **Key fix**: uses `parenthesis: "auto"` so that mathjs only emits
 * parentheses when mathematically necessary, instead of preserving
 * the double-parentheses injected by `normalizeExpression` (which
 * converts `\frac{a}{b}` → `((a)/(b))` for computation purposes).
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
    // "auto" — mathjs decides whether parentheses are needed based on
    // operator precedence, so `((1)/(2))` renders as `\frac{1}{2}`
    // instead of the previous buggy `\left(\frac{\left(1\right)}{\left(2\right)}\right)`.
    const tex = node.toTex({ parenthesis: "auto", implicit: "hide" });
    return `${lhs} = ${cleanupMathjsTex(tex)}`;
  } catch {
    // Fallback: return a simple escaped version
    return `${lhs} = ${rhsExpr}`;
  }
}

/**
 * Clean up quirks in the LaTeX string produced by mathjs `toTex()`.
 *
 * mathjs inserts a spurious space after `{` and before `\right)` in many
 * places, e.g. `{ x}^{2}` instead of `{x}^{2}`, or `\sin\left( x\right)`
 * instead of `\sin\left(x\right)`.  While KaTeX *can* handle the spaced
 * forms, they occasionally interact badly with certain KaTeX CSS rules
 * (especially in inline mode or tight containers) and produce visually
 * broken output such as the exponent appearing at the baseline (`x2`
 * instead of `x²`).
 *
 * This function strips those extra spaces so the LaTeX is clean and
 * portable across renderers.
 */
function cleanupMathjsTex(tex: string): string {
  // `{ x}` → `{x}`,  `{ x+1}` → `{x+1}`,  etc.
  let s = tex.replace(/\{\s+/g, "{");
  // `\left( x\right)` → `\left(x\right)`
  s = s.replace(/\\left\(\s+/g, "\\left(");
  // Trailing space before \right: `x \right)` → `x\right)`
  s = s.replace(/\s+\\right/g, "\\right");
  // `( x)` without \left/\right — rare but possible
  s = s.replace(/\(\s+/g, "(");
  return s;
}

// ===================================================================
// Number / volume formatting helpers
// ===================================================================

/**
 * Format a single number for use inside a LaTeX expression.
 * Handles integers, π multiples, and decimals.
 */
export function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  if (Math.abs(n - Math.PI) < 1e-10) return "\\pi";
  if (Math.abs(n + Math.PI) < 1e-10) return "-\\pi";
  if (Math.abs(n - 2 * Math.PI) < 1e-10) return "2\\pi";
  return n.toFixed(4).replace(/\.?0+$/, "");
}

/** Greatest common divisor (used by formatVolume) */
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
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

// ===================================================================
// Integral formula builders  (used by volumeEngine)
// ===================================================================

/**
 * Build the LaTeX formula string for the disk/washer method.
 */
export function buildDiskFormulaLatex(
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

/**
 * Build the LaTeX formula string for the shell method.
 */
export function buildShellFormulaLatex(
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
