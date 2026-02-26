import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import type { ComputedRegion, CurveDefinition } from "@/utils/types";
import { sampleCurve } from "@/utils/mathEngine";

export interface Canvas2DProps {
  curves: CurveDefinition[];
  region: ComputedRegion | null;
  axis: "x" | "y";
  axisValue: number;
  xMin: number;
  xMax: number;
}

export interface Canvas2DHandle {
  takeScreenshot: () => string | null;
}

/** Format a number for display: strip trailing zeros, limit decimals */
function formatTickValue(v: number): string {
  if (Math.abs(v) < 1e-10) return "0";
  if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) {
    return v.toExponential(1);
  }
  // Round to 2 decimal places max
  const s = v.toFixed(2);
  // Strip trailing zeros
  return s.replace(/\.?0+$/, "");
}

/**
 * Find intersection points between pairs of curves in the given x range.
 * Returns array of {x, y} points.
 */
function findIntersections(
  curves: CurveDefinition[],
  viewMinX: number,
  viewMaxX: number,
): { x: number; y: number }[] {
  const intersections: { x: number; y: number }[] = [];
  const steps = 500;
  const dx = (viewMaxX - viewMinX) / steps;

  for (let ci = 0; ci < curves.length; ci++) {
    for (let cj = ci + 1; cj < curves.length; cj++) {
      const pts1 = sampleCurve(curves[ci]!, viewMinX, viewMaxX, steps);
      const pts2 = sampleCurve(curves[cj]!, viewMinX, viewMaxX, steps);

      if (pts1.length < 2 || pts2.length < 2) continue;

      // Build lookup maps indexed by x for fast comparison
      const map2 = new Map<number, number>();
      for (const p of pts2) {
        // Round x to avoid floating point mismatch
        map2.set(Math.round(p.x * 1e8) / 1e8, p.y);
      }

      let prevDiff: number | null = null;
      let prevX = viewMinX;

      for (const p1 of pts1) {
        const key = Math.round(p1.x * 1e8) / 1e8;
        const y2 = map2.get(key);
        if (y2 === undefined || !isFinite(p1.y) || !isFinite(y2)) {
          prevDiff = null;
          continue;
        }

        const diff = p1.y - y2;

        if (
          prevDiff !== null &&
          prevDiff * diff <= 0 &&
          Math.abs(diff - prevDiff) < 100
        ) {
          // Sign change — bisect to find intersection
          let lo = prevX;
          let hi = p1.x;
          for (let iter = 0; iter < 20; iter++) {
            const mid = (lo + hi) / 2;
            const s1 = sampleCurve(
              curves[ci]!,
              mid - dx * 0.001,
              mid + dx * 0.001,
              1,
            );
            const s2 = sampleCurve(
              curves[cj]!,
              mid - dx * 0.001,
              mid + dx * 0.001,
              1,
            );
            if (s1.length === 0 || s2.length === 0) break;
            const midDiff = s1[0]!.y - s2[0]!.y;
            if (!isFinite(midDiff)) break;
            if (prevDiff * midDiff <= 0) {
              hi = mid;
            } else {
              lo = mid;
            }
          }
          const ix = (lo + hi) / 2;
          const sp = sampleCurve(
            curves[ci]!,
            ix - dx * 0.001,
            ix + dx * 0.001,
            1,
          );
          if (sp.length > 0 && isFinite(sp[0]!.y)) {
            // Deduplicate: check if we already have a nearby intersection
            const iy = sp[0]!.y;
            const isDup = intersections.some(
              (pt) =>
                Math.abs(pt.x - ix) < dx * 2 && Math.abs(pt.y - iy) < 0.01,
            );
            if (!isDup) {
              intersections.push({ x: ix, y: iy });
            }
          }
        }

        prevDiff = diff;
        prevX = p1.x;
      }
    }
  }

  return intersections;
}

