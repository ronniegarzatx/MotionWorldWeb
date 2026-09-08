import type { AnalysisWindow } from "./analysis-window.js";
import { windowDurationSeconds } from "./analysis-window.js";
import type { MotionRun } from "./motion-run.js";
import { positionAt } from "./run-interpolation.js";

/**
 * The two-point ("rise over run") slope across the selected interval, using the
 * measured position at each window boundary. Speed Lab shows this ONLY inside
 * the teaching overlay as the intuitive idea — the headline speed is the OLS
 * best-fit slope (`rate-analysis.ts`). Pure; never mutates the run.
 */
export interface EndpointSlope {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly startMeters: number;
  readonly endMeters: number;
  readonly deltaSeconds: number;
  readonly deltaMeters: number;
  readonly slopeMetersPerSecond: number;
}

const MIN_DURATION_S = 1e-6;

export function endpointSlope(run: MotionRun, window: AnalysisWindow): EndpointSlope | null {
  const deltaSeconds = windowDurationSeconds(window);
  if (deltaSeconds < MIN_DURATION_S) return null;

  const startMeters = positionAt(run, window.startSeconds);
  const endMeters = positionAt(run, window.endSeconds);
  const deltaMeters = endMeters - startMeters;

  return {
    startSeconds: window.startSeconds,
    endSeconds: window.endSeconds,
    startMeters,
    endMeters,
    deltaSeconds,
    deltaMeters,
    slopeMetersPerSecond: deltaMeters / deltaSeconds,
  };
}
