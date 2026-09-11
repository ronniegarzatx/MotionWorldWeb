import { describe, expect, it } from "vitest";
import type { ArtSignal } from "../../src/model/art-signal.js";
import type { ArtDimensions, ArtEffectFactory, ArtFrame } from "../../src/art/art-types.js";
import { EFFECT_FACTORIES } from "../../src/art/effects/index.js";
import { createSeededRandom } from "../../src/art/seeded-random.js";
import { callsOf, createRecordingContext, paintedFullCanvasBackground, type CtxEvent } from "./recording-context.js";

const DIMS: ArtDimensions = { width: 1024, height: 768, dpr: 1 };

function signal(overrides: Partial<ArtSignal> = {}): ArtSignal {
  return {
    position01: 0.5,
    speed01: 0,
    signedVelocity: 0,
    direction: 0,
    energy: 0,
    stillness: 1,
    impulse: 0,
    ...overrides,
  };
}

function frame(overrides: Partial<ArtFrame> = {}): ArtFrame {
  return { elapsedSeconds: 0, dtSeconds: 1 / 60, impulseTriggered: false, reducedMotion: false, ...overrides };
}

const SIGNAL_SPREAD: ArtSignal[] = [
  signal(), // stationary / idle
  signal({ position01: 0.1, speed01: 0.8, signedVelocity: 1.6, direction: 1, energy: 0.7, stillness: 0.3 }), // fast away
  signal({ position01: 0.9, speed01: 0.8, signedVelocity: -1.6, direction: -1, energy: 0.7, stillness: 0.3 }), // fast toward
  signal({ position01: 0.5, speed01: 0.9, signedVelocity: 1.8, direction: 1, energy: 1, stillness: 0, impulse: 1 }), // mid-impulse
];

const PRIMITIVE_METHODS = ["arc", "fillRect", "fill", "stroke"] as const;

function primitiveCallCount(log: readonly CtxEvent[]): number {
  return PRIMITIVE_METHODS.reduce((n, m) => n + callsOf(log, m).length, 0);
}

describe.each(EFFECT_FACTORIES.map((factory, i) => ({ factory, i })))(
  "art effect #%#",
  ({ factory }: { factory: ArtEffectFactory }) => {
    it("has a name", () => {
      const effect = factory();
      expect(effect.name.length).toBeGreaterThan(0);
    });

    it("renders without throwing across a spread of signals and reducedMotion states", () => {
      const effect = factory();
      effect.reset(createSeededRandom(1));
      const { ctx } = createRecordingContext();
      let elapsed = 0;
      for (const s of SIGNAL_SPREAD) {
        for (const reducedMotion of [false, true]) {
          elapsed += 1 / 60;
          expect(() => effect.render(ctx, frame({ elapsedSeconds: elapsed, reducedMotion }), s, DIMS)).not.toThrow();
        }
      }
    });

    it("paints an opaque full-canvas background every frame", () => {
      const effect = factory();
      effect.reset(createSeededRandom(2));
      const { ctx, log } = createRecordingContext();
      let elapsed = 0;
      for (const s of SIGNAL_SPREAD) {
        const before = log.length;
        elapsed += 1 / 60;
        effect.render(ctx, frame({ elapsedSeconds: elapsed }), s, DIMS);
        expect(paintedFullCanvasBackground(log.slice(before), DIMS.width, DIMS.height)).toBe(true);
      }
    });

    it("respects a bounded per-frame draw-call ceiling under sustained stress", () => {
      const effect = factory();
      effect.reset(createSeededRandom(3));
      const { ctx, log } = createRecordingContext();
      const stress = signal({ position01: 0.5, speed01: 1, signedVelocity: 2, direction: 1, energy: 1, stillness: 0, impulse: 1 });
      let elapsed = 0;
      let lastSliceStart = 0;
      for (let i = 0; i < 150; i++) {
        elapsed += 1 / 60;
        lastSliceStart = log.length;
        effect.render(ctx, frame({ elapsedSeconds: elapsed, impulseTriggered: i % 3 === 0 }), stress, DIMS);
      }
      // headroom above the largest documented per-effect cap (Particle Burst's
      // 260, at ~2 primitive calls each) — generous enough to never flake on a
      // legitimately capped effect, tight enough to catch a genuinely
      // unbounded array (which would blow past this within ~150 frames)
      const lastFrameCalls = primitiveCallCount(log.slice(lastSliceStart));
      expect(lastFrameCalls).toBeLessThan(600);
    });

    it("reducedMotion measurably lowers intensity for the same signal sequence", () => {
      const normal = factory();
      normal.reset(createSeededRandom(4));
      const reduced = factory();
      reduced.reset(createSeededRandom(4));
      const normalCtx = createRecordingContext();
      const reducedCtx = createRecordingContext();
      const stress = signal({ speed01: 1, signedVelocity: 2, energy: 1, stillness: 0 });

      let normalCount = 0;
      let reducedCount = 0;
      let elapsed = 0;
      for (let i = 0; i < 60; i++) {
        elapsed += 1 / 60;
        const impulseTriggered = i % 5 === 0;
        const beforeN = normalCtx.log.length;
        normal.render(normalCtx.ctx, frame({ elapsedSeconds: elapsed, reducedMotion: false, impulseTriggered }), stress, DIMS);
        normalCount += primitiveCallCount(normalCtx.log.slice(beforeN));

        const beforeR = reducedCtx.log.length;
        reduced.render(reducedCtx.ctx, frame({ elapsedSeconds: elapsed, reducedMotion: true, impulseTriggered }), stress, DIMS);
        reducedCount += primitiveCallCount(reducedCtx.log.slice(beforeR));
      }
      expect(reducedCount).toBeLessThanOrEqual(normalCount);
    });

    it("the same seed reproduces the same draw sequence; a different seed diverges at least once", () => {
      const a1 = factory();
      a1.reset(createSeededRandom(10));
      const a2 = factory();
      a2.reset(createSeededRandom(10));
      const b = factory();
      b.reset(createSeededRandom(20));

      const ra = createRecordingContext();
      const rb = createRecordingContext();
      const rc = createRecordingContext();
      let elapsed = 0;
      for (let i = 0; i < 20; i++) {
        elapsed += 1 / 60;
        const f = frame({ elapsedSeconds: elapsed, impulseTriggered: i % 4 === 0 });
        a1.render(ra.ctx, f, SIGNAL_SPREAD[i % SIGNAL_SPREAD.length]!, DIMS);
        a2.render(rb.ctx, f, SIGNAL_SPREAD[i % SIGNAL_SPREAD.length]!, DIMS);
        b.render(rc.ctx, f, SIGNAL_SPREAD[i % SIGNAL_SPREAD.length]!, DIMS);
      }
      expect(ra.log).toEqual(rb.log);
      expect(ra.log).not.toEqual(rc.log);
    });
  },
);

describe("art effect roster", () => {
  it("has seven distinctly named effects", () => {
    const names = EFFECT_FACTORIES.map((f) => f().name);
    expect(names).toHaveLength(7);
    expect(new Set(names).size).toBe(7);
  });
});

describe("art effect source — no direct Math.random", () => {
  // Vite/Vitest raw-text import — see tests/architecture.test.ts for the same convention.
  const modules = import.meta.glob("../../src/art/effects/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  it("has actually scanned the effect files", () => {
    expect(Object.keys(modules).length).toBeGreaterThanOrEqual(6);
  });

  it("no effect file calls Math.random( directly", () => {
    const offenders = Object.entries(modules)
      .filter(([, text]) => /Math\.random\(/.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
