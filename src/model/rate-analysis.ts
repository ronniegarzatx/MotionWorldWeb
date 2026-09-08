import type { AnalysisWindow } from "./analysis-window.js";
import { activeSamples, windowDurationSeconds } from "./analysis-window.js";
import type { MotionRun } from "./motion-run.js";

/**
 * Speed Lab's honest speed / velocity calculation. Pure TS — no DOM, never
 * mutates the run, never persisted.
 *
 * The headline number is the **ordinary-least-squares slope of every real
 * sample in the selected `AnalysisWindow`** (y = position vs. t = time), not a
 * two-point difference. Speed is the unsigned magnitude; velocity keeps the
 * sign; direction is a word.
 */

export type MotionDirection = "away" | "toward" | "stationary";

export interface RateAnalysis {
  readonly ok: true;
  /** signed OLS slope m (metres per second) */
  readonly slopeMetersPerSecond: number;
  /** OLS intercept b at absolute t = 0 (metres) */
  readonly interceptMeters: number;
  /** coefficient of determination, clamped to [0, 1] */
  readonly rSquared: number;
  /** |m| */
  readonly speedMetersPerSecond: number;
  /** |m| × MPH_PER_MPS */
  readonly speedMilesPerHour: number;
  readonly direction: MotionDirection;
  /** samples used in the fit */
  readonly sampleCount: number;
}

export interface RateAnalysisFailure {
  readonly ok: false;
  readonly reason: string;
}

export type RateAnalysisResult = RateAnalysis | RateAnalysisFailure;

/** Exact conversion, centralized so every surface agrees. 1 m/s in mph. */
export const MPH_PER_MPS = 2.2369362920544;

/** |slope| strictly below this reads as "not moving". */
export const STATIONARY_SPEED_MPS = 0.05;

const MIN_DURATION_S = 1e-6;

/** normalize -0 and tiny float dust to 0 */
function tidy(v: number): number {
  return Object.is(v, -0) ? 0 : v;
}

function directionOf(slope: number): MotionDirection {
  if (Math.abs(slope) < STATIONARY_SPEED_MPS) return "stationary";
  return slope > 0 ? "away" : "toward";
}

export function analyzeRate(run: MotionRun, window: AnalysisWindow): RateAnalysisResult {
  const samples = activeSamples(window, run);
  const n = samples.length;

  if (n < 2) {
    return { ok: false, reason: "Select at least two samples over a bit of time to measure speed." };
  }
  for (const s of samples) {
    if (!Number.isFinite(s.timestampSeconds) || !Number.isFinite(s.positionMeters)) {
      return { ok: false, reason: "These samples don't have valid timestamps." };
    }
  }
  for (let i = 1; i < n; i++) {
    if (samples[i]!.timestampSeconds < samples[i - 1]!.timestampSeconds) {
      return { ok: false, reason: "These samples don't have valid timestamps." };
    }
  }
  if (windowDurationSeconds(window) < MIN_DURATION_S) {
    return { ok: false, reason: "Select a longer stretch of time to measure speed." };
  }

  // OLS of y = m·t + b, sums taken against a shifted origin t0 for conditioning.
  const t0 = samples[0]!.timestampSeconds;
  let Sx = 0;
  let Sy = 0;
  let Sxx = 0;
  let Sxy = 0;
  for (const s of samples) {
    const x = s.timestampSeconds - t0;
    const y = s.positionMeters;
    Sx += x;
    Sy += y;
    Sxx += x * x;
    Sxy += x * y;
  }
  const denom = n * Sxx - Sx * Sx;
  if (!(denom > 0)) {
    return { ok: false, reason: "Select a longer stretch of time to measure speed." };
  }

  const slope = (n * Sxy - Sx * Sy) / denom;
  const bShifted = (Sy - slope * Sx) / n; // intercept at t = t0
  const intercept = bShifted - slope * t0; // re-expressed at absolute t = 0

  const meanY = Sy / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const s of samples) {
    const pred = slope * (s.timestampSeconds - t0) + bShifted;
    ssTot += (s.positionMeters - meanY) ** 2;
    ssRes += (s.positionMeters - pred) ** 2;
  }
  const rSquared = ssTot <= 0 ? 1 : Math.max(0, Math.min(1, 1 - ssRes / ssTot));

  const speedMps = Math.abs(slope);

  return {
    ok: true,
    slopeMetersPerSecond: tidy(slope),
    interceptMeters: tidy(intercept),
    rSquared: tidy(rSquared),
    speedMetersPerSecond: tidy(speedMps),
    speedMilesPerHour: tidy(speedMps * MPH_PER_MPS),
    direction: directionOf(slope),
    sampleCount: n,
  };
}
