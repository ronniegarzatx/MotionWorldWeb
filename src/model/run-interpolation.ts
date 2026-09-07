import type { MotionRun } from "./motion-run.js";

/**
 * The position (metres) at an arbitrary time by **linear interpolation** between
 * the two bracketing raw samples. Clamps to the endpoints outside the run's
 * range. Pure — the run is never touched.
 *
 * Used to derive evenly-spaced classroom-snapshot points (and, later, Speed
 * Lab). The raw MotionRun stays the durable truth; interpolation only produces
 * derived values.
 */
export function positionAt(run: MotionRun, tSeconds: number): number {
  const s = run.samples;
  const n = s.length;
  if (n === 0) return 0;
  if (n === 1) return s[0]!.positionMeters;

  if (tSeconds <= s[0]!.timestampSeconds) return s[0]!.positionMeters;
  if (tSeconds >= s[n - 1]!.timestampSeconds) return s[n - 1]!.positionMeters;

  // binary search for the last sample with timestamp <= t
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid]!.timestampSeconds <= tSeconds) lo = mid;
    else hi = mid;
  }
  const a = s[lo]!;
  const b = s[hi]!;
  const span = b.timestampSeconds - a.timestampSeconds;
  if (span <= 0) return a.positionMeters;
  const frac = (tSeconds - a.timestampSeconds) / span;
  return a.positionMeters + frac * (b.positionMeters - a.positionMeters);
}
