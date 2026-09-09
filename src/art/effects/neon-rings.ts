import type { ArtSignal } from "../../model/art-signal.js";
import type { ArtDimensions, ArtEffect, ArtFrame } from "../art-types.js";
import { clamp01, paintOpaqueBackground, withAlpha } from "../canvas-utils.js";
import { pickPalette, type ArtPalette } from "../palettes.js";
import type { SeededRandom } from "../seeded-random.js";

const MAX_RINGS = 24;
const BACKDROP = "#05060a";

interface Ring {
  readonly born: number;
  readonly color: string;
  readonly strokeWidth: number;
}

/**
 * Concentric radiating circles. Position -> ring-origin bias. Speed -> how
 * fast rings expand. Impulse -> a new ring is emitted. Direction -> a slow
 * rotational drift sense of the whole field.
 */
export function createNeonRingsEffect(): ArtEffect {
  let rng: SeededRandom;
  let palette: ArtPalette;
  let rings: Ring[] = [];
  let rotation = 0;

  function reset(seededRandom: SeededRandom): void {
    rng = seededRandom;
    palette = pickPalette(rng);
    rings = [];
    rotation = rng.range(0, Math.PI * 2);
  }

  function render(ctx: CanvasRenderingContext2D, frame: ArtFrame, signal: ArtSignal, dims: ArtDimensions): void {
    const motion = frame.reducedMotion ? 0.4 : 1;
    paintOpaqueBackground(ctx, dims.width, dims.height, BACKDROP);

    rotation += frame.dtSeconds * (0.08 + signal.energy * 0.3) * (signal.direction || 1) * motion;

    if (frame.impulseTriggered) {
      rings.push({ born: frame.elapsedSeconds, color: rng.pick(palette.colors), strokeWidth: rng.range(2, 5) });
      if (rings.length > MAX_RINGS) rings.shift();
    }

    const maxDim = Math.max(dims.width, dims.height);
    const cx = dims.width * (0.3 + signal.position01 * 0.4 + 0.08 * Math.sin(rotation));
    const cy = dims.height * (0.5 + 0.08 * Math.cos(rotation));
    const expansionSpeed = maxDim * (0.12 + signal.speed01 * 0.45) * motion;

    for (const ring of rings) {
      const age = frame.elapsedSeconds - ring.born;
      const radius = age * expansionSpeed;
      const alpha = clamp01(1 - radius / (maxDim * 0.9));
      if (alpha <= 0) continue;
      ctx.beginPath();
      ctx.strokeStyle = withAlpha(ring.color, alpha);
      ctx.lineWidth = ring.strokeWidth;
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // one ambient ring keeps the idle state alive before any impulse fires
    const ambientRadius = maxDim * (0.15 + 0.05 * Math.sin(frame.elapsedSeconds * 0.6 * motion));
    ctx.beginPath();
    ctx.strokeStyle = withAlpha(palette.colors[0]!, 0.35 + signal.energy * 0.25);
    ctx.lineWidth = 2;
    ctx.arc(cx, cy, ambientRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  return { name: "Neon Rings", reset, render };
}
