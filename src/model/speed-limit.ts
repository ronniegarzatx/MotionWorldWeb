/**
 * Speed Lab's speed-limit comparison. Pure, display-oriented, judgement-free —
 * it reports where a speed sits relative to a chosen limit. No scoring, no
 * pass/fail semantics.
 */

export const SPEED_LIMIT_PRESETS_MPH = [2, 5, 10] as const;
export const DEFAULT_SPEED_LIMIT_MPH = 5;

/** within this of the limit reads as "right at the limit" (no jittery 0.0 over) */
export const AT_TOLERANCE_MPH = 0.05;

export type SpeedLimitStanding = "under" | "over" | "at";

export interface SpeedLimitComparison {
  readonly limitMph: number;
  readonly speedMph: number;
  readonly standing: SpeedLimitStanding;
  /** always ≥ 0 — |speed − limit| */
  readonly marginMph: number;
}

export function compareToSpeedLimit(speedMph: number, limitMph: number): SpeedLimitComparison {
  const diff = speedMph - limitMph;
  const marginMph = Math.abs(diff);
  const standing: SpeedLimitStanding =
    marginMph < AT_TOLERANCE_MPH ? "at" : diff > 0 ? "over" : "under";
  return { limitMph, speedMph, standing, marginMph };
}
