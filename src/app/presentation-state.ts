import type { AcquisitionUiState } from "../acquisition/acquisition-controller.js";
import type { MotionRun } from "../model/motion-run.js";
import type { Route } from "./router.js";

/**
 * A single serializable object describing "what the projector shows right now"
 * (parent spec §10). Web V1 writes **no** networking — this only enforces the
 * "compute state in one place, as a plain object" discipline so a future
 * student-view feature could be added without a rewrite. No class instances, no
 * DOM nodes, no functions.
 */
export interface PresentationState {
  readonly activeTool: Route;
  readonly connected: boolean;
  readonly acquisitionState: AcquisitionUiState["state"];
  readonly collecting: boolean;
  readonly activeRunId: string | null;
  readonly derivedReadouts: Readonly<Record<string, string>>;
  readonly revision: number;
}

export function computePresentationState(
  route: Route,
  ui: AcquisitionUiState,
  run: MotionRun | null,
  liveSample: { readonly timestampSeconds: number; readonly positionMeters: number } | null,
  revision: number,
): PresentationState {
  const readouts: Record<string, string> = {};
  if (liveSample) {
    readouts["position"] = `${liveSample.positionMeters.toFixed(3)} m`;
    readouts["time"] = `${liveSample.timestampSeconds.toFixed(3)} s`;
  } else if (run && run.sampleCount > 0) {
    const last = run.samples[run.sampleCount - 1]!;
    readouts["position"] = `${last.positionMeters.toFixed(3)} m`;
    readouts["time"] = `${last.timestampSeconds.toFixed(3)} s`;
    readouts["samples"] = String(run.sampleCount);
  }

  return {
    activeTool: route,
    connected: ui.connected,
    acquisitionState: ui.state,
    collecting: ui.state === "MEASURING",
    activeRunId: run?.id ?? null,
    derivedReadouts: readouts,
    revision,
  };
}
