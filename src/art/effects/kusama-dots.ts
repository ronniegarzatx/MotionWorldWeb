import type { ArtSignal } from "../../model/art-signal.js";
import type { ArtDimensions, ArtEffect, ArtFrame } from "../art-types.js";
import { clamp01, paintOpaqueBackground, withAlpha } from "../canvas-utils.js";
import type { SeededRandom } from "../seeded-random.js";

// Fixed at reset() — a polka-dot FIELD, not a growing array. sqrt(GRID_DOT_COUNT)
// is used to lay dots out on a jittered grid rather than pure scatter, so it
// reads as a repeating pattern (Kusama's signature) rather than confetti.
const GRID_DOT_COUNT = 130;
// Impulse-triggered "extra dot" bursts — capped, evicts oldest over the cap.
const MAX_BURST_DOTS = 40;
const BURST_LIFE_SECONDS = 1.1;

// The app's own Kusama Dots THEME uses this exact red/cream/black family
// (see src/styles/themes.css) — this effect deliberately reuses it so the
// name means the same thing in both places.
const BACKDROP = "#fffdf9";
const DOT_COLORS = ["#d0342c", "#241c17"] as const;
const BURST_COLOR = "#d0342c";

interface GridDot {
  readonly u: number; // normalized [0,1] position
  readonly v: number;
  readonly baseRadius: number;
  readonly color: string;
  readonly phase: number;
}

interface BurstDot {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly born: number;
}

/**
 * A field of polka dots in Kusama's signature red/cream/black palette —
 * calm and pattern-like rather than explosive, distinct from the particle/
 * ring/confetti families. Position -> the field's overall scale. Energy ->
 * how fast dots breathe and how much they sway. Direction -> a slow overall
 * drift. Impulse -> a small cluster of extra dots pops in and fades.
 */
export function createKusamaDotsEffect(): ArtEffect {
  let rng: SeededRandom;
  let grid: GridDot[] = [];
  let bursts: BurstDot[] = [];
  let driftPhase = 0;

  function reset(seededRandom: SeededRandom): void {
    rng = seededRandom;
    driftPhase = rng.range(0, Math.PI * 2);
    bursts = [];

    const cols = Math.round(Math.sqrt(GRID_DOT_COUNT * 1.4)); // slightly wider than tall
    const rows = Math.max(1, Math.round(GRID_DOT_COUNT / cols));
    grid = [];
    for (let r = 0; r < rows && grid.length < GRID_DOT_COUNT; r++) {
      for (let c = 0; c < cols && grid.length < GRID_DOT_COUNT; c++) {
        const cellU = (c + 0.5) / cols;
        const cellV = (r + 0.5) / rows;
        grid.push({
          u: clamp01(cellU + rng.range(-0.35, 0.35) / cols),
          v: clamp01(cellV + rng.range(-0.35, 0.35) / rows),
          baseRadius: rng.range(8, 26),
          color: rng.pick(DOT_COLORS),
          phase: rng.range(0, Math.PI * 2),
        });
      }
    }
  }

  function render(ctx: CanvasRenderingContext2D, frame: ArtFrame, signal: ArtSignal, dims: ArtDimensions): void {
    const motion = frame.reducedMotion ? 0.4 : 1;
    paintOpaqueBackground(ctx, dims.width, dims.height, BACKDROP);

    driftPhase += frame.dtSeconds * (0.05 + signal.energy * 0.15) * (signal.direction || 1) * motion;
    const scaleBias = 0.8 + signal.position01 * 0.4;
    const sway = Math.min(dims.width, dims.height) * 0.012 * signal.energy * motion;

    for (const dot of grid) {
      const breathe = 0.5 + 0.5 * Math.sin(frame.elapsedSeconds * (0.5 + signal.energy * 1.1) * motion + dot.phase);
      const radius = dot.baseRadius * (0.55 + breathe * 0.55) * scaleBias;
      const x = dims.width * dot.u + Math.sin(driftPhase * 0.6 + dot.phase) * sway;
      const y = dims.height * dot.v + Math.cos(driftPhase * 0.6 + dot.phase) * sway;
      ctx.beginPath();
      ctx.fillStyle = dot.color;
      ctx.arc(x, y, Math.max(0, radius), 0, Math.PI * 2);
      ctx.fill();
    }

    if (frame.impulseTriggered) {
      const cx = dims.width * rng.range(0.15, 0.85);
      const cy = dims.height * rng.range(0.15, 0.85);
      const count = Math.round(10 * motion);
      for (let i = 0; i < count && bursts.length < MAX_BURST_DOTS; i++) {
        bursts.push({
          x: cx + rng.range(-1, 1) * dims.width * 0.08,
          y: cy + rng.range(-1, 1) * dims.height * 0.08,
          radius: rng.range(6, 20),
          born: frame.elapsedSeconds,
        });
      }
    }

    const nextBursts: BurstDot[] = [];
    for (const b of bursts) {
      const age = frame.elapsedSeconds - b.born;
      if (age > BURST_LIFE_SECONDS) continue;
      const alpha = clamp01(1 - age / BURST_LIFE_SECONDS);
      const grow = Math.min(1, age / 0.25);
      ctx.beginPath();
      ctx.fillStyle = withAlpha(BURST_COLOR, alpha);
      ctx.arc(b.x, b.y, b.radius * grow, 0, Math.PI * 2);
      ctx.fill();
      nextBursts.push(b);
    }
    bursts = nextBursts;
  }

  return { name: "Kusama Dots", reset, render };
}
