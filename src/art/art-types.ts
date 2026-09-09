import type { ArtSignal } from "../model/art-signal.js";
import type { SeededRandom } from "./seeded-random.js";

export interface ArtDimensions {
  /** CSS pixels. */
  readonly width: number;
  /** CSS pixels. */
  readonly height: number;
  /** Capped device pixel ratio actually applied to the canvas backing store. */
  readonly dpr: number;
}

export interface ArtFrame {
  /** Seconds since the active effect's last reset(). */
  readonly elapsedSeconds: number;
  /** This frame's delta, already clamped. */
  readonly dtSeconds: number;
  /** True for exactly one rendered frame per debounced sensor impulse. */
  readonly impulseTriggered: boolean;
  readonly reducedMotion: boolean;
}

export interface ArtEffect {
  /** Display label, e.g. "Neon Rings" — shown briefly on Change Effect. */
  readonly name: string;
  reset(rng: SeededRandom): void;
  render(ctx: CanvasRenderingContext2D, frame: ArtFrame, signal: ArtSignal, dims: ArtDimensions): void;
  destroy?(): void;
}

export type ArtEffectFactory = () => ArtEffect;
