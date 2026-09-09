import type { ArtSignal } from "../../model/art-signal.js";
import type { ArtDimensions, ArtEffect, ArtFrame } from "../art-types.js";
import { withAlpha } from "../canvas-utils.js";
import { pickOtherColor, pickPalette, type ArtPalette } from "../palettes.js";
import type { SeededRandom } from "../seeded-random.js";

const LAYER_COUNT = 3; // fixed, small — soft radial layers drifting behind the main wash

interface Layer {
  readonly color: string;
  readonly radiusScale: number;
  readonly speed: number;
  readonly phase: number;
}

/**
 * Large smooth shifting color fields. Position -> the wash's spatial center.
 * Movement -> how fast the color transitions/drifts. Stillness -> a slow
 * breathing pulse instead of a static image.
 */
export function createColorWashEffect(): ArtEffect {
  let palette: ArtPalette;
  let colorA = "#000000";
  let colorB = "#000000";
  let layers: Layer[] = [];
  let driftPhase = 0;

  function reset(rng: SeededRandom): void {
    palette = pickPalette(rng);
    colorA = rng.pick(palette.colors);
    colorB = pickOtherColor(rng, palette, colorA);
    layers = Array.from({ length: LAYER_COUNT }, () => ({
      color: rng.pick(palette.colors),
      radiusScale: rng.range(0.4, 0.9),
      speed: rng.range(0.15, 0.4),
      phase: rng.range(0, Math.PI * 2),
    }));
    driftPhase = rng.range(0, Math.PI * 2);
  }

  function render(ctx: CanvasRenderingContext2D, frame: ArtFrame, signal: ArtSignal, dims: ArtDimensions): void {
    const motion = frame.reducedMotion ? 0.35 : 1;
    driftPhase += frame.dtSeconds * (0.1 + signal.energy * 0.5) * motion;

    const cx = dims.width * (0.2 + signal.position01 * 0.6);
    const cy = dims.height * 0.5;
    const breathe = 0.5 + 0.5 * Math.sin(frame.elapsedSeconds * (0.5 + signal.stillness * 0.35) * motion);
    const radius = Math.max(dims.width, dims.height) * (0.75 + breathe * 0.25 * (1 + signal.energy * 0.6));

    const main = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    const mix = 0.5 + 0.5 * Math.sin(driftPhase);
    main.addColorStop(0, withAlpha(mix > 0.5 ? colorA : colorB, 0.95));
    main.addColorStop(1, withAlpha(mix > 0.5 ? colorB : colorA, 0.2));
    ctx.fillStyle = main;
    ctx.fillRect(0, 0, dims.width, dims.height);

    for (const layer of layers) {
      const lx = dims.width * (0.5 + 0.32 * Math.sin(driftPhase * layer.speed + layer.phase));
      const ly = dims.height * (0.5 + 0.32 * Math.cos(driftPhase * layer.speed * 0.8 + layer.phase));
      const lr = radius * layer.radiusScale;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      g.addColorStop(0, withAlpha(layer.color, 0.22 + signal.energy * 0.18));
      g.addColorStop(1, withAlpha(layer.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, dims.width, dims.height);
    }
  }

  return { name: "Color Wash", reset, render };
}
