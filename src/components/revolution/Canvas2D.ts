// ===================================================================
// Canvas2D.ts — Pure TypeScript 2D canvas component
//
// Replaces Canvas2D.vue with direct DOM manipulation.
// All drawing algorithms are preserved exactly as they were.
// ===================================================================

import type { CurveDefinition, ComputedRegion } from "@/utils/mathEngine";
import { sampleCurve, evalConst } from "@/utils/mathEngine";

export interface Canvas2DProps {
  curves: CurveDefinition[];
  region: ComputedRegion | null;
  xMin: number;
  xMax: number;
  axis: "x" | "y";
  axisValue: number;
}

export interface Canvas2DInstance {
  resetView: () => void;
  draw: () => void;
  destroy: () => void;
  update: (props: Canvas2DProps) => void;
}

const defaultCurveColors = [
  "#4f6ef7",
  "#e74c8b",
  "#2ecc71",
  "#f0a500",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#3498db",
];

export function createCanvas2D(
  parent: HTMLElement,
  initialProps: Canvas2DProps,
): Canvas2DInstance {
  let props: Canvas2DProps = { ...initialProps };

  let canvasWidth = 600;
  let canvasHeight = 400;

  // View transform state
  let viewOffsetX = 0;
  let viewOffsetY = 0;
  let viewScale = 1;

  // Interaction state
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  let pinchStartDistance = 0;
  let pinchStartScale = 1;
  let lastTouchCenter: { x: number; y: number } | null = null;

  // ---- DOM elements ----
  const containerRef = document.createElement("div");
  containerRef.className =
    "relative w-full h-full min-h-[300px] overflow-hidden rounded-md bg-bg-card";

  const canvasEl = document.createElement("canvas");
  canvasEl.className = "block cursor-grab active:cursor-grabbing";
  canvasEl.style.touchAction = "pan-x pan-y pinch-zoom";
  containerRef.appendChild(canvasEl);

  // Control buttons container
  const ctrlContainer = document.createElement("div");
  ctrlContainer.className =
    "absolute top-2.5 right-2.5 flex flex-col gap-1 z-[5]";

  // Reset view button
  const resetBtn = createCtrlButton(
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
    "Reset view",
  );
  resetBtn.addEventListener("click", () => resetView());

  // Zoom in button
  const zoomInBtn = createCtrlButton(
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
    "Zoom in",
  );
  zoomInBtn.addEventListener("click", () => {
    viewScale *= 1.2;
    draw();
  });

  // Zoom out button
  const zoomOutBtn = createCtrlButton(
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
    "Zoom out",
  );
  zoomOutBtn.addEventListener("click", () => {
    viewScale *= 0.8;
    draw();
  });

  ctrlContainer.appendChild(resetBtn);
  ctrlContainer.appendChild(zoomInBtn);
  ctrlContainer.appendChild(zoomOutBtn);
  containerRef.appendChild(ctrlContainer);

  parent.appendChild(containerRef);

  // ---- Helper: create control button ----
  function createCtrlButton(svgHtml: string, title: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "canvas-ctrl-btn";
    btn.title = title;
    btn.innerHTML = svgHtml;
    return btn;
  }

  // ---- Coordinate transform: math coords -> canvas pixel coords ----
  function mathToCanvas(
    mx: number,
    my: number,
    padding: number,
    xRange: [number, number],
    yRange: [number, number],
  ): { cx: number; cy: number } {
    const drawW = canvasWidth - padding * 2;
    const drawH = canvasHeight - padding * 2;

    const xSpan = xRange[1] - xRange[0] || 1;
    const ySpan = yRange[1] - yRange[0] || 1;

    // Maintain aspect ratio
    const scaleX = drawW / xSpan;
    const scaleY = drawH / ySpan;
    const scale = Math.min(scaleX, scaleY) * viewScale;

    const centerX = (xRange[0] + xRange[1]) / 2;
    const centerY = (yRange[0] + yRange[1]) / 2;

    const cx = canvasWidth / 2 + (mx - centerX) * scale + viewOffsetX;
    const cy = canvasHeight / 2 - (my - centerY) * scale + viewOffsetY;

    return { cx, cy };
  }

  function computeViewRanges(_padding: number): {
    xRange: [number, number];
    yRange: [number, number];
  } {
    let yMin = Infinity;
    let yMax = -Infinity;
    let xMinVal = props.xMin;
    let xMaxVal = props.xMax;

    // Sample curves to find y extent
    for (const curve of props.curves) {
      try {
        const pts = sampleCurve(curve, props.xMin, props.xMax, 200);
        for (const p of pts) {
          if (isFinite(p.y) && Math.abs(p.y) < 1000) {
            if (p.y < yMin) yMin = p.y;
            if (p.y > yMax) yMax = p.y;
          }
          if (isFinite(p.x)) {
            if (p.x < xMinVal) xMinVal = p.x;
            if (p.x > xMaxVal) xMaxVal = p.x;
          }
        }
      } catch {
        // skip invalid curves
      }
    }

    // If region is available, use its bounds too
    if (props.region) {
      for (const p of props.region.upperProfile) {
        if (p.y > yMax) yMax = p.y;
        if (p.y < yMin) yMin = p.y;
      }
      for (const p of props.region.lowerProfile) {
        if (p.y > yMax) yMax = p.y;
        if (p.y < yMin) yMin = p.y;
      }
    }

    if (!isFinite(yMin)) yMin = -5;
    if (!isFinite(yMax)) yMax = 5;
    if (yMin === yMax) {
      yMin -= 2;
      yMax += 2;
    }

    // Add margin
    const xMargin = (xMaxVal - xMinVal) * 0.15 || 1;
    const yMargin = (yMax - yMin) * 0.15 || 1;

    return {
      xRange: [xMinVal - xMargin, xMaxVal + xMargin],
      yRange: [yMin - yMargin, yMax + yMargin],
    };
  }

  function draw(): void {
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = canvasWidth * dpr;
    canvasEl.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    ctx.fillStyle = isDark ? "#1e2030" : "#ffffff";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const padding = 40;
    const { xRange, yRange } = computeViewRanges(padding);

    // Draw grid
    drawGrid(ctx, padding, xRange, yRange, isDark);

    // Draw axes
    drawAxes(ctx, padding, xRange, yRange, isDark);

    // Draw filled region
    if (props.region) {
      drawRegion(ctx, padding, xRange, yRange, isDark);
    }

    // Draw curves
    drawCurves(ctx, padding, xRange, yRange);

    // Draw axis of revolution indicator
    drawRevolutionAxis(ctx, padding, xRange, yRange);

    // Draw axis labels and tick values
    drawLabels(ctx, padding, xRange, yRange, isDark);
  }

  function drawGrid(
    ctx: CanvasRenderingContext2D,
    padding: number,
    xRange: [number, number],
    yRange: [number, number],
    isDark: boolean,
  ): void {
    const gridColor = isDark
      ? "rgba(255,255,255,0.06)"
      : "rgba(0,0,0,0.06)";
    const subGridColor = isDark
      ? "rgba(255,255,255,0.03)"
      : "rgba(0,0,0,0.03)";

    ctx.lineWidth = 1;

    // Determine nice grid spacing
    const xSpan = xRange[1] - xRange[0];
    const ySpan = yRange[1] - yRange[0];
    const xStep = niceStep(xSpan / 8);
    const yStep = niceStep(ySpan / 8);

    // Vertical grid lines
    const xStart = Math.ceil(xRange[0] / xStep) * xStep;
    for (let x = xStart; x <= xRange[1]; x += xStep) {
      const { cx } = mathToCanvas(x, 0, padding, xRange, yRange);
      if (cx < 0 || cx > canvasWidth) continue;

      ctx.strokeStyle = gridColor;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, canvasHeight);
      ctx.stroke();

      // Sub-grid
      const subStep = xStep / 5;
      for (
        let sx = x + subStep;
        sx < x + xStep && sx <= xRange[1];
        sx += subStep
      ) {
        const { cx: scx } = mathToCanvas(sx, 0, padding, xRange, yRange);
        if (scx < 0 || scx > canvasWidth) continue;
        ctx.strokeStyle = subGridColor;
        ctx.beginPath();
        ctx.moveTo(scx, 0);
        ctx.lineTo(scx, canvasHeight);
        ctx.stroke();
      }
    }

    // Horizontal grid lines
    const yStart = Math.ceil(yRange[0] / yStep) * yStep;
    for (let y = yStart; y <= yRange[1]; y += yStep) {
      const { cy } = mathToCanvas(0, y, padding, xRange, yRange);
      if (cy < 0 || cy > canvasHeight) continue;

      ctx.strokeStyle = gridColor;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(canvasWidth, cy);
      ctx.stroke();

      const subStep = yStep / 5;
      for (
        let sy = y + subStep;
        sy < y + yStep && sy <= yRange[1];
        sy += subStep
      ) {
        const { cy: scy } = mathToCanvas(0, sy, padding, xRange, yRange);
        if (scy < 0 || scy > canvasHeight) continue;
        ctx.strokeStyle = subGridColor;
        ctx.beginPath();
        ctx.moveTo(0, scy);
        ctx.lineTo(canvasWidth, scy);
        ctx.stroke();
      }
    }
  }

  function drawAxes(
    ctx: CanvasRenderingContext2D,
    padding: number,
    xRange: [number, number],
    yRange: [number, number],
    isDark: boolean,
  ): void {
    const axisColor = isDark
      ? "rgba(255,255,255,0.35)"
      : "rgba(0,0,0,0.35)";
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.5;

    // X axis (y=0)
    const { cy: yZero } = mathToCanvas(0, 0, padding, xRange, yRange);
    if (yZero >= 0 && yZero <= canvasHeight) {
      ctx.beginPath();
      ctx.moveTo(0, yZero);
      ctx.lineTo(canvasWidth, yZero);
      ctx.stroke();

      // Arrow
      ctx.fillStyle = axisColor;
      ctx.beginPath();
      ctx.moveTo(canvasWidth - 2, yZero);
      ctx.lineTo(canvasWidth - 10, yZero - 4);
      ctx.lineTo(canvasWidth - 10, yZero + 4);
      ctx.fill();
    }

    // Y axis (x=0)
    const { cx: xZero } = mathToCanvas(0, 0, padding, xRange, yRange);
    if (xZero >= 0 && xZero <= canvasWidth) {
      ctx.beginPath();
      ctx.moveTo(xZero, 0);
      ctx.lineTo(xZero, canvasHeight);
      ctx.stroke();

      // Arrow
      ctx.fillStyle = axisColor;
      ctx.beginPath();
      ctx.moveTo(xZero, 2);
      ctx.lineTo(xZero - 4, 10);
      ctx.lineTo(xZero + 4, 10);
      ctx.fill();
    }
  }

  function drawLabels(
    ctx: CanvasRenderingContext2D,
    padding: number,
    xRange: [number, number],
    yRange: [number, number],
    isDark: boolean,
  ): void {
    const textColor = isDark
      ? "rgba(255,255,255,0.5)"
      : "rgba(0,0,0,0.5)";
    ctx.fillStyle = textColor;
    ctx.font = '11px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const xSpan = xRange[1] - xRange[0];
    const ySpan = yRange[1] - yRange[0];
    const xStep = niceStep(xSpan / 8);
    const yStep = niceStep(ySpan / 8);

    const { cy: yZero } = mathToCanvas(0, 0, padding, xRange, yRange);
    const { cx: xZero } = mathToCanvas(0, 0, padding, xRange, yRange);

    // X axis tick labels
    const xStart = Math.ceil(xRange[0] / xStep) * xStep;
    for (let x = xStart; x <= xRange[1]; x += xStep) {
      if (Math.abs(x) < xStep * 0.01) continue; // skip 0
      const { cx } = mathToCanvas(x, 0, padding, xRange, yRange);
      if (cx < 20 || cx > canvasWidth - 20) continue;

      const labelY = Math.min(
        Math.max(yZero + 6, 4),
        canvasHeight - 16,
      );
      ctx.fillText(formatTickLabel(x), cx, labelY);

      // Tick mark
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const tickY = Math.min(Math.max(yZero, 0), canvasHeight);
      ctx.moveTo(cx, tickY - 3);
      ctx.lineTo(cx, tickY + 3);
      ctx.stroke();
    }

    // Y axis tick labels
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const yLabelStart = Math.ceil(yRange[0] / yStep) * yStep;
    for (let y = yLabelStart; y <= yRange[1]; y += yStep) {
      if (Math.abs(y) < yStep * 0.01) continue;
      const { cy } = mathToCanvas(0, y, padding, xRange, yRange);
      if (cy < 10 || cy > canvasHeight - 10) continue;

      const labelX = Math.min(
        Math.max(xZero - 6, 30),
        canvasWidth - 4,
      );
      ctx.fillText(formatTickLabel(y), labelX, cy);

      ctx.strokeStyle = textColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const tickX = Math.min(Math.max(xZero, 0), canvasWidth);
      ctx.moveTo(tickX - 3, cy);
      ctx.lineTo(tickX + 3, cy);
      ctx.stroke();
    }

    // Origin label
    if (
      xZero > 10 &&
      xZero < canvasWidth - 10 &&
      yZero > 10 &&
      yZero < canvasHeight - 10
    ) {
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("O", xZero - 6, yZero + 6);
    }
  }

  function drawRegion(
    ctx: CanvasRenderingContext2D,
    padding: number,
    xRange: [number, number],
    yRange: [number, number],
    isDark: boolean,
  ): void {
    const region = props.region!;
    if (region.upperProfile.length < 2 || region.lowerProfile.length < 2)
      return;

    ctx.save();

    // Fill the region between upper and lower profiles
    const fillColor = isDark
      ? "rgba(79, 110, 247, 0.15)"
      : "rgba(79, 110, 247, 0.12)";
    ctx.fillStyle = fillColor;

    ctx.beginPath();

    // Trace upper profile left to right
    const firstUpperPt = region.upperProfile[0]!;
    const firstUpper = mathToCanvas(
      firstUpperPt.x,
      firstUpperPt.y,
      padding,
      xRange,
      yRange,
    );
    ctx.moveTo(firstUpper.cx, firstUpper.cy);

    for (let i = 1; i < region.upperProfile.length; i++) {
      const pt = region.upperProfile[i]!;
      const p = mathToCanvas(pt.x, pt.y, padding, xRange, yRange);
      ctx.lineTo(p.cx, p.cy);
    }

    // Trace lower profile right to left
    for (let i = region.lowerProfile.length - 1; i >= 0; i--) {
      const pt = region.lowerProfile[i]!;
      const p = mathToCanvas(pt.x, pt.y, padding, xRange, yRange);
      ctx.lineTo(p.cx, p.cy);
    }

    ctx.closePath();
    ctx.fill();

    // Stroke the boundary with a subtle line
    ctx.strokeStyle = isDark
      ? "rgba(79, 110, 247, 0.3)"
      : "rgba(79, 110, 247, 0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw diagonal hatching inside the region for visual emphasis
    drawHatching(ctx, padding, xRange, yRange, region, isDark);

    ctx.restore();
  }

  function drawHatching(
    ctx: CanvasRenderingContext2D,
    padding: number,
    xRange: [number, number],
    yRange: [number, number],
    region: ComputedRegion,
    isDark: boolean,
  ): void {
    ctx.save();

    // Create clipping path from the region
    ctx.beginPath();
    const hatchFirstUpper = region.upperProfile[0]!;
    const firstUpperH = mathToCanvas(
      hatchFirstUpper.x,
      hatchFirstUpper.y,
      padding,
      xRange,
      yRange,
    );
    ctx.moveTo(firstUpperH.cx, firstUpperH.cy);

    for (let i = 1; i < region.upperProfile.length; i++) {
      const pt = region.upperProfile[i]!;
      const p = mathToCanvas(pt.x, pt.y, padding, xRange, yRange);
      ctx.lineTo(p.cx, p.cy);
    }
    for (let i = region.lowerProfile.length - 1; i >= 0; i--) {
      const pt = region.lowerProfile[i]!;
      const p = mathToCanvas(pt.x, pt.y, padding, xRange, yRange);
      ctx.lineTo(p.cx, p.cy);
    }
    ctx.closePath();
    ctx.clip();

    // Draw hatching lines
    ctx.strokeStyle = isDark
      ? "rgba(79, 110, 247, 0.12)"
      : "rgba(79, 110, 247, 0.1)";
    ctx.lineWidth = 1;
    const spacing = 8;
    const totalDiag = canvasWidth + canvasHeight;

    for (let d = -canvasHeight; d < totalDiag; d += spacing) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + canvasHeight, canvasHeight);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawCurves(
    ctx: CanvasRenderingContext2D,
    padding: number,
    xRange: [number, number],
    yRange: [number, number],
  ): void {
    for (let ci = 0; ci < props.curves.length; ci++) {
      const curve = props.curves[ci]!;
      const color =
        curve.color ?? defaultCurveColors[ci % defaultCurveColors.length]!;

      try {
        const xSampleMin = xRange[0];
        const xSampleMax = xRange[1];
        const pts = sampleCurve(curve, xSampleMin, xSampleMax, 500);

        if (pts.length < 2) continue;

        ctx.save();
        ctx.strokeStyle = color!;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        // Handle vertical lines
        if (curve.type === "x_const") {
          const xVal = evalConst(curve.expression);
          if (!isFinite(xVal)) continue;

          ctx.setLineDash([6, 4]);
          ctx.lineWidth = 2;
          const { cx } = mathToCanvas(xVal, 0, padding, xRange, yRange);
          ctx.beginPath();
          ctx.moveTo(cx, 0);
          ctx.lineTo(cx, canvasHeight);
          ctx.stroke();
          ctx.setLineDash([]);

          // Label
          ctx.fillStyle = color!;
          ctx.font =
            'bold 12px -apple-system, "Segoe UI", Roboto, sans-serif';
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText(
            curve!.equation || `x = ${curve!.expression}`,
            cx + 6,
            12,
          );
        } else if (curve.type === "y_const") {
          const yVal = evalConst(curve!.expression);
          if (!isFinite(yVal)) continue;

          ctx.setLineDash([6, 4]);
          ctx.lineWidth = 2;
          const { cy } = mathToCanvas(0, yVal, padding, xRange, yRange);
          ctx.beginPath();
          ctx.moveTo(0, cy);
          ctx.lineTo(canvasWidth, cy);
          ctx.stroke();
          ctx.setLineDash([]);

          // Label
          ctx.fillStyle = color!;
          ctx.font =
            'bold 12px -apple-system, "Segoe UI", Roboto, sans-serif';
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";
          ctx.fillText(
            curve!.equation || `y = ${curve!.expression}`,
            12,
            cy - 6,
          );
        } else {
          // Regular curve — draw connected segments
          ctx.beginPath();
          let started = false;
          let prevPt: { cx: number; cy: number } | null = null;

          for (const p of pts) {
            if (!isFinite(p.y) || Math.abs(p.y) > 1e6) {
              started = false;
              prevPt = null;
              continue;
            }

            const cp = mathToCanvas(p.x, p.y, padding, xRange, yRange);

            // Detect large jumps (discontinuities)
            if (
              prevPt &&
              Math.abs(cp.cy - prevPt.cy) > canvasHeight * 0.8
            ) {
              ctx.stroke();
              ctx.beginPath();
              started = false;
            }

            if (!started) {
              ctx.moveTo(cp.cx, cp.cy);
              started = true;
            } else {
              ctx.lineTo(cp.cx, cp.cy);
            }
            prevPt = cp;
          }
          ctx.stroke();

          // Curve label near the right side
          const labelIdx = Math.min(
            Math.floor(pts.length * 0.75),
            pts.length - 1,
          );
          const labelPt = pts[labelIdx];
          if (labelPt && isFinite(labelPt.y)) {
            const lp = mathToCanvas(
              labelPt.x,
              labelPt.y,
              padding,
              xRange,
              yRange,
            );
            if (
              lp.cx > 20 &&
              lp.cx < canvasWidth - 20 &&
              lp.cy > 20 &&
              lp.cy < canvasHeight - 20
            ) {
              ctx.fillStyle = color!;
              ctx.font =
                'bold 12px -apple-system, "Segoe UI", Roboto, sans-serif';
              ctx.textAlign = "left";
              ctx.textBaseline = "bottom";

              const label =
                curve!.equation ||
                (curve!.type === "y_of_x"
                  ? "y = "
                  : curve!.type === "x_of_y"
                    ? "x = "
                    : "") + curve!.expression;
              ctx.fillText(label, lp.cx + 6, lp.cy - 6);
            }
          }
        }

        ctx.restore();
      } catch {
        // Skip invalid curves
      }
    }
  }

  function drawRevolutionAxis(
    ctx: CanvasRenderingContext2D,
    padding: number,
    xRange: [number, number],
    yRange: [number, number],
  ): void {
    ctx.save();

    ctx.strokeStyle = "#ff6b6b";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.globalAlpha = 0.7;

    if (props.axis === "x") {
      // Horizontal axis at y = axisValue
      const { cy } = mathToCanvas(
        0,
        props.axisValue,
        padding,
        xRange,
        yRange,
      );
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(canvasWidth, cy);
      ctx.stroke();

      // Label
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ff6b6b";
      ctx.font =
        'bold 11px -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      const label =
        props.axisValue === 0
          ? "rotation axis (x-axis)"
          : `rotation axis (y = ${props.axisValue})`;
      ctx.fillText(label, canvasWidth - 8, cy - 4);
    } else {
      // Vertical axis at x = axisValue
      const { cx } = mathToCanvas(
        props.axisValue,
        0,
        padding,
        xRange,
        yRange,
      );
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, canvasHeight);
      ctx.stroke();

      // Label
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ff6b6b";
      ctx.font =
        'bold 11px -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const label =
        props.axisValue === 0
          ? "rotation axis (y-axis)"
          : `rotation axis (x = ${props.axisValue})`;
      ctx.fillText(label, cx + 6, 12);
    }

    // Draw a small rotation arrow icon near the axis
    drawRotationIcon(ctx, padding, xRange, yRange);

    ctx.restore();
  }

  function drawRotationIcon(
    ctx: CanvasRenderingContext2D,
    padding: number,
    xRange: [number, number],
    yRange: [number, number],
  ): void {
    let cx: number, cy: number;

    if (props.axis === "x") {
      const mid = (props.xMin + props.xMax) / 2;
      const converted = mathToCanvas(
        mid,
        props.axisValue,
        padding,
        xRange,
        yRange,
      );
      cx = converted.cx;
      cy = converted.cy;
    } else {
      const midY = 0;
      const converted = mathToCanvas(
        props.axisValue,
        midY,
        padding,
        xRange,
        yRange,
      );
      cx = converted.cx;
      cy = converted.cy;
    }

    // Draw a circular arc arrow
    ctx.save();
    ctx.strokeStyle = "#ff6b6b";
    ctx.fillStyle = "#ff6b6b";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.6;

    const r = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI * 0.8, Math.PI * 0.5, false);
    ctx.stroke();

    // Arrowhead
    const arrowAngle = Math.PI * 0.5;
    const ax = cx + r * Math.cos(arrowAngle);
    const ay = cy + r * Math.sin(arrowAngle);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + 5, ay - 3);
    ctx.lineTo(ax + 2, ay + 4);
    ctx.fill();

    ctx.restore();
  }

  // ===== Helper functions =====

  function niceStep(rawStep: number): number {
    if (rawStep <= 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const residual = rawStep / magnitude;

    if (residual <= 1.5) return magnitude;
    if (residual <= 3.5) return 2 * magnitude;
    if (residual <= 7.5) return 5 * magnitude;
    return 10 * magnitude;
  }

  function formatTickLabel(value: number): string {
    if (Math.abs(value) < 1e-10) return "0";
    if (
      Math.abs(value) >= 1000 ||
      (Math.abs(value) < 0.01 && Math.abs(value) > 0)
    ) {
      return value.toExponential(1);
    }
    // Remove trailing zeros
    const s = value.toPrecision(4);
    return parseFloat(s).toString();
  }

  // ===== Mouse/touch interaction =====

  function onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }

  function onMouseMove(e: MouseEvent): void {
    if (!isDragging) return;

    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    viewOffsetX += dx;
    viewOffsetY += dy;
    draw();
  }

  function onMouseUp(): void {
    isDragging = false;
  }

  function onWheel(e: WheelEvent): void {
    const zoomFactor = 1.1;
    const oldScale = viewScale;

    if (e.deltaY < 0) {
      viewScale = Math.min(8, oldScale * zoomFactor);
    } else {
      viewScale = Math.max(0.2, oldScale / zoomFactor);
    }

    // Only consume the event when zoom actually changed;
    // at the limits let the wheel event propagate so the page can scroll.
    if (viewScale !== oldScale) {
      e.preventDefault();
      draw();
    }
  }

  function onTouchStart(e: TouchEvent): void {
    if (e.touches.length === 1) {
      const touch = e.touches[0]!;
      lastTouchCenter = { x: touch.clientX, y: touch.clientY };
    } else if (e.touches.length >= 2) {
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      pinchStartDistance = Math.hypot(dx, dy);
      pinchStartScale = viewScale;
      lastTouchCenter = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
    }
  }

  function onTouchMove(e: TouchEvent): void {
    if (e.touches.length === 1 && lastTouchCenter) {
      const touch = e.touches[0]!;
      const dx = touch.clientX - lastTouchCenter.x;
      const dy = touch.clientY - lastTouchCenter.y;
      lastTouchCenter = { x: touch.clientX, y: touch.clientY };

      viewOffsetX += dx;
      viewOffsetY += dy;
      draw();
      return;
    }

    if (e.touches.length >= 2) {
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy);

      if (pinchStartDistance > 0) {
        const rawScale = pinchStartScale * (dist / pinchStartDistance);
        viewScale = Math.min(8, Math.max(0.2, rawScale));
        draw();
      }

      lastTouchCenter = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
    }
  }

  function onTouchEnd(e: TouchEvent): void {
    if (e.touches.length === 0) {
      lastTouchCenter = null;
      pinchStartDistance = 0;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0]!;
      lastTouchCenter = { x: touch.clientX, y: touch.clientY };
      pinchStartDistance = 0;
      pinchStartScale = viewScale;
    }
  }

  function resetView(): void {
    viewOffsetX = 0;
    viewOffsetY = 0;
    viewScale = 1;
    draw();
  }

  // ===== Sizing =====

  function updateCanvasSize(): void {
    canvasWidth = containerRef.clientWidth;
    canvasHeight = Math.max(containerRef.clientHeight, 300);
    canvasEl.style.width = canvasWidth + "px";
    canvasEl.style.height = canvasHeight + "px";
    draw();
  }

  // ===== Event bindings =====

  canvasEl.addEventListener("mousedown", onMouseDown);
  canvasEl.addEventListener("wheel", onWheel, { passive: false });
  canvasEl.addEventListener("touchstart", onTouchStart, { passive: true });
  canvasEl.addEventListener("touchmove", onTouchMove, { passive: true });
  canvasEl.addEventListener("touchend", onTouchEnd, { passive: true });
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  // ResizeObserver
  let resizeObserver: ResizeObserver | null = new ResizeObserver(() => {
    updateCanvasSize();
  });
  resizeObserver.observe(containerRef);

  // Initial sizing
  // Use rAF to ensure the container has been laid out
  requestAnimationFrame(() => {
    updateCanvasSize();
    draw();
  });

  // ===== Theme observer =====

  const themeObserver = new MutationObserver(() => {
    draw();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  // ===== Public API =====

  function update(newProps: Canvas2DProps): void {
    props = { ...newProps };
    // Reset view when input changes
    viewOffsetX = 0;
    viewOffsetY = 0;
    viewScale = 1;
    draw();
  }

  function destroy(): void {
    canvasEl.removeEventListener("mousedown", onMouseDown);
    canvasEl.removeEventListener("wheel", onWheel);
    canvasEl.removeEventListener("touchstart", onTouchStart);
    canvasEl.removeEventListener("touchmove", onTouchMove);
    canvasEl.removeEventListener("touchend", onTouchEnd);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);

    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    themeObserver.disconnect();

    if (containerRef.parentNode) {
      containerRef.parentNode.removeChild(containerRef);
    }
  }

  return {
    resetView,
    draw,
    destroy,
    update,
  };
}
