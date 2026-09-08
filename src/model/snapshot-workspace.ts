import {
  fullWindow,
  useAll as useAllWindow,
  withRange,
  type AnalysisWindow,
} from "./analysis-window.js";
import {
  DEFAULT_POINTS,
  clampPointCount,
  makeClassroomSnapshot,
  type ClassroomSnapshot,
} from "./classroom-snapshot.js";
import type { MotionRun } from "./motion-run.js";
import { fitModel, type FitFailure, type FitResult, type ModelFamily } from "./model-fit.js";
import { suggestModel } from "./suggest-model.js";

/**
 * Pure Snapshot Lab workspace state. Session/workspace only — nothing here is
 * persisted, and the source MotionRun is never mutated. Every transition that
 * changes the run / window / point count / snapshot clears `fit`, so the view
 * (which renders purely from this) can never show a stale equation.
 */
export interface SnapshotWorkspace {
  readonly run: MotionRun;
  readonly mode: "raw" | "snapshot";
  readonly window: AnalysisWindow | null;
  readonly pointCount: number;
  readonly snapshot: ClassroomSnapshot | null;
  readonly family: ModelFamily | null;
  readonly fit: FitResult | FitFailure | null;
}

export function startWorkspace(run: MotionRun): SnapshotWorkspace {
  return {
    run,
    mode: "raw",
    window: null,
    pointCount: DEFAULT_POINTS,
    snapshot: null,
    family: null,
    fit: null,
  };
}

/** Begin selecting an interval — defaults to the full run. */
export function selectWindow(ws: SnapshotWorkspace): SnapshotWorkspace {
  return { ...ws, window: ws.window ?? fullWindow(ws.run), mode: "raw", snapshot: null, fit: null };
}

export function setWindowRange(
  ws: SnapshotWorkspace,
  startSeconds: number,
  endSeconds: number,
): SnapshotWorkspace {
  const base = ws.window ?? fullWindow(ws.run);
  return { ...ws, window: withRange(base, ws.run, startSeconds, endSeconds), snapshot: null, fit: null };
}

export function useAll(ws: SnapshotWorkspace): SnapshotWorkspace {
  const base = ws.window ?? fullWindow(ws.run);
  return { ...ws, window: useAllWindow(base, ws.run), snapshot: null, fit: null };
}

/** Commit the selected window to a Classroom Snapshot. */
export function makeSnapshot(ws: SnapshotWorkspace): SnapshotWorkspace {
  const window = ws.window ?? fullWindow(ws.run);
  return {
    ...ws,
    mode: "snapshot",
    window,
    snapshot: makeClassroomSnapshot(ws.run, window, ws.pointCount),
    fit: null,
  };
}

/** Go back to interval selection (keeps the window, drops the derived snapshot). */
export function changeWindow(ws: SnapshotWorkspace): SnapshotWorkspace {
  return { ...ws, mode: "raw", snapshot: null, fit: null };
}

export function setPointCount(ws: SnapshotWorkspace, n: number): SnapshotWorkspace {
  const pointCount = clampPointCount(n);
  if (pointCount === ws.pointCount) return ws;
  const snapshot =
    ws.mode === "snapshot" && ws.window
      ? makeClassroomSnapshot(ws.run, ws.window, pointCount)
      : ws.snapshot;
  return { ...ws, pointCount, snapshot, fit: null };
}

export function setFamily(ws: SnapshotWorkspace, family: ModelFamily): SnapshotWorkspace {
  if (family === ws.family) return ws;
  return { ...ws, family, fit: null };
}

/** Fit `ws.family` to the snapshot's UNROUNDED fitPoints. */
export function runFit(ws: SnapshotWorkspace): SnapshotWorkspace {
  if (!ws.snapshot || !ws.family) return ws;
  return { ...ws, fit: fitModel(ws.family, ws.snapshot.fitPoints) };
}

/** Suggest a family and fit it. */
export function runSuggest(ws: SnapshotWorkspace): SnapshotWorkspace {
  if (!ws.snapshot) return ws;
  const { family } = suggestModel(ws.snapshot.fitPoints);
  return { ...ws, family, fit: fitModel(family, ws.snapshot.fitPoints) };
}

/** Swap in a different source run (e.g. Open in Snapshot) — full reset. */
export function withRun(ws: SnapshotWorkspace, run: MotionRun): SnapshotWorkspace {
  if (run.id === ws.run.id) return ws;
  return startWorkspace(run);
}
