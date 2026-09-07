/**
 * Walk the Line — data-driven target catalog. A WalkTarget is a piecewise-linear
 * idealized position-vs-time graph the student tries to trace with real motion.
 * No rendering logic here — the view/chart consume this data.
 */
export interface TargetPoint {
  readonly timeSeconds: number;
  readonly positionMeters: number;
}

export interface WalkTarget {
  readonly id: string;
  readonly title: string;
  /** one short line shown under the graph; optional. */
  readonly prompt?: string;
  readonly durationSeconds: number;
  /** fixed y-axis for the challenge coordinate system: [lo, hi] metres. */
  readonly positionRange: readonly [number, number];
  readonly points: readonly TargetPoint[];
}

/** Below this the Go!Motion near zone is unreliable — no target starts here. */
export const SAFE_MIN_METERS = 0.4;

/** A shifted (movable) target must keep every displayed point in this band. */
export const DISPLAY_MIN_METERS = 0.5;
export const DISPLAY_MAX_METERS = 3.5;

const p = (timeSeconds: number, positionMeters: number): TargetPoint => ({
  timeSeconds,
  positionMeters,
});

export const WALK_TARGETS: readonly WalkTarget[] = [
  {
    id: "stand-still",
    title: "Stand Still",
    prompt: "Hold your position — a flat line.",
    durationSeconds: 6,
    positionRange: [0.5, 2.5],
    points: [p(0, 1.5), p(6, 1.5)],
  },
  {
    id: "walk-away",
    title: "Walk Away",
    prompt: "Move steadily away from the sensor.",
    durationSeconds: 6,
    positionRange: [0.5, 3.5],
    points: [p(0, 1.0), p(6, 3.0)],
  },
  {
    id: "walk-toward",
    title: "Walk Toward",
    prompt: "Move steadily toward the sensor.",
    durationSeconds: 6,
    positionRange: [0.5, 3.5],
    points: [p(0, 3.0), p(6, 1.0)],
  },
  {
    id: "positive-constant-rate",
    title: "Positive Constant Rate",
    prompt: "A steady 0.5 m/s away — one straight climb.",
    durationSeconds: 5,
    positionRange: [0.5, 3.5],
    points: [p(0, 1.0), p(5, 3.5)],
  },
  {
    id: "negative-constant-rate",
    title: "Negative Constant Rate",
    prompt: "A steady 0.5 m/s toward — one straight descent.",
    durationSeconds: 5,
    positionRange: [0.5, 3.5],
    points: [p(0, 3.5), p(5, 1.0)],
  },
  {
    id: "stop-then-move",
    title: "Stop → Move",
    prompt: "Stand still, then walk away.",
    durationSeconds: 7,
    positionRange: [0.5, 3.5],
    points: [p(0, 1.0), p(3, 1.0), p(7, 3.0)],
  },
  {
    id: "stop-move-stop",
    title: "Stop → Move → Stop",
    prompt: "Still, then away, then still again.",
    durationSeconds: 8,
    positionRange: [0.5, 3.5],
    points: [p(0, 1.0), p(2, 1.0), p(6, 3.0), p(8, 3.0)],
  },
  {
    id: "away-pause-toward",
    title: "Away → Pause → Toward",
    prompt: "Away, hold, then back toward the sensor.",
    durationSeconds: 8,
    positionRange: [0.5, 3.5],
    points: [p(0, 1.0), p(3, 3.0), p(5, 3.0), p(8, 1.0)],
  },
];

export function targetById(id: string): WalkTarget | undefined {
  return WALK_TARGETS.find((t) => t.id === id);
}

export function targetIndexById(id: string): number {
  return WALK_TARGETS.findIndex((t) => t.id === id);
}

/** Wrapping navigation through the canonical sequence. */
export function nextIndex(i: number): number {
  return (i + 1) % WALK_TARGETS.length;
}
export function prevIndex(i: number): number {
  return (i - 1 + WALK_TARGETS.length) % WALK_TARGETS.length;
}

// ── Movable target: a display offset, never a mutation of the catalog ─────────

export function canonicalYRange(target: WalkTarget): readonly [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of target.points) {
    if (p.positionMeters < lo) lo = p.positionMeters;
    if (p.positionMeters > hi) hi = p.positionMeters;
  }
  return [lo, hi];
}

/** All canonical positions equal (a horizontal / zero-rate target). */
export function isFlat(target: WalkTarget): boolean {
  const [lo, hi] = canonicalYRange(target);
  return Math.abs(hi - lo) < 1e-9;
}

/** The legal offset interval so every displayed point stays in
 *  [DISPLAY_MIN, DISPLAY_MAX]. If the canonical span already exceeds the band
 *  (no target does), returns a degenerate interval at the lower bound. */
export function offsetLimits(target: WalkTarget): { readonly min: number; readonly max: number } {
  const [lo, hi] = canonicalYRange(target);
  const min = DISPLAY_MIN_METERS - lo;
  const max = DISPLAY_MAX_METERS - hi;
  if (min > max) return { min, max: min };
  return { min, max };
}

export function clampOffset(target: WalkTarget, desiredMeters: number): number {
  const { min, max } = offsetLimits(target);
  if (!Number.isFinite(desiredMeters)) return 0;
  return Math.min(max, Math.max(min, desiredMeters));
}

/** Canonical points translated vertically by `offsetMeters`. Pure — the catalog
 *  is untouched. Times and slopes are identical to the canonical target. */
export function displayedPoints(target: WalkTarget, offsetMeters: number): readonly TargetPoint[] {
  return target.points.map((p) => ({
    timeSeconds: p.timeSeconds,
    positionMeters: p.positionMeters + offsetMeters,
  }));
}

/** Concise wording for the current offset. */
export function targetOffsetLabel(target: WalkTarget, offsetMeters: number): string {
  if (isFlat(target)) {
    const height = target.points[0]!.positionMeters + offsetMeters;
    return `Target height: ${height.toFixed(1)} m`;
  }
  if (Math.abs(offsetMeters) < 0.05) return "Target shift: 0.0 m";
  const sign = offsetMeters > 0 ? "+" : "−";
  return `Target shift: ${sign}${Math.abs(offsetMeters).toFixed(1)} m`;
}
