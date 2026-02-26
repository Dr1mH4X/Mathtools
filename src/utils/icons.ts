// ===================================================================
// icons.ts — Pure TypeScript Lucide icon renderer
//
// Replaces `lucide-vue-next` with direct SVG element creation using
// the `lucide` package's icon data.
// ===================================================================

import {
  createElement,
  type IconNode,
  Activity,
  Plus,
  X,
  RefreshCw,
  Settings,
  BookOpen,
  Play,
  RotateCcw,
  HelpCircle,
  XCircle,
  Layers,
  LayoutGrid,
  Eye,
  Download,
  TrendingUp,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  MoveHorizontal,
  MoveVertical,
  Lightbulb,
  Palette,
  ArrowRight,
  ChevronRight,
  Calculator,
  LineChart,
  FunctionSquare,
  Ruler,
  BarChart3,
  Sun,
  Moon,
  Github,
} from "lucide";

export {
  Activity,
  Plus,
  X,
  RefreshCw,
  Settings,
  BookOpen,
  Play,
  RotateCcw,
  HelpCircle,
  XCircle,
  Layers,
  LayoutGrid,
  Eye,
  Download,
  TrendingUp,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  MoveHorizontal,
  MoveVertical,
  Lightbulb,
  Palette,
  ArrowRight,
  ChevronRight,
  Calculator,
  LineChart,
  FunctionSquare,
  Ruler,
  BarChart3,
  Sun,
  Moon,
  Github,
};

export type { IconNode };

export interface IconOptions {
  size?: number;
  class?: string;
  color?: string;
  strokeWidth?: number;
}

/**
 * Create an SVG element from a Lucide icon definition.
 *
 * @param iconNode - The Lucide icon array (e.g. `Activity`, `Plus`, etc.)
 * @param options  - Optional size, class, color, strokeWidth overrides.
 * @returns An `SVGSVGElement` ready to be inserted into the DOM.
 *
 * @example
 * ```ts
 * import { icon, RefreshCw } from "@/utils/icons";
 * const el = icon(RefreshCw, { size: 18, class: "text-primary shrink-0" });
 * container.appendChild(el);
 * ```
 */
export function icon(iconNode: IconNode, options: IconOptions = {}): SVGSVGElement {
  const size = options.size ?? 24;
  const attrs: Record<string, string> = {
    xmlns: "http://www.w3.org/2000/svg",
    width: String(size),
    height: String(size),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: options.color ?? "currentColor",
    "stroke-width": String(options.strokeWidth ?? 2),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  };

  if (options.class) {
    attrs["class"] = options.class;
  }

  const svgEl = createElement(iconNode) as unknown as SVGSVGElement;

  // `createElement` from lucide returns an SVGElement with default attrs.
  // We override specific attributes.
  for (const [key, value] of Object.entries(attrs)) {
    svgEl.setAttribute(key, value);
  }

  return svgEl;
}

/**
 * Render an icon and return its outer HTML string.
 * Useful for `innerHTML` assignments.
 */
export function iconHtml(iconNode: IconNode, options: IconOptions = {}): string {
  const el = icon(iconNode, options);
  const wrapper = document.createElement("div");
  wrapper.appendChild(el);
  return wrapper.innerHTML;
}
