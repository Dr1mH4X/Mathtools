<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import type { CurveDefinition, ComputedRegion } from "@/utils/mathEngine";
import { sampleCurve } from "@/utils/mathEngine";

const props = defineProps<{
    curves: CurveDefinition[];
    region: ComputedRegion | null;
    xMin: number;
    xMax: number;
    axis: "x" | "y";
    axisValue: number;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const canvasWidth = ref(600);
const canvasHeight = ref(400);

// View transform state
const viewOffset = ref({ x: 0, y: 0 });
const viewScale = ref(1);

// Interaction state (pan only; wheel zoom remains disabled)
const isDragging = ref(false);
const lastMousePos = ref({ x: 0, y: 0 });

let pinchStartDistance = 0;
let pinchStartScale = 1;
let lastTouchCenter: { x: number; y: number } | null = null;

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

// Coordinate transform: math coords -> canvas pixel coords
function mathToCanvas(
    mx: number,
    my: number,
    padding: number,
    xRange: [number, number],
    yRange: [number, number],
): { cx: number; cy: number } {
    const drawW = canvasWidth.value - padding * 2;
    const drawH = canvasHeight.value - padding * 2;

    const xSpan = xRange[1] - xRange[0] || 1;
    const ySpan = yRange[1] - yRange[0] || 1;

    // Maintain aspect ratio
    const scaleX = drawW / xSpan;
    const scaleY = drawH / ySpan;
    const scale = Math.min(scaleX, scaleY) * viewScale.value;

    const centerX = (xRange[0] + xRange[1]) / 2;
    const centerY = (yRange[0] + yRange[1]) / 2;

    const cx =
        canvasWidth.value / 2 + (mx - centerX) * scale + viewOffset.value.x;
    const cy =
        canvasHeight.value / 2 - (my - centerY) * scale + viewOffset.value.y;

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

function draw() {
    const canvas = canvasRef.value;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth.value * dpr;
    canvas.height = canvasHeight.value * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    const isDark =
        document.documentElement.getAttribute("data-theme") === "dark";
    ctx.fillStyle = isDark ? "#1e2030" : "#ffffff";
    ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value);

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
) {
    const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    const subGridColor = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)";

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
        if (cx < 0 || cx > canvasWidth.value) continue;

        ctx.strokeStyle = gridColor;
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, canvasHeight.value);
        ctx.stroke();

        // Sub-grid
        const subStep = xStep / 5;
        for (
            let sx = x + subStep;
            sx < x + xStep && sx <= xRange[1];
            sx += subStep
        ) {
            const { cx: scx } = mathToCanvas(sx, 0, padding, xRange, yRange);
            if (scx < 0 || scx > canvasWidth.value) continue;
            ctx.strokeStyle = subGridColor;
            ctx.beginPath();
            ctx.moveTo(scx, 0);
            ctx.lineTo(scx, canvasHeight.value);
            ctx.stroke();
        }
    }

    // Horizontal grid lines
    const yStart = Math.ceil(yRange[0] / yStep) * yStep;
    for (let y = yStart; y <= yRange[1]; y += yStep) {
        const { cy } = mathToCanvas(0, y, padding, xRange, yRange);
        if (cy < 0 || cy > canvasHeight.value) continue;

        ctx.strokeStyle = gridColor;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(canvasWidth.value, cy);
        ctx.stroke();

        const subStep = yStep / 5;
        for (
            let sy = y + subStep;
            sy < y + yStep && sy <= yRange[1];
            sy += subStep
        ) {
            const { cy: scy } = mathToCanvas(0, sy, padding, xRange, yRange);
            if (scy < 0 || scy > canvasHeight.value) continue;
            ctx.strokeStyle = subGridColor;
            ctx.beginPath();
            ctx.moveTo(0, scy);
            ctx.lineTo(canvasWidth.value, scy);
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
) {
    const axisColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.5;

    // X axis (y=0)
    const { cy: yZero } = mathToCanvas(0, 0, padding, xRange, yRange);
    if (yZero >= 0 && yZero <= canvasHeight.value) {
        ctx.beginPath();
        ctx.moveTo(0, yZero);
        ctx.lineTo(canvasWidth.value, yZero);
        ctx.stroke();

        // Arrow
        ctx.fillStyle = axisColor;
        ctx.beginPath();
        ctx.moveTo(canvasWidth.value - 2, yZero);
        ctx.lineTo(canvasWidth.value - 10, yZero - 4);
        ctx.lineTo(canvasWidth.value - 10, yZero + 4);
        ctx.fill();
    }

    // Y axis (x=0)
    const { cx: xZero } = mathToCanvas(0, 0, padding, xRange, yRange);
    if (xZero >= 0 && xZero <= canvasWidth.value) {
        ctx.beginPath();
        ctx.moveTo(xZero, 0);
        ctx.lineTo(xZero, canvasHeight.value);
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
) {
    const textColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
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
        if (cx < 20 || cx > canvasWidth.value - 20) continue;

        const labelY = Math.min(
            Math.max(yZero + 6, 4),
            canvasHeight.value - 16,
        );
        ctx.fillText(formatTickLabel(x), cx, labelY);

        // Tick mark
        ctx.strokeStyle = textColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const tickY = Math.min(Math.max(yZero, 0), canvasHeight.value);
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
        if (cy < 10 || cy > canvasHeight.value - 10) continue;

        const labelX = Math.min(Math.max(xZero - 6, 30), canvasWidth.value - 4);
        ctx.fillText(formatTickLabel(y), labelX, cy);

        ctx.strokeStyle = textColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const tickX = Math.min(Math.max(xZero, 0), canvasWidth.value);
        ctx.moveTo(tickX - 3, cy);
        ctx.lineTo(tickX + 3, cy);
        ctx.stroke();
    }

    // Origin label
    if (
        xZero > 10 &&
        xZero < canvasWidth.value - 10 &&
        yZero > 10 &&
        yZero < canvasHeight.value - 10
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
) {
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
) {
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
    const totalDiag = canvasWidth.value + canvasHeight.value;

    for (let d = -canvasHeight.value; d < totalDiag; d += spacing) {
        ctx.beginPath();
        ctx.moveTo(d, 0);
        ctx.lineTo(d + canvasHeight.value, canvasHeight.value);
        ctx.stroke();
    }

    ctx.restore();
}

function drawCurves(
    ctx: CanvasRenderingContext2D,
    padding: number,
    xRange: [number, number],
    yRange: [number, number],
) {
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
                const xVal = parseFloat(curve.expression);
                if (!isFinite(xVal)) continue;

                ctx.setLineDash([6, 4]);
                ctx.lineWidth = 2;
                const { cx } = mathToCanvas(xVal, 0, padding, xRange, yRange);
                ctx.beginPath();
                ctx.moveTo(cx, 0);
                ctx.lineTo(cx, canvasHeight.value);
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
                const yVal = parseFloat(curve!.expression);
                if (!isFinite(yVal)) continue;

                ctx.setLineDash([6, 4]);
                ctx.lineWidth = 2;
                const { cy } = mathToCanvas(0, yVal, padding, xRange, yRange);
                ctx.beginPath();
                ctx.moveTo(0, cy);
                ctx.lineTo(canvasWidth.value, cy);
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
                        Math.abs(cp.cy - prevPt.cy) > canvasHeight.value * 0.8
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
                        lp.cx < canvasWidth.value - 20 &&
                        lp.cy > 20 &&
                        lp.cy < canvasHeight.value - 20
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
) {
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
        ctx.lineTo(canvasWidth.value, cy);
        ctx.stroke();

        // Label
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ff6b6b";
        ctx.font = 'bold 11px -apple-system, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        const label =
            props.axisValue === 0
                ? "rotation axis (x-axis)"
                : `rotation axis (y = ${props.axisValue})`;
        ctx.fillText(label, canvasWidth.value - 8, cy - 4);
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
        ctx.lineTo(cx, canvasHeight.value);
        ctx.stroke();

        // Label
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ff6b6b";
        ctx.font = 'bold 11px -apple-system, "Segoe UI", Roboto, sans-serif';
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
) {
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

function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    isDragging.value = true;
    lastMousePos.value = { x: e.clientX, y: e.clientY };
}

function onMouseMove(e: MouseEvent) {
    if (!isDragging.value) return;

    const dx = e.clientX - lastMousePos.value.x;
    const dy = e.clientY - lastMousePos.value.y;
    lastMousePos.value = { x: e.clientX, y: e.clientY };

    viewOffset.value = {
        x: viewOffset.value.x + dx,
        y: viewOffset.value.y + dy,
    };
    draw();
}

function onMouseUp() {
    isDragging.value = false;
}

function onWheel(e: WheelEvent) {
    const zoomFactor = 1.1;
    const oldScale = viewScale.value;

    if (e.deltaY < 0) {
        viewScale.value = Math.min(8, oldScale * zoomFactor);
    } else {
        viewScale.value = Math.max(0.2, oldScale / zoomFactor);
    }

    // Only consume the event when zoom actually changed;
    // at the limits let the wheel event propagate so the page can scroll.
    if (viewScale.value !== oldScale) {
        e.preventDefault();
        draw();
    }
}

function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
        const t = e.touches[0]!;
        lastTouchCenter = { x: t.clientX, y: t.clientY };
    } else if (e.touches.length >= 2) {
        const t1 = e.touches[0]!;
        const t2 = e.touches[1]!;
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        pinchStartDistance = Math.hypot(dx, dy);
        pinchStartScale = viewScale.value;
        lastTouchCenter = {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2,
        };
    }
}