const Canvas2D = forwardRef<Canvas2DHandle, Canvas2DProps>(function Canvas2D(
  { curves, region, axis, axisValue, xMin, xMax },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport state
  const [view, setView] = useState({
    centerX: 0,
    centerY: 0,
    scale: 50, // pixels per unit
  });

  // Expose screenshot method to parent
  useImperativeHandle(ref, () => ({
    takeScreenshot: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return canvas.toDataURL("image/png");
    },
  }));

  // Interaction state
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Auto-fit when region or bounds change
  useEffect(() => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();

    let minX = xMin;
    let maxX = xMax;
    let minY = -5;
    let maxY = 5;

    if (region) {
      minX = region.xMin;
      maxX = region.xMax;

      let rMinY = Infinity;
      let rMaxY = -Infinity;

      for (const p of region.upperProfile) {
        if (p.y > rMaxY) rMaxY = p.y;
        if (p.y < rMinY) rMinY = p.y;
      }
      for (const p of region.lowerProfile) {
        if (p.y > rMaxY) rMaxY = p.y;
        if (p.y < rMinY) rMinY = p.y;
      }

      if (rMinY !== Infinity && rMaxY !== -Infinity) {
        minY = rMinY;
        maxY = rMaxY;
      }
    }

    const padding = 1.5;
    const dx = maxX - minX || 10;
    const dy = maxY - minY || 10;

    const scaleX = width / (dx * padding);
    const scaleY = height / (dy * padding);
    const scale = Math.min(scaleX, scaleY, 200);

    setView({
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      scale: Math.max(scale, 10),
    });
  }, [region, xMin, xMax]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const { centerX, centerY, scale } = view;

    // Coordinate transforms
    const toScreenX = (x: number) => width / 2 + (x - centerX) * scale;
    const toScreenY = (y: number) => height / 2 - (y - centerY) * scale;

    // Determine grid step
    const step = scale > 100 ? 0.5 : scale > 40 ? 1 : scale > 10 ? 5 : 10;

    const startX = Math.floor((centerX - width / 2 / scale) / step) * step;
    const endX = Math.ceil((centerX + width / 2 / scale) / step) * step;
    const startY = Math.floor((centerY - height / 2 / scale) / step) * step;
    const endY = Math.ceil((centerY + height / 2 / scale) / step) * step;

    // ===== Draw Grid =====
    ctx.strokeStyle = "rgba(150, 150, 150, 0.15)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = startX; x <= endX; x += step) {
      const sx = toScreenX(x);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    }
    for (let y = startY; y <= endY; y += step) {
      const sy = toScreenY(y);
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
    }
    ctx.stroke();

    // ===== Draw Axes =====
    ctx.strokeStyle = "rgba(150, 150, 150, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const originX = toScreenX(0);
    const originY = toScreenY(0);

    if (originX >= 0 && originX <= width) {
      ctx.moveTo(originX, 0);
      ctx.lineTo(originX, height);
    }
    if (originY >= 0 && originY <= height) {
      ctx.moveTo(0, originY);
      ctx.lineTo(width, originY);
    }
    ctx.stroke();

    // ===== Draw Axis Labels (arrows and label text) =====
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    const labelColor = isDark
      ? "rgba(200, 205, 220, 0.8)"
      : "rgba(80, 85, 100, 0.8)";
    const tickTextColor = isDark
      ? "rgba(160, 165, 180, 0.7)"
      : "rgba(90, 95, 110, 0.65)";

    // Axis arrows
    ctx.fillStyle = labelColor;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    // X-axis label
    if (originY >= 0 && originY <= height) {
      ctx.fillText("x", width - 16, originY - 12);
    }
    // Y-axis label
    if (originX >= 0 && originX <= width) {
      ctx.textAlign = "center";
      ctx.fillText("y", originX + 14, 14);
    }

    // ===== Draw Axis Tick Values =====
    ctx.font = "11px sans-serif";
    ctx.fillStyle = tickTextColor;

    // X-axis ticks
    if (originY >= -20 && originY <= height + 20) {
      const tickY = Math.min(Math.max(originY, 0), height);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let x = startX; x <= endX; x += step) {
        if (Math.abs(x) < step * 0.01) continue; // skip 0
        const sx = toScreenX(x);
        if (sx < 20 || sx > width - 20) continue;

        // Draw tick mark
        ctx.strokeStyle = "rgba(150, 150, 150, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, tickY - 3);
        ctx.lineTo(sx, tickY + 3);
        ctx.stroke();

        // Draw value
        ctx.fillStyle = tickTextColor;
        ctx.fillText(formatTickValue(x), sx, tickY + 5);
      }
    }

    // Y-axis ticks
    if (originX >= -20 && originX <= width + 20) {
      const tickX = Math.min(Math.max(originX, 0), width);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let y = startY; y <= endY; y += step) {
        if (Math.abs(y) < step * 0.01) continue; // skip 0
        const sy = toScreenY(y);
        if (sy < 15 || sy > height - 15) continue;

        // Draw tick mark
        ctx.strokeStyle = "rgba(150, 150, 150, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tickX - 3, sy);
        ctx.lineTo(tickX + 3, sy);
        ctx.stroke();

        // Draw value
        ctx.fillStyle = tickTextColor;
        ctx.fillText(formatTickValue(y), tickX - 6, sy);
      }
    }

    // Origin "O" label
    if (
      originX >= 5 &&
      originX <= width - 5 &&
      originY >= 5 &&
      originY <= height - 5
    ) {
      ctx.fillStyle = tickTextColor;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("O", originX - 5, originY + 4);
    }

    // ===== Draw Region =====
    if (region) {
      ctx.fillStyle = "rgba(79, 110, 247, 0.2)";
      ctx.beginPath();

      for (let i = 0; i < region.upperProfile.length; i++) {
        const p = region.upperProfile[i]!;
        const sx = toScreenX(p.x);
        const sy = toScreenY(p.y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }

      for (let i = region.lowerProfile.length - 1; i >= 0; i--) {
        const p = region.lowerProfile[i]!;
        const sx = toScreenX(p.x);
        const sy = toScreenY(p.y);
        ctx.lineTo(sx, sy);
      }

      ctx.closePath();
      ctx.fill();

      // Draw region boundaries
      ctx.strokeStyle = "rgba(79, 110, 247, 0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // ===== Draw Curves =====
    const viewMinX = centerX - width / 2 / scale;
    const viewMaxX = centerX + width / 2 / scale;

    for (const curve of curves) {
      const points = sampleCurve(curve, viewMinX, viewMaxX, 500);
      if (points.length === 0) continue;

      ctx.strokeStyle = curve.color || "#4f6ef7";
      ctx.lineWidth = 2;
      ctx.beginPath();

      let isFirst = true;
      for (const p of points) {
        const sx = toScreenX(p.x);
        const sy = toScreenY(p.y);

        if (isNaN(sy) || !isFinite(sy)) {
          isFirst = true;
          continue;
        }

        if (isFirst) {
          ctx.moveTo(sx, sy);
          isFirst = false;
        } else {
          ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();
    }

    // ===== Draw Revolution Axis =====
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();

    if (axis === "x") {
      const sy = toScreenY(axisValue);
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
    } else {
      const sx = toScreenX(axisValue);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // ===== Draw Intersection Points (Bug #8) =====
    if (curves.length >= 2) {
      const intersections = findIntersections(curves, viewMinX, viewMaxX);

      const intersectionColor = isDark ? "#fbbf24" : "#d97706";
      const intersectionBg = isDark
        ? "rgba(251, 191, 36, 0.15)"
        : "rgba(217, 119, 6, 0.1)";

      for (const pt of intersections) {
        const sx = toScreenX(pt.x);
        const sy = toScreenY(pt.y);

        if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20)
          continue;

        // Draw point circle
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fillStyle = intersectionColor;
        ctx.fill();
        ctx.strokeStyle = isDark ? "#1e2030" : "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw label background and text
        const xStr = formatTickValue(Math.round(pt.x * 1000) / 1000);
        const yStr = formatTickValue(Math.round(pt.y * 1000) / 1000);
        const label = `(${xStr}, ${yStr})`;

        ctx.font = "bold 11px sans-serif";
        const textMetrics = ctx.measureText(label);
        const textW = textMetrics.width + 10;
        const textH = 18;

        // Position label: try top-right of the point, adjust if out of bounds
        let labelX = sx + 10;
        let labelY = sy - 22;
        if (labelX + textW > width - 5) labelX = sx - textW - 5;
        if (labelY < 5) labelY = sy + 10;

        // Background pill
        ctx.fillStyle = intersectionBg;
        ctx.strokeStyle = intersectionColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const r = 4;
        ctx.moveTo(labelX + r, labelY);
        ctx.lineTo(labelX + textW - r, labelY);
        ctx.arcTo(labelX + textW, labelY, labelX + textW, labelY + r, r);
        ctx.lineTo(labelX + textW, labelY + textH - r);
        ctx.arcTo(
          labelX + textW,
          labelY + textH,
          labelX + textW - r,
          labelY + textH,
          r,
        );
        ctx.lineTo(labelX + r, labelY + textH);
        ctx.arcTo(labelX, labelY + textH, labelX, labelY + textH - r, r);
        ctx.lineTo(labelX, labelY + r);
        ctx.arcTo(labelX, labelY, labelX + r, labelY, r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Label text
        ctx.fillStyle = intersectionColor;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(label, labelX + 5, labelY + textH / 2);

        // Draw dashed projection lines to axes
        ctx.strokeStyle = intersectionColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.globalAlpha = 0.4;

        // Projection to X-axis (vertical line from point down to x-axis)
        if (originY >= 0 && originY <= height) {
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx, originY);
          ctx.stroke();

          // Small tick mark and value on x-axis
          ctx.globalAlpha = 0.8;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(sx, originY - 4);
          ctx.lineTo(sx, originY + 4);
          ctx.stroke();

          ctx.fillStyle = intersectionColor;
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(xStr, sx, originY + 6);
          ctx.setLineDash([3, 3]);
          ctx.globalAlpha = 0.4;
        }

        // Projection to Y-axis (horizontal line from point to y-axis)
        if (originX >= 0 && originX <= width) {
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(originX, sy);
          ctx.stroke();

          // Small tick mark and value on y-axis
          ctx.globalAlpha = 0.8;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(originX - 4, sy);
          ctx.lineTo(originX + 4, sy);
          ctx.stroke();

          ctx.fillStyle = intersectionColor;
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          ctx.fillText(yStr, originX - 6, sy);
          ctx.setLineDash([3, 3]);
          ctx.globalAlpha = 0.4;
        }

        ctx.globalAlpha = 1.0;
        ctx.setLineDash([]);
      }
    }
  }, [curves, region, axis, axisValue, view]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw]);

  // Interaction handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;

    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;

    setView((prev) => ({
      ...prev,
      centerX: prev.centerX - dx / prev.scale,
      centerY: prev.centerY + dy / prev.scale,
    }));

    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;

    setView((prev) => ({
      ...prev,
      scale: Math.max(1, Math.min(prev.scale * zoomFactor, 1000)),
    }));
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden bg-bg cursor-move"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
      />

      {/* Controls overlay */}
      <div className="absolute bottom-4 right-4 flex gap-2">
        <button
          className="w-8 h-8 bg-bg-soft border border-border rounded-md flex items-center justify-center text-text hover:bg-bg transition-colors shadow-sm"
          onClick={() =>
            setView((prev) => ({ ...prev, scale: prev.scale * 1.2 }))
          }
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        <button
          className="w-8 h-8 bg-bg-soft border border-border rounded-md flex items-center justify-center text-text hover:bg-bg transition-colors shadow-sm"
          onClick={() =>
            setView((prev) => ({ ...prev, scale: prev.scale / 1.2 }))
          }
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
      </div>
    </div>
  );
});

export default Canvas2D;
