import type { WalkTarget } from "../../model/walk-target.js";
import { buildPathD, makeScale } from "../chart/time-series-chart.js";

/**
 * A pure `d` string for a miniature target thumbnail (no axes) inside a
 * `w × h` box with `pad` inset. Reuses the chart's scale/path geometry.
 */
export function targetPreviewPathD(
  target: WalkTarget,
  w: number,
  h: number,
  pad = 4,
): string {
  const t = target.points.map((p) => p.timeSeconds);
  const x = target.points.map((p) => p.positionMeters);
  const xScale = makeScale([0, target.durationSeconds], [pad, w - pad]);
  // SVG y grows downward — map the top of the position range to the top of the box
  const yScale = makeScale(target.positionRange, [h - pad, pad]);
  return buildPathD({ t, x }, xScale, yScale);
}
