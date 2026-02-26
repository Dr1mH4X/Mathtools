// ===== Shared Types for Math Engine =====

/** The kind of curve equation */
export type CurveType = "y_of_x" | "x_of_y" | "x_const" | "y_const";

/** Full definition of a single curve as entered by the user */
export interface CurveDefinition {
  id: string;
  type: CurveType;
  expression: string;
  /** Raw equation string, e.g. "y = sqrt(x-1)" */
  equation: string;
  color?: string;
}

/** Which axis to revolve around */
export type RotationAxis = "x" | "y";

/** Full configuration for a revolution computation */
export interface RevolutionConfig {
  curves: CurveDefinition[];
  xMin: number;
  xMax: number;
  axis: RotationAxis;
  /** For custom axis offset: rotate around y = axisValue (if axis='x') or x = axisValue (if axis='y') */
  axisValue: number;
  resolution: number;
}

/** A single sampled 2D point */
export interface ProfilePoint {
  x: number;
  y: number;
}

/** The computed upper/lower boundary of a bounded 2D region */
export interface ComputedRegion {
  /** The upper boundary profile sampled as points */
  upperProfile: ProfilePoint[];
  /** The lower boundary profile sampled as points */
  lowerProfile: ProfilePoint[];
  /** Effective x bounds after clipping */
  xMin: number;
  xMax: number;
}

/** Result of a volume-of-revolution computation */
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

/** A point on the 3D mesh profile (used for revolution geometry) */
export interface MeshProfilePoint {
  /** Distance from the rotation axis (radius in the rotated solid) */
  radius: number;
  /** Position along the rotation axis */
  axisPos: number;
}

/** A preset example for the UI */
export interface PresetExample {
  nameKey: string;
  descKey: string;
  curves: CurveDefinition[];
  xMin: number;
  xMax: number;
  axis: RotationAxis;
  axisValue: number;
}

/** Internal compiled curve representation */
export interface CompiledCurve {
  def: CurveDefinition;
  fn: import("mathjs").EvalFunction | null;
  constVal: number | null;
}
