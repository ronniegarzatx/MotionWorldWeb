import type { MotionRun } from "./motion-run.js";
import type { MotionSample } from "./motion-sample.js";

/**
 * A reversible selection over an immutable MotionRun. It NEVER deletes or
 * rewrites raw samples — it is only a view/filter. Snapshot Lab and Speed Lab
 * will build on this.
 *
 * Boundary semantics: **start-inclusive, end-inclusive** (with a tiny float
 * epsilon). No resampling, no interpolation. Works with irregular timestamps.
 */
export interface AnalysisWindow {
  readonly runId: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

const EPS = 1e-9;

function runBounds(run: MotionRun): { lo: number; hi: number } {
  const n = run.samples.length;
  if (n === 0) return { lo: 0, hi: 0 };
  return { lo: run.samples[0]!.timestampSeconds, hi: run.samples[n - 1]!.timestampSeconds };
}

function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  if (v === Number.POSITIVE_INFINITY) return hi;
  if (v === Number.NEGATIVE_INFINITY) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/** The full run: [first timestamp, last timestamp]. May be degenerate
 *  (start === end) for a run with 0 or 1 distinct timestamps — still valid. */
export function fullWindow(run: MotionRun): AnalysisWindow {
  const { lo, hi } = runBounds(run);
  return { runId: run.id, startSeconds: lo, endSeconds: hi };
}

export function useAll(_window: AnalysisWindow, run: MotionRun): AnalysisWindow {
  return fullWindow(run);
}

/** Move the start. Clamped to [runStart, endSeconds]; if that would collapse the
 *  window (short run), the window is returned unchanged. */
export function withStart(
  w: AnalysisWindow,
  run: MotionRun,
  startSeconds: number,
): AnalysisWindow {
  const { lo, hi } = runBounds(run);
  const next = clamp(startSeconds, lo, Math.min(hi, w.endSeconds));
  if (next >= w.endSeconds - EPS && w.endSeconds > lo + EPS) {
    // keep a non-empty window: don't let start cross end
    return { ...w, startSeconds: Math.max(lo, w.endSeconds - EPS) };
  }
  return { ...w, startSeconds: next };
}

/** Move the end. Clamped to [startSeconds, runEnd]. */
export function withEnd(
  w: AnalysisWindow,
  run: MotionRun,
  endSeconds: number,
): AnalysisWindow {
  const { lo, hi } = runBounds(run);
  const next = clamp(endSeconds, Math.max(lo, w.startSeconds), hi);
  if (next <= w.startSeconds + EPS && hi > lo + EPS) {
    return { ...w, endSeconds: Math.min(hi, w.startSeconds + EPS) };
  }
  return { ...w, endSeconds: next };
}

export function withRange(
  w: AnalysisWindow,
  run: MotionRun,
  startSeconds: number,
  endSeconds: number,
): AnalysisWindow {
  const { lo, hi } = runBounds(run);
  let s = clamp(startSeconds, lo, hi);
  let e = clamp(endSeconds, lo, hi);
  if (s > e) [s, e] = [e, s];
  if (e - s < EPS && hi - lo > EPS) {
    // widen minimally to keep start < end
    if (e + EPS <= hi) e = e + EPS;
    else s = s - EPS;
  }
  return { runId: w.runId, startSeconds: s, endSeconds: e };
}

export function windowDurationSeconds(w: AnalysisWindow): number {
  return Math.max(0, w.endSeconds - w.startSeconds);
}

/** start <= t <= end (both inclusive). */
export function windowContains(w: AnalysisWindow, t: number): boolean {
  return t >= w.startSeconds - EPS && t <= w.endSeconds + EPS;
}

/** Samples whose timestamp lies within the window, in original order. The run is
 *  not touched. */
export function activeSamples(w: AnalysisWindow, run: MotionRun): readonly MotionSample[] {
  return run.samples.filter((s) => windowContains(w, s.timestampSeconds));
}
