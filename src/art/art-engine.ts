/**
 * ArtEngine — effect-family selection and per-frame drive (design spec §8).
 * Pure orchestration: receives a 2D context + dimensions from the screen but
 * never touches requestAnimationFrame, resize listeners, or pointer/keyboard
 * events itself — that split is what keeps this class testable without jsdom.
 */
import {
  INITIAL_ART_SIGNAL_STATE,
  advanceArtSignal,
  onArtSample,
  toArtSignal,
  type ArtSignalState,
} from "../model/art-signal.js";
import type { MotionSample } from "../model/motion-sample.js";
import { createSeededRandom } from "./seeded-random.js";
import type { ArtDimensions, ArtEffect, ArtEffectFactory } from "./art-types.js";

export interface ArtEngineOptions {
  readonly effects: readonly ArtEffectFactory[];
  /** Used only to pick effect-family seeds/indices — never for rendering. Defaults to Math.random. */
  readonly randomSource?: () => number;
  /** Deterministic override for the engine's own family-selection stream. */
  readonly seed?: number;
}

export class ArtEngine {
  private readonly factories: readonly ArtEffectFactory[];
  private readonly pickRandom;
  private activeIndex: number;
  private activeEffect: ArtEffect;

  private signalState: ArtSignalState = INITIAL_ART_SIGNAL_STATE;
  private elapsedSeconds = 0;
  private lastDtSeconds = 0;
  private lastRenderedImpulseSeq = 0;

  constructor(opts: ArtEngineOptions) {
    if (opts.effects.length === 0) {
      throw new Error("ArtEngine requires at least one effect factory");
    }
    this.factories = opts.effects;
    const seed = opts.seed ?? Math.floor((opts.randomSource ?? Math.random)() * 2 ** 31);
    this.pickRandom = createSeededRandom(seed);
    this.activeIndex = this.pickRandom.int(0, this.factories.length);
    this.activeEffect = this.factories[this.activeIndex]!();
    this.resetActiveEffect();
  }

  get activeEffectName(): string {
    return this.activeEffect.name;
  }

  private resetActiveEffect(): void {
    const effectSeed = this.pickRandom.int(0, 2 ** 31);
    this.activeEffect.reset(createSeededRandom(effectSeed));
    this.elapsedSeconds = 0;
    this.lastRenderedImpulseSeq = this.signalState.impulseSeq;
  }

  onSample(sample: MotionSample): void {
    this.signalState = onArtSample(this.signalState, sample);
  }

  tick(dtSeconds: number) {
    this.signalState = advanceArtSignal(this.signalState, dtSeconds);
    this.lastDtSeconds = dtSeconds;
    this.elapsedSeconds += dtSeconds;
    return toArtSignal(this.signalState);
  }

  render(ctx: CanvasRenderingContext2D, dims: ArtDimensions, reducedMotion: boolean): void {
    const impulseTriggered = this.signalState.impulseSeq !== this.lastRenderedImpulseSeq;
    this.lastRenderedImpulseSeq = this.signalState.impulseSeq;
    this.activeEffect.render(
      ctx,
      {
        elapsedSeconds: this.elapsedSeconds,
        dtSeconds: this.lastDtSeconds,
        impulseTriggered,
        reducedMotion,
      },
      toArtSignal(this.signalState),
      dims,
    );
  }

  changeEffect(): void {
    this.activeEffect.destroy?.();
    if (this.factories.length > 1) {
      let next = this.activeIndex;
      while (next === this.activeIndex) next = this.pickRandom.int(0, this.factories.length);
      this.activeIndex = next;
    }
    this.activeEffect = this.factories[this.activeIndex]!();
    this.resetActiveEffect();
  }

  destroy(): void {
    this.activeEffect.destroy?.();
  }
}
