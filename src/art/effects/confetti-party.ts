import type { ArtSignal } from "../../model/art-signal.js";
import type { ArtDimensions, ArtEffect, ArtFrame } from "../art-types.js";
import { clamp01, paintOpaqueBackground, withAlpha } from "../canvas-utils.js";
import { pickPalette, type ArtPalette } from "../palettes.js";
import type { SeededRandom } from "../seeded-random.js";

const MAX_CONFETTI = 180;
const BACKDROP = "#0a0410";

interface Piece {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly born: number;
  readonly life: number;
  readonly color: string;
  readonly size: number;
  readonly rotation: number;
  readonly rotSpeed: number;
}

/**
 * Celebratory falling confetti. Position -> emission center. Speed ->
 * density/movement. Impulse -> a burst. Stillness -> slow floating pieces
 * instead of a frozen frame. Hard-capped at MAX_CONFETTI.
 */
export function createConfettiPartyEffect(): ArtEffect {
  let rng: SeededRandom;
  let palette: ArtPalette;
  let pieces: Piece[] = [];

  function reset(seededRandom: SeededRandom): void {
    rng = seededRandom;
    palette = pickPalette(rng);
    pieces = [];
  }

  function spawnOne(x: number, y: number, speedScale: number): Piece {
    const angle = rng.range(-Math.PI * 0.75, -Math.PI * 0.25); // upward-ish burst
    const speed = rng.range(60, 160) * speedScale;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      born: 0,
      life: rng.range(1.2, 2.4),
      color: rng.pick(palette.colors),
      size: rng.range(4, 9),
      rotation: rng.range(0, Math.PI * 2),
      rotSpeed: rng.range(-4, 4),
    };
  }

  function render(ctx: CanvasRenderingContext2D, frame: ArtFrame, signal: ArtSignal, dims: ArtDimensions): void {
    const motion = frame.reducedMotion ? 0.4 : 1;
    paintOpaqueBackground(ctx, dims.width, dims.height, BACKDROP);

    const originX = dims.width * (0.2 + signal.position01 * 0.6);
    const originY = dims.height * 0.7;

    const ambientSpawn = Math.round((0.5 + signal.speed01 * 3) * motion * (1 - signal.stillness * 0.6));
    for (let i = 0; i < ambientSpawn && pieces.length < MAX_CONFETTI; i++) {
      pieces.push({ ...spawnOne(originX, originY, 0.6), born: frame.elapsedSeconds });
    }
    if (frame.impulseTriggered) {
      const burst = Math.round(35 * motion);
      for (let i = 0; i < burst && pieces.length < MAX_CONFETTI; i++) {
        pieces.push({ ...spawnOne(originX, originY, 1.6), born: frame.elapsedSeconds });
      }
    }

    const gravity = 90 * motion;
    const next: Piece[] = [];
    for (const p of pieces) {
      const age = frame.elapsedSeconds - p.born;
      if (age > p.life) continue;
      const x = p.x + p.vx * age;
      const y = p.y + p.vy * age + 0.5 * gravity * age * age;
      const alpha = clamp01(1 - age / p.life);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rotation + p.rotSpeed * age);
      ctx.fillStyle = withAlpha(p.color, alpha);
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      ctx.restore();
      next.push(p);
    }
    pieces = next;
  }

  return { name: "Confetti Party", reset, render };
}
