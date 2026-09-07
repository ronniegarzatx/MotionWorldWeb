/**
 * Pure sample-timing diagnostics (spec §13).
 *
 * Input: the wall-clock arrival times (ms, e.g. performance.now()) of the
 * samples received so far, in order. These are DIAGNOSTIC — they report what the
 * browser actually delivered, they are never the analysis x-axis.
 *
 * Nothing here fakes the native ~25 Hz / 40 ms baseline.
 */
export interface TimingSummary {
  readonly sampleCount: number;
  readonly elapsedSeconds: number;
  /** (count-1)/elapsed; null when undefined (fewer than 2 samples). */
  readonly observedRateHz: number | null;
  readonly lastIntervalMs: number | null;
  readonly meanIntervalMs: number | null;
  /** Population standard deviation of the inter-arrival intervals. */
  readonly stdevIntervalMs: number | null;
  readonly minIntervalMs: number | null;
  readonly maxIntervalMs: number | null;
}

const EMPTY: TimingSummary = Object.freeze({
  sampleCount: 0,
  elapsedSeconds: 0,
  observedRateHz: null,
  lastIntervalMs: null,
  meanIntervalMs: null,
  stdevIntervalMs: null,
  minIntervalMs: null,
  maxIntervalMs: null,
});

export function summariseTiming(arrivalMsList: readonly number[]): TimingSummary {
  const n = arrivalMsList.length;
  if (n === 0) return EMPTY;
  if (n === 1) {
    return Object.freeze({ ...EMPTY, sampleCount: 1 });
  }

  const first = arrivalMsList[0]!;
  const last = arrivalMsList[n - 1]!;
  const elapsedMs = last - first;

  const intervals: number[] = [];
  for (let i = 1; i < n; i++) {
    intervals.push(arrivalMsList[i]! - arrivalMsList[i - 1]!);
  }

  const sum = intervals.reduce((a, b) => a + b, 0);
  const mean = sum / intervals.length;
  const variance =
    intervals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / intervals.length;

  return Object.freeze({
    sampleCount: n,
    elapsedSeconds: elapsedMs / 1000,
    observedRateHz: elapsedMs > 0 ? (n - 1) / (elapsedMs / 1000) : null,
    lastIntervalMs: intervals[intervals.length - 1]!,
    meanIntervalMs: mean,
    stdevIntervalMs: Math.sqrt(variance),
    minIntervalMs: Math.min(...intervals),
    maxIntervalMs: Math.max(...intervals),
  });
}
