import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ComputedRegion, RotationAxis } from "@/utils/mathEngine";
import { generateRevolutionGeometry } from "@/utils/mathEngine";

export interface ThreeSceneOptions {
  antialias?: boolean;
  alpha?: boolean;
}

export interface DisplayOptions {
  mode: "solid" | "wireframe" | "transparent";
  opacity: number;
  color: string;
  showAxes: boolean;
  showGrid: boolean;
  showCrossSection: boolean;
  animate: boolean;
  angleExtent: number; // 0 to 2π — for animation
  resolution: number; // angular segments
}

export const defaultDisplayOptions: DisplayOptions = {
  mode: "solid",
  opacity: 0.85,
  color: "#4f6ef7",
  showAxes: true,
  showGrid: true,
  showCrossSection: true,
  animate: false,
  angleExtent: Math.PI * 2,
  resolution: 64,
};

export function useThreeScene(
  getContainer: () => HTMLElement | null,
  options: ThreeSceneOptions = {},
) {
  let isReady = false;
  let isAnimating = false;

  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let animFrameId: number | null = null;

  let solidMesh: THREE.Mesh | null = null;
  let wireframeMesh: THREE.LineSegments | null = null;
  let crossSectionGroup: THREE.Group | null = null;
  let axesHelper: THREE.Group | null = null;
  let gridHelper: THREE.GridHelper | null = null;

  let currentRegion: ComputedRegion | null = null;
  let currentAxis: RotationAxis = "x";
  let currentAxisValue = 0;
  let currentDisplay: DisplayOptions = { ...defaultDisplayOptions };
  let currentCurveColors: [string, string] = ["#4f6ef7", "#e74c8b"];

  // Animation state
  let animationStartTime = 0;
  let animationDuration = 2000; // ms for full rotation

  function getIsReady(): boolean {
    return isReady;
  }

  function getIsAnimating(): boolean {
    return isAnimating;
  }

  function init() {
    const container = getContainer();
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Renderer
    renderer = new THREE.WebGLRenderer({
      antialias: options.antialias ?? true,
      alpha: options.alpha ?? true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // Scene
    scene = new THREE.Scene();

    // Camera
    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(5, 4, 6);
    camera.lookAt(0, 0, 0);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.0;
    controls.panSpeed = 0.8;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.minDistance = 1;
    controls.maxDistance = 100;
    controls.target.set(0, 0, 0);
    controls.update();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(5, 8, 5);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-3, -2, -4);
    scene.add(dirLight2);

    const hemisphereLight = new THREE.HemisphereLight(0xb1e1ff, 0xb97a20, 0.25);
    scene.add(hemisphereLight);

    // Default axes and grid
    setupAxes();
    setupGrid();

    isReady = true;
    startRenderLoop();

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    // Store for cleanup
    (container as any).__resizeObserver = resizeObserver;
  }

  function handleResize() {
    const container = getContainer();
    if (!container || !renderer || !camera) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    if (width === 0 || height === 0) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function startRenderLoop() {
    const render = () => {
      animFrameId = requestAnimationFrame(render);

      if (!renderer || !scene || !camera || !controls) return;

      // Handle rotation animation
      if (isAnimating && currentRegion) {
        const elapsed = performance.now() - animationStartTime;
        const progress = Math.min(elapsed / animationDuration, 1);
        const easedProgress = easeInOutCubic(progress);
        const angle = easedProgress * Math.PI * 2;

        updateSolidAngle(angle);

        if (progress >= 1) {
          isAnimating = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    render();
  }

  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ===== Axes Helper =====

  function setupAxes() {
    if (!scene) return;

    if (axesHelper) {
      scene.remove(axesHelper);
      disposeGroup(axesHelper);
    }

    axesHelper = new THREE.Group();
    axesHelper.name = "axesHelper";

    const axisLength = 8;
    const axisColors = [0xe74c3c, 0x2ecc71, 0x3498db]; // R, G, B for X, Y, Z
    const axisLabels = ["X", "Y", "Z"];
    const directions = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ];

    for (let i = 0; i < 3; i++) {
      const dir = directions[i]!;
      const axColor = axisColors[i]!;
      const axLabel = axisLabels[i]!;

      // Line
      const material = new THREE.LineBasicMaterial({
        color: axColor,
        linewidth: 2,
        transparent: true,
        opacity: 0.7,
      });
      const geometry = new THREE.BufferGeometry().setFromPoints([
        dir.clone().multiplyScalar(-axisLength),
        dir.clone().multiplyScalar(axisLength),
      ]);
      const line = new THREE.Line(geometry, material);
      axesHelper.add(line);

      // Arrowhead
      const arrowGeo = new THREE.ConeGeometry(0.06, 0.2, 8);
      const arrowMat = new THREE.MeshBasicMaterial({
        color: axColor,
        transparent: true,
        opacity: 0.7,
      });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.position.copy(dir.clone().multiplyScalar(axisLength));
      // Orient the cone
      if (i === 0) arrow.rotation.z = -Math.PI / 2;
      else if (i === 2) arrow.rotation.x = Math.PI / 2;
      axesHelper.add(arrow);

      // Label sprite
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `#${axColor.toString(16).padStart(6, "0")}`;
      ctx.fillText(axLabel, 32, 32);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.copy(dir.clone().multiplyScalar(axisLength + 0.4));
      sprite.scale.set(0.5, 0.5, 1);
      axesHelper.add(sprite);
    }

    // Tick marks on axes
    for (let i = 0; i < 3; i++) {
      const dir = directions[i]!;
      const axColor = axisColors[i]!;
      for (let v = -Math.floor(axisLength); v <= Math.floor(axisLength); v++) {
        if (v === 0) continue;
        const tickSize = 0.05;
        const tickGeo = new THREE.BufferGeometry();
        const p = dir.clone().multiplyScalar(v);

        // Pick a perpendicular direction for the tick
        const perpIdx = (i + 1) % 3;
        const perp = directions[perpIdx]!.clone().multiplyScalar(tickSize);

        tickGeo.setFromPoints([p.clone().sub(perp), p.clone().add(perp)]);
        const tickMat = new THREE.LineBasicMaterial({
          color: axColor,
          transparent: true,
          opacity: 0.35,
        });
        axesHelper.add(new THREE.Line(tickGeo, tickMat));
      }
    }

    axesHelper.visible = currentDisplay.showAxes;
    scene.add(axesHelper);
  }

  function setupGrid() {
    if (!scene) return;

    if (gridHelper) {
      scene.remove(gridHelper);
      gridHelper.geometry.dispose();
      (gridHelper.material as THREE.Material).dispose();
    }

    gridHelper = new THREE.GridHelper(16, 32, 0x888888, 0x444444);
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.15;
    gridHelper.visible = currentDisplay.showGrid;
    scene.add(gridHelper);
  }

  // ===== Solid Mesh =====

  function buildSolid(
    region: ComputedRegion,
    axis: RotationAxis,
    axisValue: number,
    display: DisplayOptions,
    angleExtent?: number,
    curveColors?: [string, string],
  ) {
    if (!scene) return;

    clearSolid();

    currentRegion = region;
    currentAxis = axis;
    currentAxisValue = axisValue;
    currentDisplay = { ...display };
    if (curveColors) currentCurveColors = curveColors;

    const extent = angleExtent ?? display.angleExtent;
    const angularSegments = display.resolution;

    const { positions, indices, normals, colors } = generateRevolutionGeometry(
      region,
      axis,
      axisValue,
      angularSegments,
      extent,
      currentCurveColors[0],
      currentCurveColors[1],
    );

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingSphere();

    // Solid mesh — use per-vertex colours from the 2D curve colours
    const solidMaterial = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: display.mode === "transparent",
      opacity: display.mode === "transparent" ? display.opacity : 1.0,
      roughness: 0.4,
      metalness: 0.05,
      clearcoat: 0.1,
      depthWrite: display.mode !== "transparent",
    });

    solidMesh = new THREE.Mesh(geometry, solidMaterial);
    solidMesh.visible = display.mode !== "wireframe";
    scene.add(solidMesh);

    // Wireframe overlay
    const wireGeo = new THREE.WireframeGeometry(geometry);
    const wireColor =
      display.mode === "wireframe"
        ? new THREE.Color(display.color)
        : new THREE.Color(0x000000);
    const wireMat = new THREE.LineBasicMaterial({
      color: wireColor,
      transparent: true,
      opacity: display.mode === "wireframe" ? 0.9 : 0.08,
      linewidth: 1,
    });
    wireframeMesh = new THREE.LineSegments(wireGeo, wireMat);
    scene.add(wireframeMesh);

    // Cross-section highlight
    if (display.showCrossSection) {
      buildCrossSection(
        region,
        axis,
        axisValue,
        display.color,
        currentCurveColors,
      );
    }

    // Auto-fit camera
    fitCamera(geometry);

    // Update axes/grid visibility
    if (axesHelper) axesHelper.visible = display.showAxes;
    if (gridHelper) gridHelper.visible = display.showGrid;
  }

  function updateSolidAngle(angle: number) {
    if (!scene || !currentRegion) return;

    // Rebuild geometry with new angle extent
    clearSolid();

    const { positions, indices, normals, colors } = generateRevolutionGeometry(
      currentRegion,
      currentAxis,
      currentAxisValue,
      currentDisplay.resolution,
      angle,
      currentCurveColors[0],
      currentCurveColors[1],
    );

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    const solidMaterial = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: currentDisplay.mode === "transparent",
      opacity:
        currentDisplay.mode === "transparent" ? currentDisplay.opacity : 1.0,
      roughness: 0.4,
      metalness: 0.05,
      clearcoat: 0.1,
      depthWrite: currentDisplay.mode !== "transparent",
    });

    solidMesh = new THREE.Mesh(geometry, solidMaterial);
    solidMesh.visible = currentDisplay.mode !== "wireframe";
    scene.add(solidMesh);

    const wireGeo = new THREE.WireframeGeometry(geometry);
    const wireColor =
      currentDisplay.mode === "wireframe"
        ? new THREE.Color(currentDisplay.color)
        : new THREE.Color(0x000000);
    const wireMat = new THREE.LineBasicMaterial({
      color: wireColor,
      transparent: true,
      opacity: currentDisplay.mode === "wireframe" ? 0.9 : 0.08,
      linewidth: 1,
    });
    wireframeMesh = new THREE.LineSegments(wireGeo, wireMat);
    scene.add(wireframeMesh);

    if (currentDisplay.showCrossSection) {
      buildCrossSection(
        currentRegion,
        currentAxis,
        currentAxisValue,
        currentDisplay.color,
        currentCurveColors,
      );
    }
  }

  function buildCrossSection(
    region: ComputedRegion,
    axis: RotationAxis,
    axisValue: number,
    _color: string,
    curveColors?: [string, string],
  ) {
    if (!scene) return;

    if (crossSectionGroup) {
      scene.remove(crossSectionGroup);
      disposeGroup(crossSectionGroup);
    }

    crossSectionGroup = new THREE.Group();
    crossSectionGroup.name = "crossSection";

    // Per-curve cross-section colours (fall back to legacy single colour)
    const upperCsColor = new THREE.Color(curveColors ? curveColors[0] : _color);
    const lowerCsColor = new THREE.Color(curveColors ? curveColors[1] : _color);

    // Draw the 2D profile in 3D space
    const upperPts: THREE.Vector3[] = [];
    const lowerPts: THREE.Vector3[] = [];

    for (const p of region.upperProfile) {
      if (axis === "x") {
        upperPts.push(new THREE.Vector3(p.x, p.y, 0));
      } else {
        upperPts.push(new THREE.Vector3(p.x, p.y, 0));
      }
    }

    for (const p of region.lowerProfile) {
      if (axis === "x") {
        lowerPts.push(new THREE.Vector3(p.x, p.y, 0));
      } else {
        lowerPts.push(new THREE.Vector3(p.x, p.y, 0));
      }
    }

    // Upper curve — uses upper curve's colour
    if (upperPts.length > 1) {
      const upperGeo = new THREE.BufferGeometry().setFromPoints(upperPts);
      const upperLine = new THREE.Line(
        upperGeo,
        new THREE.LineBasicMaterial({
          color: upperCsColor,
          linewidth: 2,
          transparent: true,
          opacity: 0.9,
        }),
      );
      crossSectionGroup.add(upperLine);
    }

    // Lower curve — uses lower curve's colour
    if (lowerPts.length > 1) {
      const lowerGeo = new THREE.BufferGeometry().setFromPoints(lowerPts);
      const lowerLine = new THREE.Line(
        lowerGeo,
        new THREE.LineBasicMaterial({
          color: lowerCsColor,
          linewidth: 2,
          transparent: true,
          opacity: 0.9,
        }),
      );
      crossSectionGroup.add(lowerLine);
    }

    // Filled region (semi-transparent, blend of both curve colours)
    if (upperPts.length > 1 && lowerPts.length > 1) {
      const shape = new THREE.Shape();
      // Trace upper from left to right
      shape.moveTo(upperPts[0]!.x, upperPts[0]!.y);
      for (let i = 1; i < upperPts.length; i++) {
        shape.lineTo(upperPts[i]!.x, upperPts[i]!.y);
      }
      // Trace lower from right to left
      for (let i = lowerPts.length - 1; i >= 0; i--) {
        shape.lineTo(lowerPts[i]!.x, lowerPts[i]!.y);
      }
      shape.closePath();

      // Use a blend of both curve colours for the filled region
      const blendColor = upperCsColor.clone().lerp(lowerCsColor, 0.5);
      const shapeGeo = new THREE.ShapeGeometry(shape, 1);
      const shapeMat = new THREE.MeshBasicMaterial({
        color: blendColor,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const shapeMesh = new THREE.Mesh(shapeGeo, shapeMat);
      crossSectionGroup.add(shapeMesh);
    }

    // Axis line highlight
    const axisLineMat = new THREE.LineDashedMaterial({
      color: 0xff6b6b,
      dashSize: 0.15,
      gapSize: 0.1,
      transparent: true,
      opacity: 0.6,
    });

    if (axis === "x") {
      const axisGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(region.xMin - 1, axisValue, 0),
        new THREE.Vector3(region.xMax + 1, axisValue, 0),
      ]);
      const axisLine = new THREE.Line(axisGeo, axisLineMat);
      axisLine.computeLineDistances();
      crossSectionGroup.add(axisLine);
    } else {
      const allY = [
        ...region.upperProfile.map((p) => p.y),
        ...region.lowerProfile.map((p) => p.y),
      ];
      const yMin = Math.min(...allY);
      const yMax = Math.max(...allY);
      const axisGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(axisValue, yMin - 1, 0),
        new THREE.Vector3(axisValue, yMax + 1, 0),
      ]);
      const axisLine = new THREE.Line(axisGeo, axisLineMat);
      axisLine.computeLineDistances();
      crossSectionGroup.add(axisLine);
    }

    scene.add(crossSectionGroup);
  }

  function fitCamera(geometry: THREE.BufferGeometry) {
    if (!camera || !controls) return;

    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    if (!sphere) return;

    const center = sphere.center;
    const radius = sphere.radius || 2;

    const fov = camera.fov * (Math.PI / 180);
    const distance = (radius / Math.sin(fov / 2)) * 1.3;

    controls.target.copy(center);

    camera.position.set(
      center.x + distance * 0.6,
      center.y + distance * 0.5,
      center.z + distance * 0.7,
    );

    camera.near = Math.max(0.01, distance * 0.01);
    camera.far = Math.max(1000, distance * 10);
    camera.updateProjectionMatrix();

    controls.update();
  }

  function clearSolid() {
    if (!scene) return;

    if (solidMesh) {
      scene.remove(solidMesh);
      solidMesh.geometry.dispose();
      (solidMesh.material as THREE.Material).dispose();
      solidMesh = null;
    }

    if (wireframeMesh) {
      scene.remove(wireframeMesh);
      wireframeMesh.geometry.dispose();
      (wireframeMesh.material as THREE.Material).dispose();
      wireframeMesh = null;
    }

    if (crossSectionGroup) {
      scene.remove(crossSectionGroup);
      disposeGroup(crossSectionGroup);
      crossSectionGroup = null;
    }
  }

  function clearScene() {
    clearSolid();
    currentRegion = null;
  }

  // ===== Update display options =====

  function updateDisplay(
    display: Partial<DisplayOptions>,
    curveColors?: [string, string],
  ) {
    currentDisplay = { ...currentDisplay, ...display };
    if (curveColors) currentCurveColors = curveColors;

    // When curve colours change we need to rebuild vertex colours
    if (curveColors && solidMesh && currentRegion) {
      buildSolid(
        currentRegion,
        currentAxis,
        currentAxisValue,
        currentDisplay,
        undefined,
        currentCurveColors,
      );
      return;
    }

    if (solidMesh) {
      const mat = solidMesh.material as THREE.MeshPhysicalMaterial;
      // Vertex-coloured material: don't override mat.color
      if (display.mode !== undefined) {
        mat.transparent = display.mode === "transparent";
        mat.opacity =
          display.mode === "transparent" ? currentDisplay.opacity : 1.0;
        mat.depthWrite = display.mode !== "transparent";
        solidMesh.visible = display.mode !== "wireframe";
      }
      if (
        display.opacity !== undefined &&
        currentDisplay.mode === "transparent"
      ) {
        mat.opacity = display.opacity;
      }
      mat.needsUpdate = true;
    }

    if (wireframeMesh) {
      const mat = wireframeMesh.material as THREE.LineBasicMaterial;
      if (display.mode !== undefined) {
        if (display.mode === "wireframe") {
          mat.color.set(currentDisplay.color);
          mat.opacity = 0.9;
        } else {
          mat.color.set(0x000000);
          mat.opacity = 0.08;
        }
        mat.needsUpdate = true;
      }
    }

    if (display.showAxes !== undefined && axesHelper) {
      axesHelper.visible = display.showAxes;
    }

    if (display.showGrid !== undefined && gridHelper) {
      gridHelper.visible = display.showGrid;
    }

    if (display.showCrossSection !== undefined) {
      if (crossSectionGroup) {
        crossSectionGroup.visible = display.showCrossSection;
      }
      if (display.showCrossSection && !crossSectionGroup && currentRegion) {
        buildCrossSection(
          currentRegion,
          currentAxis,
          currentAxisValue,
          currentDisplay.color,
          currentCurveColors,
        );
      }
    }
  }

  // ===== Animation =====

  function startAnimation(duration: number = 2000) {
    if (!currentRegion) return;

    animationDuration = duration;
    animationStartTime = performance.now();
    isAnimating = true;
  }

  function stopAnimation() {
    isAnimating = false;
    // Rebuild with full angle
    if (currentRegion) {
      buildSolid(
        currentRegion,
        currentAxis,
        currentAxisValue,
        currentDisplay,
        Math.PI * 2,
        currentCurveColors,
      );
    }
  }

  // ===== Screenshot =====

  function takeScreenshot(): string | null {
    if (!renderer || !scene || !camera) return null;
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  }

  // ===== Reset camera =====

  function resetCamera() {
    if (!camera || !controls) return;
    camera.position.set(5, 4, 6);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  // ===== Dispose =====

  function disposeGroup(group: THREE.Group) {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else if (obj.material) {
          obj.material.dispose();
        }
      } else if (
        obj instanceof THREE.Line ||
        obj instanceof THREE.LineSegments
      ) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else if (obj.material) {
          (obj.material as THREE.Material).dispose();
        }
      } else if (obj instanceof THREE.Sprite) {
        obj.material?.map?.dispose();
        obj.material?.dispose();
      }
    });
  }

  function dispose() {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    clearSolid();

    if (axesHelper && scene) {
      scene.remove(axesHelper);
      disposeGroup(axesHelper);
      axesHelper = null;
    }

    if (gridHelper && scene) {
      scene.remove(gridHelper);
      gridHelper.geometry.dispose();
      (gridHelper.material as THREE.Material).dispose();
      gridHelper = null;
    }

    if (controls) {
      controls.dispose();
      controls = null;
    }

    if (renderer) {
      const container = getContainer();
      if (container) {
        try {
          container.removeChild(renderer.domElement);
        } catch {
          // already removed
        }
        const resizeObserver = (container as any).__resizeObserver;
        if (resizeObserver) {
          resizeObserver.disconnect();
          delete (container as any).__resizeObserver;
        }
      }
      renderer.dispose();
      renderer = null;
    }

    scene = null;
    camera = null;
    isReady = false;
  }

  // ===== Update background color to match theme =====

  function updateBackground(isDark: boolean) {
    if (!renderer) return;
    if (isDark) {
      renderer.setClearColor(0x0f1117, 1);
    } else {
      renderer.setClearColor(0xf5f7fa, 1);
    }
    // Update grid colors
    if (gridHelper) {
      (gridHelper.material as THREE.Material).dispose();
      if (scene) scene.remove(gridHelper);
      gridHelper = new THREE.GridHelper(
        16,
        32,
        isDark ? 0x555555 : 0x888888,
        isDark ? 0x333333 : 0x444444,
      );
      (gridHelper.material as THREE.Material).transparent = true;
      (gridHelper.material as THREE.Material).opacity = 0.15;
      gridHelper.visible = currentDisplay.showGrid;
      if (scene) scene.add(gridHelper);
    }
  }

  return {
    getIsReady,
    getIsAnimating,
    init,
    dispose,
    buildSolid,
    clearScene,
    updateDisplay,
    updateBackground,
    startAnimation,
    stopAnimation,
    takeScreenshot,
    resetCamera,
    handleResize,
  };
}
