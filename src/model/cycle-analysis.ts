/**
 * Sequence Lab's cycle-detection core. Pure TypeScript — no DOM, no browser
 * APIs, no numeric library. Everything here is deterministic and unit-testable
 * in isolation.
 *
 * All detectors work on the *value array* of a run (positions in metres); every
 * time is read from the run's real sample timestamps, so irregular timestamps
 * are tolerated without resampling the raw data.
 */

// ── numeric primitives ───────────────────────────────────────────────────────

/** Centred moving average, edges clamped. `halfWindow` 0 returns a copy. */
export function movingAverage(values: readonly number[], halfWindow: number): number[] {
  const n = values.length;
  const k = Math.max(0, Math.floor(halfWindow));
  if (k === 0) return values.slice();
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - k; j <= i + k; j++) {
      const idx = j < 0 ? 0 : j >= n ? n - 1 : j;
      sum += values[idx]!;
      count++;
    }
    out[i] = sum / count;
  }
  return out;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Median absolute deviation, scaled by 1.4826 to estimate a Gaussian σ. */
export function mad(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const m = median(values);
  return 1.4826 * median(values.map((v) => Math.abs(v - m)));
}

export function diff(values: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) out.push(values[i]! - values[i - 1]!);
  return out;
}

const SQRT6 = Math.sqrt(6);

/**
 * A robust white-noise σ estimate from the second differences: for white noise
 * `sd(Δ²x) = √6·σ`, and a smooth signal contributes ≈ 0. Uses the MAD so a few
 * large excursions (real turning points, a glitch) don't inflate it.
 */
export function estimateNoise(values: readonly number[]): number {
  if (values.length < 3) return 0;
  const second: number[] = [];
  for (let i = 2; i < values.length; i++) {
    second.push(values[i]! - 2 * values[i - 1]! + values[i - 2]!);
  }
  return mad(second) / SQRT6;
}

/** Population coefficient of variation `std / |mean|`; 0 for a ~zero mean. */
export function coefficientOfVariation(values: readonly number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (Math.abs(mean) < 1e-12) return 0;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return Math.sqrt(variance) / Math.abs(mean);
}

// ── turning points ───────────────────────────────────────────────────────────

export type ExtremumKind = "max" | "min";

export interface RawExtremum {
  /** sample index of the turning point (on the raw run) */
  readonly index: number;
  readonly kind: ExtremumKind;
  /** parabola-refined time, seconds (read from the real sample timestamps) */
  readonly timeSeconds: number;
  /** parabola-refined position, metres */
  readonly valueMeters: number;
  /** the turning-point sample's own position — provenance */
  readonly rawValueMeters: number;
  readonly prominence: number;
}

/**
 * Strict local maxima / minima with plateau handling. The first and last
 * samples are never turning points.
 */
export function findLocalExtrema(
  values: readonly number[],
): { index: number; kind: ExtremumKind }[] {
  const out: { index: number; kind: ExtremumKind }[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    const v = values[i]!;
    const l = values[i - 1]!;
    const r = values[i + 1]!;
    // a plateau emits only at its first index (v > l on the left)
    if (v > l && v >= r) out.push({ index: i, kind: "max" });
    else if (v < l && v <= r) out.push({ index: i, kind: "min" });
  }
  return out;
}

const PROMINENCE_SEARCH = 400;

/**
 * Topographic prominence: the drop from the extremum to the higher of the two
 * bounding key cols. Searched within a bounded window each side; reaching the
 * edge without higher terrain still yields a finite value.
 */
export function computeProminence(
  values: readonly number[],
  index: number,
  kind: ExtremumKind,
): number {
  if (kind === "min") {
    return computeProminence(
      values.map((v) => -v),
      index,
      "max",
    );
  }
  const peak = values[index]!;
  const colOnSide = (step: -1 | 1): number => {
    let colMin = peak;
    let sawHigher = false;
    for (let k = 1; k <= PROMINENCE_SEARCH; k++) {
      const j = index + step * k;
      if (j < 0 || j >= values.length) break;
      const v = values[j]!;
      if (v > peak) {
        sawHigher = true;
        break;
      }
      if (v < colMin) colMin = v;
    }
    // adjacent higher terrain (no descent) → this side contributes nothing
    return sawHigher && colMin === peak ? peak : colMin;
  };
  const keyCol = Math.max(colOnSide(-1), colOnSide(1));
  return peak - keyCol;
}

