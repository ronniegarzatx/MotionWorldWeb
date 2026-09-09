import type { ArtSignal } from "../../model/art-signal.js";
import type { ArtDimensions, ArtEffect, ArtFrame } from "../art-types.js";
import { paintOpaqueBackground, withAlpha } from "../canvas-utils.js";
import { pickPalette } from "../palettes.js";
import type { SeededRandom } from "../seeded-random.js";

const BAND_COUNT = 5; // fixed — not a growing array
const BACKDROP = "#04070c";

interface Band {
  readonly color: string;
  readonly baseY: number;
  readonly freq: number;
  readonly phaseOffset: number;
}

/**
 * Multiple smooth traveling bands. Position -> phase/vertical placement.
 * Speed -> amplitude and flow rate. Direction -> which way the waves travel.
 * Stillness -> calmer, flatter waves.
 */
export function createWaveFieldEffect(): ArtEffect {
  let bands: Band[] = [];
  let phase = 0;

  function reset(rng: SeededRandom): void {
    const palette = pickPalette(rng);
    bands = Array.from({ length: BAND_COUNT }, (_, i) => ({
      color: rng.pick(palette.colors),
      baseY: (i + 1) / (BAND_COUNT + 1),
      freq: rng.range(1.5, 3.5),
      phaseOffset: rng.range(0, Math.PI * 2),
    }));
    phase = rng.range(0, Math.PI * 2);
  }

  function render(ctx: CanvasRenderingContext2D, frame: ArtFrame, signal: ArtSignal, dims: ArtDimensions): void {
    const motion = frame.reducedMotion ? 0.4 : 1;
    paintOpaqueBackground(ctx, dims.width, dims.height, BACKDROP);

    const flowRate = (0.3 + signal.speed01 * 1.2) * motion * (signal.direction || 1);
    phase += frame.dtSeconds * flowRate;
    const amplitude = dims.height * (0.03 + signal.speed01 * 0.05) * (1 - signal.stillness * 0.5);
    const step = Math.max(4, Math.floor(dims.width / 120));

    for (const band of bands) {
      ctx.beginPath();
      for (let x = 0; x <= dims.width; x += step) {
        const y =
          dims.height * band.baseY +
          Math.sin(x * 0.01 * band.freq + phase + band.phaseOffset) * amplitude * (1 + signal.energy * 0.4);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = withAlpha(band.color, 0.55 + signal.energy * 0.25);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  return { name: "Wave Field", reset, render };
}
