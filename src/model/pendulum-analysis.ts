import {
  coefficientOfVariation,
  detectExtrema,
  diff,
  median,
  type ExtremumKind,
  type RawExtremum,
  type Sensitivity,
} from "./cycle-analysis.js";

/**
 * Pendulum mode — derive a discrete sequence from periodic swinging motion:
 * turning-point amplitude (one term per half-cycle) or full period. No sinusoid
 * fitting, no pendulum-equation model — this is sequence extraction. Pure; the
 * raw MotionRun is never mutated.
 */

export const MIN_PENDULUM_EXTREMA = 4;
export const MIN_FULL_PERIODS = 2;
export const PERIOD_TOLERANCE = 0.18;

const PENDULUM_TOO_SHORT = "Collect a few more complete swings.";

interface RunLike {
  readonly samples: readonly { readonly timestampSeconds: number; readonly positionMeters: number }[];
}

/** `(median(high extrema) + median(low extrema)) / 2` — robust, no single pair. */
export function estimatePendulumMidline(extrema: readonly RawExtremum[]): number | null {
  const highs = extrema.filter((e) => e.kind === "max").map((e) => e.valueMeters);
  const lows = extrema.filter((e) => e.kind === "min").map((e) => e.valueMeters);
  if (highs.length === 0 || lows.length === 0) return null;
  return (median(highs) + median(lows)) / 2;
}

export interface PendulumExtrema {
  readonly ok: true;
  readonly extrema: readonly RawExtremum[];
  readonly midlineMeters: number;
}
export type PendulumDetection = PendulumExtrema | { readonly ok: false; readonly reason: string };

export function detectPendulumExtrema(
  run: RunLike,
  opts: { sensitivity: Sensitivity },
): PendulumDetection {
  const extrema = detectExtrema(run, opts);
  const midline = estimatePendulumMidline(extrema);
  if (midline === null) return { ok: false, reason: PENDULUM_TOO_SHORT };
  return { ok: true, extrema, midlineMeters: midline };
}

// ── amplitude mode ───────────────────────────────────────────────────────────

export interface AmplitudeTerm {
  readonly timeSeconds: number;
  readonly amplitudeMeters: number;
  readonly rawPositionMeters: number;
  readonly sampleIndex: number;
  readonly kind: ExtremumKind;
}

export function pendulumAmplitudeSequence(
  d: PendulumExtrema,
): { readonly ok: true; readonly terms: readonly AmplitudeTerm[] } | { readonly ok: false; readonly reason: string } {
  if (d.extrema.length < MIN_PENDULUM_EXTREMA) return { ok: false, reason: PENDULUM_TOO_SHORT };
  const terms = [...d.extrema]
    .sort((a, b) => a.timeSeconds - b.timeSeconds)
    .map((e) => ({
      timeSeconds: e.timeSeconds,
      amplitudeMeters: Math.abs(e.valueMeters - d.midlineMeters),
      rawPositionMeters: e.rawValueMeters,
      sampleIndex: e.index,
      kind: e.kind,
    }));
  return { ok: true, terms };
}

// ── period mode ──────────────────────────────────────────────────────────────

export interface PeriodSide {
  readonly periods: readonly number[];
  readonly source: "maxima" | "minima";
}

/**
 * Deterministic side-selection:
 *  1. prefer the side with more valid (positive) full periods;
 *  2. on a tie, prefer the lower coefficient of variation;
 *  3. on a total tie, prefer maxima.
 */
export function choosePeriodSide(
  periodsFromMaxima: readonly number[],
  periodsFromMinima: readonly number[],
): PeriodSide {
  const pMax = periodsFromMaxima.filter((p) => p > 0);
  const pMin = periodsFromMinima.filter((p) => p > 0);
  if (pMax.length !== pMin.length) {
    return pMax.length > pMin.length
      ? { periods: pMax, source: "maxima" }
      : { periods: pMin, source: "minima" };
  }
  if (pMax.length === 0) return { periods: [], source: "maxima" };
  return coefficientOfVariation(pMin) < coefficientOfVariation(pMax)
    ? { periods: pMin, source: "minima" }
    : { periods: pMax, source: "maxima" };
}

export interface PeriodSeries {
  readonly ok: true;
  readonly periods: readonly number[];
  readonly source: "maxima" | "minima";
  readonly averageSeconds: number;
  readonly consistent: boolean;
  readonly cv: number;
}

export function pendulumPeriodSeries(
  d: PendulumExtrema,
): PeriodSeries | { readonly ok: false; readonly reason: string } {
  const timesOf = (kind: ExtremumKind): number[] =>
    d.extrema
      .filter((e) => e.kind === kind)
      .map((e) => e.timeSeconds)
      .sort((a, b) => a - b);

  const side = choosePeriodSide(diff(timesOf("max")), diff(timesOf("min")));
  if (side.periods.length < MIN_FULL_PERIODS) return { ok: false, reason: PENDULUM_TOO_SHORT };

  const averageSeconds = side.periods.reduce((a, b) => a + b, 0) / side.periods.length;
  const cv = coefficientOfVariation(side.periods);
  return {
    ok: true,
    periods: side.periods,
    source: side.source,
    averageSeconds,
    consistent: cv <= PERIOD_TOLERANCE,
    cv,
  };
}
