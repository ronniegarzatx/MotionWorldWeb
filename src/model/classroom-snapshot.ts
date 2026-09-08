import type { AnalysisWindow } from "./analysis-window.js";
import { activeSamples, windowDurationSeconds } from "./analysis-window.js";
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

export type ClassroomTracePoint = ClassroomPoint;

export interface ClassroomSnapshot {
  readonly sourceRunId: string;
  readonly window: AnalysisWindow;
  readonly pointCount: number;
  readonly points: readonly ClassroomPoint[]; // DISPLAY — y snapped to 0.5
  readonly fitPoints: readonly ClassroomPoint[]; // MODELLING — y unrounded
  /**
   * A dense trace of EVERY raw sample inside the window, mapped continuously to
   * classroom x (0 → pointCount−1) with the same (unrounded) classroom-y
   * transform. Restores the visual shape of the selected motion behind the
   * sampled points. Never rounded.
   */
  readonly tracePoints: readonly ClassroomTracePoint[];
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

  // The SAME time -> classroom-x map used for the sampled points, applied
  // continuously to every raw sample in the window: t_start -> 0, t_end -> N-1.
  const span = n - 1;
  const timeToClassroomX = (t: number): number =>
    duration <= 0 ? 0 : ((t - window.startSeconds) / duration) * span;

  const inner = activeSamples(window, run).map((s) => ({
    x: timeToClassroomX(s.timestampSeconds),
    y: s.positionMeters,
  }));
  // anchor the dense trace exactly to the classroom-x endpoints so it lines up
  // under the sampled points (y at an endpoint = the same interpolation the
  // fit points use)
  const tracePoints: ClassroomTracePoint[] = [];
  if (inner.length === 0 || inner[0]!.x > 1e-9) {
    tracePoints.push({ x: 0, y: positionAt(run, window.startSeconds) });
  }
  tracePoints.push(...inner);
  if (inner.length === 0 || inner[inner.length - 1]!.x < span - 1e-9) {
    tracePoints.push({ x: span, y: positionAt(run, window.endSeconds) });
  }

  return {
    sourceRunId: run.id,
    window,
    pointCount: n,
    points: Object.freeze(points),
    fitPoints: Object.freeze(fitPoints),
    tracePoints: Object.freeze(tracePoints),
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
  // derived from the dense trace + the sampled points, at snapshot-creation
  // time, then FIXED — a later model overlay never rescales the axes.
  const ys = [
    ...snapshot.tracePoints.map((p) => p.y),
    ...snapshot.fitPoints.map((p) => p.y),
  ];
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const yLo = Math.floor((lo - 0.25) / SNAP) * SNAP;
  const yHi = Math.ceil((hi + 0.25) / SNAP) * SNAP;
  return {
    x: [-0.25, snapshot.pointCount - 1 + 0.25],
    y: [yLo, yHi === yLo ? yLo + 1 : yHi],
  };
}