function onTouchMove(e: TouchEvent) {
    if (e.touches.length === 1 && lastTouchCenter) {
        const t = e.touches[0]!;
        const dx = t.clientX - lastTouchCenter.x;
        const dy = t.clientY - lastTouchCenter.y;
        lastTouchCenter = { x: t.clientX, y: t.clientY };

        viewOffset.value = {
            x: viewOffset.value.x + dx,
            y: viewOffset.value.y + dy,
        };
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
            viewScale.value = Math.min(8, Math.max(0.2, rawScale));
            draw();
        }

        lastTouchCenter = {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2,
        };
    }
}

function onTouchEnd(e: TouchEvent) {
    if (e.touches.length === 0) {
        lastTouchCenter = null;
        pinchStartDistance = 0;
    } else if (e.touches.length === 1) {
        const t = e.touches[0]!;
        lastTouchCenter = { x: t.clientX, y: t.clientY };
        pinchStartDistance = 0;
        pinchStartScale = viewScale.value;
    }
}

function resetView() {
    viewOffset.value = { x: 0, y: 0 };
    viewScale.value = 1;
    draw();
}

// ===== Lifecycle & Watchers =====

function updateCanvasSize() {
    const container = containerRef.value;
    if (!container) return;
    canvasWidth.value = container.clientWidth;
    canvasHeight.value = Math.max(container.clientHeight, 300);
    draw();
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
    updateCanvasSize();
    draw();

    if (containerRef.value) {
        resizeObserver = new ResizeObserver(() => {
            updateCanvasSize();
        });
        resizeObserver.observe(containerRef.value);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
});

