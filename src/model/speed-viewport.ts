import type { AnalysisWindow } from "./analysis-window.js";

/**
 * Speed Lab's **graph viewport** — presentation only. It is a third concept,
 * kept separate from the immutable `MotionRun` and from the `AnalysisWindow`
 * used for the OLS speed calculation. Changing the viewport never touches raw
 * samples, the selected window, or any result.
 *
 *   "full"   — the whole run is visible (the default)
 *   "window" — the graph is zoomed to the selected AnalysisWindow
 */
export type SpeedViewportMode = "full" | "window";

export interface SpeedViewport {
  readonly mode: SpeedViewportMode;
}

export type SpeedViewportEvent =
  | { readonly type: "zoom-to-window" }
  | { readonly type: "full-run" }
  /** the window just became the whole run (Use All) */
  | { readonly type: "use-all" }
  /** a new acquisition / a different saved run / a source change */
  | { readonly type: "run-changed" };

export function initialViewport(): SpeedViewport {
  return { mode: "full" };
}

/** Pure reducer — returns the same object when nothing changes. */
export function reduceViewport(vp: SpeedViewport, event: SpeedViewportEvent): SpeedViewport {
  switch (event.type) {
    case "zoom-to-window":
      return vp.mode === "window" ? vp : { mode: "window" };
    case "full-run":
    case "use-all":
    case "run-changed":
      return vp.mode === "full" ? vp : { mode: "full" };
  }
}

const MIN_X_SPAN_SECONDS = 1e-3;

/**
 * The x viewport for zoom mode: exactly the AnalysisWindow. Widened only if the
 * interval is effectively zero, so the chart never scales against a zero span.
 */
export function zoomedXDomain(window: AnalysisWindow): [number, number] {
  const a = window.startSeconds;
  const b = window.endSeconds;
  if (b - a >= MIN_X_SPAN_SECONDS) return [a, b];
  const mid = (a + b) / 2;
  return [mid - MIN_X_SPAN_SECONDS / 2, mid + MIN_X_SPAN_SECONDS / 2];
}

/**
 * A minimum visible vertical span (metres) so nearly-constant motion doesn't
 * render as a flat line filling the whole plot.
 */
export const MIN_ZOOM_Y_SPAN_METERS = 0.3;

/**
 * The y viewport for zoom mode, derived from the measured positions inside the
 * selected interval (optionally plus the OLS line's endpoint y-values). Pure —
 * the input array is never mutated. Always finite; never NaN / Infinity.
 */
export function zoomedYDomain(positions: readonly number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of positions) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === Infinity) return [-MIN_ZOOM_Y_SPAN_METERS / 2, MIN_ZOOM_Y_SPAN_METERS / 2];

  if (hi - lo < MIN_ZOOM_Y_SPAN_METERS) {
    const mid = (lo + hi) / 2;
    lo = mid - MIN_ZOOM_Y_SPAN_METERS / 2;
    hi = mid + MIN_ZOOM_Y_SPAN_METERS / 2;
  }

  const pad = Math.max((hi - lo) * 0.12, 0.02);
  return [lo - pad, hi + pad];
}
