import type { ArtSignal } from "../../model/art-signal.js";
import type { ArtDimensions, ArtEffect, ArtFrame } from "../art-types.js";
import { clamp01, paintOpaqueBackground, withAlpha } from "../canvas-utils.js";
import { pickPalette, type ArtPalette } from "../palettes.js";
import type { SeededRandom } from "../seeded-random.js";

const MAX_PARTICLES = 260;
const BACKDROP = "#020204";

interface Particle {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly born: number;
  readonly life: number;
  readonly color: string;
  readonly size: number;
}

/**
 * A bounded particle system. Position -> emission origin. Speed/energy ->
 * particle velocity and how many spawn. Direction -> the flow's bias.
 * Impulse -> a burst. Hard-capped at MAX_PARTICLES — never an unbounded array.
 */
export function createParticleBurstEffect(): ArtEffect {
  let rng: SeededRandom;
  let palette: ArtPalette;
  let particles: Particle[] = [];

  function reset(seededRandom: SeededRandom): void {
    rng = seededRandom;
    palette = pickPalette(rng);
    particles = [];
  }

  function spawnOne(x: number, y: number, direction: -1 | 0 | 1, speedScale: number): Particle {
    const angle = rng.range(0, Math.PI * 2);
    const baseSpeed = rng.range(30, 90) * speedScale;
    return {
      x,
      y,
      vx: Math.cos(angle) * baseSpeed + direction * baseSpeed * 0.5,
      vy: Math.sin(angle) * baseSpeed,
      born: 0, // set by the caller once elapsedSeconds is known
      life: rng.range(0.6, 1.4),
      color: rng.pick(palette.colors),
      size: rng.range(1.5, 4),
    };
  }

  function render(ctx: CanvasRenderingContext2D, frame: ArtFrame, signal: ArtSignal, dims: ArtDimensions): void {
    const motion = frame.reducedMotion ? 0.4 : 1;
    paintOpaqueBackground(ctx, dims.width, dims.height, BACKDROP);

    const originX = dims.width * (0.15 + signal.position01 * 0.7);
    const originY = dims.height * 0.55;

    const ambientSpawn = Math.round(signal.energy * 6 * motion);
    for (let i = 0; i < ambientSpawn && particles.length < MAX_PARTICLES; i++) {
      particles.push({ ...spawnOne(originX, originY, signal.direction, 1), born: frame.elapsedSeconds });
    }
    if (frame.impulseTriggered) {
      const burstCount = Math.round(40 * motion);
      for (let i = 0; i < burstCount && particles.length < MAX_PARTICLES; i++) {
        particles.push({ ...spawnOne(originX, originY, signal.direction, 3), born: frame.elapsedSeconds });
      }
    }

    const next: Particle[] = [];
    for (const p of particles) {
      const age = frame.elapsedSeconds - p.born;
      if (age > p.life || age < 0) continue;
      const x = p.x + p.vx * age;
      const y = p.y + p.vy * age;
      const alpha = clamp01(1 - age / p.life);
      ctx.beginPath();
      ctx.fillStyle = withAlpha(p.color, alpha);
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
      next.push(p);
    }
    particles = next;
  }

  return { name: "Particle Burst", reset, render };
}