/** Sub-sample vertex from a parabola through i−1, i, i+1. */
export function refineVertex(
  values: readonly number[],
  index: number,
): { deltaIndex: number; value: number } {
  if (index <= 0 || index >= values.length - 1) {
    return { deltaIndex: 0, value: values[index] ?? NaN };
  }
  const y0 = values[index - 1]!;
  const y1 = values[index]!;
  const y2 = values[index + 1]!;
  const denom = y0 - 2 * y1 + y2;
  if (Math.abs(denom) < 1e-12) return { deltaIndex: 0, value: y1 };
  let delta = (0.5 * (y0 - y2)) / denom;
  if (delta > 1) delta = 1;
  else if (delta < -1) delta = -1;
  const value = y1 - 0.25 * (y0 - y2) * delta;
  return { deltaIndex: delta, value };
}

export type Sensitivity = "low" | "standard" | "high";

export const SEQUENCE_SENSITIVITIES: readonly Sensitivity[] = ["low", "standard", "high"];
export const DEFAULT_SENSITIVITY: Sensitivity = "standard";

interface SensitivityProfile {
  readonly halfWindow: number;
  readonly promFactor: number;
  readonly minSeparation: number;
}

/** Centralised — real-hardware testing may tune these. */
export const SENSITIVITY_PROFILES: Record<Sensitivity, SensitivityProfile> = {
  low: { halfWindow: 4, promFactor: 4.0, minSeparation: 9 },
  standard: { halfWindow: 3, promFactor: 2.5, minSeparation: 6 },
  high: { halfWindow: 2, promFactor: 1.5, minSeparation: 4 },
};

/** A relative floor so tiny wiggles are rejected even when the noise estimate is ~0. */
const PROM_FLOOR_FRACTION = 0.03;

interface RunLike {
  readonly samples: readonly { readonly timestampSeconds: number; readonly positionMeters: number }[];
}

/**
 * Detect the turning points of a run at the given sensitivity. Two-stage:
 * smooth to localise, then read the refined time/value from the raw samples.
 * Enforces a prominence gate (noise-aware, with a relative floor) and a minimum
 * separation so one physical swing yields one event. The run is never mutated.
 */
export function detectExtrema(
  run: RunLike,
  opts: { sensitivity: Sensitivity },
): RawExtremum[] {
  const samples = run.samples;
  const n = samples.length;
  if (n < 5) return [];

  const raw = samples.map((s) => s.positionMeters);
  const times = samples.map((s) => s.timestampSeconds);
  const profile = SENSITIVITY_PROFILES[opts.sensitivity];

  const smooth = movingAverage(raw, profile.halfWindow);
  const noise = estimateNoise(raw);
  const range = Math.max(...smooth) - Math.min(...smooth);
  const threshold = Math.max(noise * profile.promFactor, range * PROM_FLOOR_FRACTION);

  const candidates = findLocalExtrema(smooth)
    .map((c) => ({ ...c, prominence: computeProminence(smooth, c.index, c.kind) }))
    .filter((c) => c.prominence >= threshold);

  // minimum separation — within a cluster of near-neighbours, keep the most prominent
  const kept: typeof candidates = [];
  for (const c of candidates) {
    const clashIdx = kept.findIndex((k) => Math.abs(k.index - c.index) < profile.minSeparation);
    if (clashIdx === -1) {
      kept.push(c);
    } else if (c.prominence > kept[clashIdx]!.prominence) {
      kept[clashIdx] = c;
    }
  }
  kept.sort((a, b) => a.index - b.index);

  return kept.map((c) => {
    const v = refineVertex(raw, c.index);
    const dt =
      c.index > 0 && c.index < n - 1
        ? (times[c.index + 1]! - times[c.index - 1]!) / 2
        : 0;
    return {
      index: c.index,
      kind: c.kind,
      timeSeconds: times[c.index]! + v.deltaIndex * dt,
      valueMeters: v.value,
      rawValueMeters: raw[c.index]!,
      prominence: c.prominence,
    };
  });
}
