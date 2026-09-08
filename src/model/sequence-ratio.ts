import { median } from "./cycle-analysis.js";

/**
 * The common-ratio estimate shared by Bounce (successive heights) and Pendulum
 * amplitude (successive turning-point amplitudes). Real physical data is never
 * perfectly geometric — this reports a robust central ratio and an honest
 * "consistent vs varies" verdict, never a forced classification.
 */

/** Provisional relative tolerance — real hardware testing may tune this. */
export const RATIO_TOLERANCE = 0.18;

/** Terms at or below this are treated as zero denominators and skipped. */
export const RATIO_EPS = 1e-4;

export interface RatioResult {
  /** median of the valid consecutive ratios; null when fewer than two exist */
  readonly ratio: number | null;
  readonly ratios: readonly number[];
  /** every ratio within RATIO_TOLERANCE (relative) of the median */
  readonly consistent: boolean;
  readonly usableTermCount: number;
}

export function sequenceRatio(terms: readonly number[]): RatioResult {
  const ratios: number[] = [];
  let usable = 0;
  for (let i = 0; i < terms.length - 1; i++) {
    const a = terms[i]!;
    const b = terms[i + 1]!;
    if (Math.abs(a) <= RATIO_EPS) continue;
    ratios.push(b / a);
    usable++;
  }
  if (ratios.length < 2) {
    return {
      ratio: ratios.length === 1 ? ratios[0]! : null,
      ratios,
      consistent: false,
      usableTermCount: usable,
    };
  }
  const ratio = median(ratios);
  const consistent =
    Math.abs(ratio) > RATIO_EPS &&
    ratios.every((r) => Math.abs(r - ratio) <= RATIO_TOLERANCE * Math.abs(ratio));
  return { ratio, ratios, consistent, usableTermCount: usable };
}