onUnmounted(() => {
    if (resizeObserver) {
        resizeObserver.disconnect();
    }
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
});

watch(
    () => [
        props.curves,
        props.region,
        props.xMin,
        props.xMax,
        props.axis,
        props.axisValue,
    ],
    () => {
        // Reset view when input changes
        viewOffset.value = { x: 0, y: 0 };
        viewScale.value = 1;
        draw();
    },
    { deep: true },
);

// Watch theme changes
const themeObserver = ref<MutationObserver | null>(null);
onMounted(() => {
    themeObserver.value = new MutationObserver(() => {
        draw();
    });
    themeObserver.value.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
    });
});
onUnmounted(() => {
    themeObserver.value?.disconnect();
});

defineExpose({ resetView, draw });
</script>

<template>
    <div
        ref="containerRef"
        class="relative w-full h-full min-h-[300px] overflow-hidden rounded-md bg-bg-card"
    >
        <canvas
            ref="canvasRef"
            class="block cursor-grab active:cursor-grabbing"
            style="touch-action: pan-x pan-y pinch-zoom"
            :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px' }"
            @mousedown="onMouseDown"
            @wheel="onWheel"
            @touchstart.passive="onTouchStart"
            @touchmove.passive="onTouchMove"
            @touchend.passive="onTouchEnd"
        />
        <div class="absolute top-2.5 right-2.5 flex flex-col gap-1 z-[5]">
            <button
                class="canvas-ctrl-btn"
                title="Reset view"
                @click="resetView"
            >
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path
                        d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                    />
                    <path d="M3 3v5h5" />
                </svg>
            </button>
            <button
                class="canvas-ctrl-btn"
                title="Zoom in"
                @click="
                    viewScale *= 1.2;
                    draw();
                "
            >
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
            </button>
            <button
                class="canvas-ctrl-btn"
                title="Zoom out"
                @click="
                    viewScale *= 0.8;
                    draw();
                "
            >
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
            </button>
        </div>
    </div>
</template>

<style scoped>
@reference "../../style.css";

.canvas-ctrl-btn {
    @apply w-[30px] h-[30px] p-0 flex items-center justify-center
         bg-bg-soft border border-border rounded-sm
         opacity-75 cursor-pointer transition-opacity duration-150 ease-in-out;
}
.canvas-ctrl-btn:hover {
    @apply opacity-100;
}
</style>
