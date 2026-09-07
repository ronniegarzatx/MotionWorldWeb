import type { AnalysisWindow } from "./analysis-window.js";
import { windowDurationSeconds } from "./analysis-window.js";
import type { MotionRun } from "./motion-run.js";
import { positionAt } from "./run-interpolation.js";

/**
 * The Classroom Snapshot: a selected physical interval rescaled into clean
 * classroom coordinates for modelling. The raw MotionRun is never modified.
 *
 * Transform (V1):
 *   classroom x = the integer grid 0, 1, …, N−1 (the abstract grid the teacher
 *                 sized by choosing N). NOT seconds.
 *   classroom y = the interpolated position, in metres (no y-rescale in V1).
 *
 * `fitPoints` carry the UNROUNDED y — the model fit uses these.
 * `points` carry y snapped to the nearest 0.5 — display only.
 */
export interface ClassroomPoint {
  readonly x: number;
  readonly y: number;
}

export interface ClassroomSnapshot {
  readonly sourceRunId: string;
  readonly window: AnalysisWindow;
  readonly pointCount: number;
  readonly points: readonly ClassroomPoint[]; // DISPLAY — y snapped to 0.5
  readonly fitPoints: readonly ClassroomPoint[]; // MODELLING — y unrounded
  readonly xLabel: "Classroom x";
  readonly yLabel: "Classroom y";
}

export const MIN_POINTS = 3;
export const MAX_POINTS = 10;
export const DEFAULT_POINTS = 5;
const SNAP = 0.5;

export function clampPointCount(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_POINTS;
  return Math.min(MAX_POINTS, Math.max(MIN_POINTS, Math.round(n)));
}

function snapHalf(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

export function makeClassroomSnapshot(
  run: MotionRun,
  window: AnalysisWindow,
  pointCount: number,
): ClassroomSnapshot {
  const n = clampPointCount(pointCount);
  const duration = windowDurationSeconds(window);

  const fitPoints: ClassroomPoint[] = [];
  const points: ClassroomPoint[] = [];
  for (let k = 0; k < n; k++) {
    const frac = n === 1 ? 0 : k / (n - 1);
    const t = window.startSeconds + frac * duration;
    const y = positionAt(run, t);
    fitPoints.push({ x: k, y });
    points.push({ x: k, y: snapHalf(y) });
  }

  return {
    sourceRunId: run.id,
    window,
    pointCount: n,
    points: Object.freeze(points),
    fitPoints: Object.freeze(fitPoints),
    xLabel: "Classroom x",
    yLabel: "Classroom y",
  };
}

/** A FIXED classroom domain for the graph — padded to the nearest 0.5 so the
 *  points and model curve sit comfortably; never auto-scales. */
export function classroomDomain(snapshot: ClassroomSnapshot): {
  x: [number, number];
  y: [number, number];
} {
  const ys = snapshot.fitPoints.map((p) => p.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const yLo = Math.floor((lo - 0.25) / SNAP) * SNAP;
  const yHi = Math.ceil((hi + 0.25) / SNAP) * SNAP;
  return {
    x: [-0.25, snapshot.pointCount - 1 + 0.25],
    y: [yLo, yHi === yLo ? yLo + 1 : yHi],
  };
}
