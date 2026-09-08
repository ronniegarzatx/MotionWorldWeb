import {
  fullWindow,
  useAll as useAllWindow,
  withRange,
  type AnalysisWindow,
} from "./analysis-window.js";
import { endpointSlope, type EndpointSlope } from "./endpoint-slope.js";
import type { MotionRun } from "./motion-run.js";
import { analyzeRate, type RateAnalysisResult } from "./rate-analysis.js";
import {
  DEFAULT_SPEED_LIMIT_MPH,
  compareToSpeedLimit,
  type SpeedLimitComparison,
} from "./speed-limit.js";

/**
 * Pure Speed Lab workspace state. Session-only; the source `MotionRun` is never
 * mutated and nothing here is persisted. Every transition recomputes the derived
 * analysis / comparison / endpoint so the view (which renders purely from this)
 * can never show a stale speed.
 */
export interface SpeedWorkspace {
  readonly run: MotionRun;
  readonly window: AnalysisWindow;
  readonly limitMph: number;
  readonly analysis: RateAnalysisResult;
  readonly comparison: SpeedLimitComparison | null;
  readonly endpoint: EndpointSlope | null;
}

function derive(run: MotionRun, window: AnalysisWindow, limitMph: number): SpeedWorkspace {
  const analysis = analyzeRate(run, window);
  return {
    run,
    window,
    limitMph,
    analysis,
    comparison: analysis.ok ? compareToSpeedLimit(analysis.speedMilesPerHour, limitMph) : null,
    endpoint: endpointSlope(run, window),
  };
}

export function startSpeedWorkspace(run: MotionRun): SpeedWorkspace {
  return derive(run, fullWindow(run), DEFAULT_SPEED_LIMIT_MPH);
}

export function setSpeedWindow(
  ws: SpeedWorkspace,
  startSeconds: number,
  endSeconds: number,
): SpeedWorkspace {
  return derive(ws.run, withRange(ws.window, ws.run, startSeconds, endSeconds), ws.limitMph);
}

export function useAllSpeed(ws: SpeedWorkspace): SpeedWorkspace {
  return derive(ws.run, useAllWindow(ws.window, ws.run), ws.limitMph);
}

export function setSpeedLimit(ws: SpeedWorkspace, limitMph: number): SpeedWorkspace {
  if (limitMph === ws.limitMph) return ws;
  return {
    ...ws,
    limitMph,
    comparison: ws.analysis.ok
      ? compareToSpeedLimit(ws.analysis.speedMilesPerHour, limitMph)
      : null,
  };
}

/** Swap in a different source run (Open in Speed Lab) — full reset. */
export function withSpeedRun(ws: SpeedWorkspace, run: MotionRun): SpeedWorkspace {
  if (run.id === ws.run.id) return ws;
  return startSpeedWorkspace(run);
}
