/**
 * Scatter-plot literacy bridge for Sequence Lab: given the same n-vs-value
 * terms already on screen, judge the relationship the way a stats-lite
 * algebra worksheet does — Pearson r, direction, strength, a best-fit line,
 * and (when values are positive) an exponential comparison to decide
 * linear / exponential / neither. Pure, no DOM; not used outside Sequence Lab.
 */

import { coefficientOfVariation } from "./cycle-analysis.js";

export interface ScatterPoint {
  readonly x: number;
  readonly y: number;
}

export interface LinearFit {
  readonly slope: number;
  readonly intercept: number;
  readonly rSquared: number;
}

export interface ExponentialFit {
  readonly a: number; // y = a · b^x
  readonly b: number;
  readonly rSquared: number; // computed in the ORIGINAL y-space, not log-space
}

export type ScatterDirection = "positive" | "negative" | "none";
export type ScatterStrength = "strong" | "moderate" | "weak" | "none";
export type ScatterBestModel = "linear" | "exponential" | "neither";

export interface ScatterFit {
  readonly count: number;
  readonly r: number;
  readonly direction: ScatterDirection;
  readonly strength: ScatterStrength;
  readonly linear: LinearFit;
  /** null when any y ≤ 0 — an exponential model isn't defined there. */
  readonly exponential: ExponentialFit | null;
  readonly bestModel: ScatterBestModel;
}

export const MIN_SCATTER_POINTS = 3;

const STRONG_R = 0.8;
const MODERATE_R = 0.5;
/** Neither model is worth calling "best" below this r² (|r| < ~0.5 either way). */
const NEITHER_R2 = 0.25;
/** Exponential must beat linear by this much r² to be preferred over the simpler model. */
const EXP_MARGIN = 0.02;
/** Below this relative spread (std/mean), y is practically flat: r² becomes
 *  numerically unstable there (ssTot≈0), so skip the r² race and call it linear. */
const FLAT_CV = 0.02;

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function pearsonR(xs: readonly number[], ys: readonly number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 1e-12 || syy <= 1e-12) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

function ols(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number } {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  const slope = sxx > 1e-12 ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx };
}

function rSquaredOf(ys: readonly number[], predicted: readonly number[]): number {
  const my = mean(ys);
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < ys.length; i++) {
    ssTot += (ys[i]! - my) ** 2;
    ssRes += (ys[i]! - predicted[i]!) ** 2;
  }
  if (ssTot <= 1e-12) return ssRes <= 1e-12 ? 1 : 0;
  return 1 - ssRes / ssTot;
}

function linearRegression(xs: readonly number[], ys: readonly number[]): LinearFit {
  const { slope, intercept } = ols(xs, ys);
  // NOT r² from pearsonR: when y has ~zero variance a flat line still fits
  // perfectly (ssRes≈0) even though Pearson r is conventionally 0 there.
  // Scoring must agree with exponentialRegression's rSquaredOf so a tie
  // between two perfect fits resolves to the simpler model, not "exponential".
  const predicted = xs.map((x) => slope * x + intercept);
  return { slope, intercept, rSquared: rSquaredOf(ys, predicted) };
}

function exponentialRegression(xs: readonly number[], ys: readonly number[]): ExponentialFit | null {
  if (!ys.every((y) => y > 1e-9)) return null;
  const { slope: lnB, intercept: lnA } = ols(xs, ys.map(Math.log));
  const a = Math.exp(lnA);
  const b = Math.exp(lnB);
  const predicted = xs.map((x) => a * Math.pow(b, x));
  return { a, b, rSquared: rSquaredOf(ys, predicted) };
}

function classifyDirection(r: number): ScatterDirection {
  if (!Number.isFinite(r) || Math.abs(r) < 1e-6) return "none";
  return r > 0 ? "positive" : "negative";
}

function classifyStrength(r: number): ScatterStrength {
  const a = Math.abs(r);
  if (!Number.isFinite(r) || a < 1e-6) return "none";
  if (a >= STRONG_R) return "strong";
  if (a >= MODERATE_R) return "moderate";
  return "weak";
}

function classifyBestModel(
  linear: LinearFit,
  exponential: ExponentialFit | null,
  ys: readonly number[],
): ScatterBestModel {
  const linR2 = linear.rSquared;
  const expR2 = exponential?.rSquared ?? -Infinity;
  if (Math.max(linR2, expR2) < NEITHER_R2) return "neither";
  // Practically flat y: a flat line already describes it, and an exponential
  // with b≈1 is the same claim with an extra parameter — don't let r², which
  // is numerically unstable when ssTot≈0, hand this to "exponential" instead.
  if (coefficientOfVariation(ys) < FLAT_CV) return "linear";
  return expR2 > linR2 + EXP_MARGIN ? "exponential" : "linear";
}

/** null when there are fewer than MIN_SCATTER_POINTS usable points. */
export function fitScatter(points: readonly ScatterPoint[]): ScatterFit | null {
  if (points.length < MIN_SCATTER_POINTS) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const r = pearsonR(xs, ys);
  const linear = linearRegression(xs, ys);
  const exponential = exponentialRegression(xs, ys);
  return {
    count: points.length,
    r,
    direction: classifyDirection(r),
    strength: classifyStrength(r),
    linear,
    exponential,
    bestModel: classifyBestModel(linear, exponential, ys),
  };
}
