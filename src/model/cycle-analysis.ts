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
