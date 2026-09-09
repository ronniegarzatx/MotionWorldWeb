import type { ArtSignal } from "../../model/art-signal.js";
import type { ArtDimensions, ArtEffect, ArtFrame } from "../art-types.js";
import { paintOpaqueBackground, withAlpha } from "../canvas-utils.js";
import { pickPalette, type ArtPalette } from "../palettes.js";
import type { SeededRandom } from "../seeded-random.js";

const BACKDROP = "#030308";
// `symmetry` is drawn from rng.int(5, 10) in reset() — always well under any
// reasonable per-frame draw-call ceiling, so no separate cap constant is needed.

/**
 * A kaleidoscope-ish radial polygonal field — mirrored wedges around a
 * center, not literal image kaleidoscope processing. Position -> overall
 * scale. Direction -> rotation direction. Energy -> rotation speed and
 * pulse intensity (an impulse briefly pulses the wedges outward).
 */
export function createRadialGeometryEffect(): ArtEffect {
  let palette: ArtPalette;
  let symmetry = 6;
  let rotation = 0;

  function reset(rng: SeededRandom): void {
    palette = pickPalette(rng);
    symmetry = rng.int(5, 10); // < MAX_SYMMETRY
    rotation = rng.range(0, Math.PI * 2);
  }

  function render(ctx: CanvasRenderingContext2D, frame: ArtFrame, signal: ArtSignal, dims: ArtDimensions): void {
    const motion = frame.reducedMotion ? 0.4 : 1;
    paintOpaqueBackground(ctx, dims.width, dims.height, BACKDROP);

    rotation += frame.dtSeconds * (0.15 + signal.energy * 0.6) * (signal.direction || 1) * motion;
    const cx = dims.width / 2;
    const cy = dims.height / 2;
    const maxRadius = Math.min(dims.width, dims.height) * 0.45 * (0.55 + signal.position01 * 0.55);
    const pulse = frame.impulseTriggered ? 1.25 : 1;

    for (let i = 0; i < symmetry; i++) {
      const angle = rotation + (i / symmetry) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.beginPath();
      const inner = maxRadius * 0.28 * pulse;
      const outer = maxRadius * pulse;
      ctx.moveTo(0, 0);
      ctx.lineTo(outer * Math.cos(0.16), outer * Math.sin(0.16));
      ctx.lineTo(inner, 0);
      ctx.lineTo(outer * Math.cos(-0.16), outer * Math.sin(-0.16));
      ctx.closePath();
      ctx.fillStyle = withAlpha(palette.colors[i % palette.colors.length]!, 0.45 + signal.energy * 0.35);
      ctx.fill();
      ctx.restore();
    }
  }

  return { name: "Radial Geometry", reset, render };
}
