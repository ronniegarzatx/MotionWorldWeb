import { describe, expect, it } from "vitest";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import { ArtEngine } from "../../src/art/art-engine.js";
import type { ArtDimensions, ArtEffect, ArtEffectFactory, ArtFrame } from "../../src/art/art-types.js";
import type { ArtSignal } from "../../src/model/art-signal.js";

const DIMS: ArtDimensions = { width: 800, height: 600, dpr: 1 };
const CTX = {} as CanvasRenderingContext2D;

interface RecordedCall {
  readonly frame: ArtFrame;
  readonly signal: ArtSignal;
}

function stubEffect(name: string): {
  factory: ArtEffectFactory;
  calls: RecordedCall[];
  counts: { resets: number; destroys: number };
} {
  const calls: RecordedCall[] = [];
  const counts = { resets: 0, destroys: 0 };
  const effect: ArtEffect = {
    name,
    reset: () => {
      counts.resets += 1;
    },
    render: (_ctx, frame, signal) => {
      calls.push({ frame, signal });
    },
    destroy: () => {
      counts.destroys += 1;
    },
  };
  return { factory: () => effect, calls, counts };
}

// deterministic random source: cycles through a fixed sequence in [0, 1)
function fixedSource(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("ArtEngine", () => {
  it("constructs with the provided effect set and an active effect from it", () => {
    const a = stubEffect("A");
    const b = stubEffect("B");
    const engine = new ArtEngine({ effects: [a.factory, b.factory] });
    expect(["A", "B"]).toContain(engine.activeEffectName);
  });

  it("onSample feeds the internal signal — a fast walk raises speed01", () => {
    const a = stubEffect("A");
    const engine = new ArtEngine({ effects: [a.factory], seed: 1 });
    for (let i = 0; i <= 25; i++) {
      engine.onSample(makeMotionSample(i * 0.04, 1.0 + i * 0.04 * 3.0));
      engine.tick(0.04);
    }
    engine.render(CTX, DIMS, false);
    const last = a.calls.at(-1)!;
    expect(last.signal.speed01).toBeGreaterThan(0.3);
  });

  it("render forwards elapsedSeconds growing call over call, reset to ~0 after changeEffect", () => {
    const a = stubEffect("A");
    const b = stubEffect("B");
    const engine = new ArtEngine({ effects: [a.factory, b.factory], seed: 2 });
    const activeCalls = () => (engine.activeEffectName === "A" ? a.calls : b.calls);

    engine.tick(0.1);
    engine.render(CTX, DIMS, false);
    engine.tick(0.1);
    engine.render(CTX, DIMS, false);
    const calls = activeCalls();
    expect(calls[1]!.frame.elapsedSeconds).toBeGreaterThan(calls[0]!.frame.elapsedSeconds);

    engine.changeEffect();
    engine.tick(0.1);
    engine.render(CTX, DIMS, false);
    const afterSwitch = activeCalls();
    expect(afterSwitch.at(-1)!.frame.elapsedSeconds).toBeLessThan(0.2);
  });

  it("changeEffect with >=2 factories never reselects the same family twice in a row", () => {
    const a = stubEffect("A");
    const b = stubEffect("B");
    const c = stubEffect("C");
    const engine = new ArtEngine({
      effects: [a.factory, b.factory, c.factory],
      randomSource: fixedSource([0, 0, 0, 0, 0, 0, 0, 0]), // would always pick index 0 without the "never same" guard
      seed: 0,
    });
    const names: string[] = [engine.activeEffectName];
    for (let i = 0; i < 5; i++) {
      engine.changeEffect();
      names.push(engine.activeEffectName);
    }
    for (let i = 1; i < names.length; i++) {
      expect(names[i]).not.toBe(names[i - 1]);
    }
  });

  it("changeEffect calls destroy on the outgoing effect and reset on the incoming one", () => {
    const a = stubEffect("A");
    const b = stubEffect("B");
    const engine = new ArtEngine({ effects: [a.factory, b.factory], seed: 3 });
    const outgoing = engine.activeEffectName === "A" ? a : b;
    const incoming = engine.activeEffectName === "A" ? b : a;
    const outgoingResetsBefore = outgoing.counts.resets;
    engine.changeEffect();
    expect(outgoing.counts.destroys).toBe(1);
    expect(incoming.counts.resets).toBeGreaterThan(0);
    expect(outgoing.counts.resets).toBe(outgoingResetsBefore); // outgoing wasn't reset again
  });

  it("changeEffect with exactly one factory resets the same effect rather than throwing", () => {
    const a = stubEffect("A");
    const engine = new ArtEngine({ effects: [a.factory], seed: 4 });
    expect(() => engine.changeEffect()).not.toThrow();
    expect(engine.activeEffectName).toBe("A");
    expect(a.counts.resets).toBeGreaterThan(1);
  });

  it("impulseTriggered is true for exactly one render call per debounced impulse", () => {
    const a = stubEffect("A");
    const engine = new ArtEngine({ effects: [a.factory], seed: 5 });
    engine.onSample(makeMotionSample(0, 2.0));
    engine.tick(0.04);
    engine.render(CTX, DIMS, false);
    // a fast burst
    engine.onSample(makeMotionSample(0.04, 2.5));
    engine.tick(0.04);
    engine.render(CTX, DIMS, false);
    // several idle frames after — no new samples
    for (let i = 0; i < 5; i++) {
      engine.tick(0.04);
      engine.render(CTX, DIMS, false);
    }
    const triggeredCount = a.calls.filter((c) => c.frame.impulseTriggered).length;
    expect(triggeredCount).toBe(1);
  });

  it("reducedMotion is forwarded verbatim onto every ArtFrame", () => {
    const a = stubEffect("A");
    const engine = new ArtEngine({ effects: [a.factory], seed: 6 });
    engine.tick(0.04);
    engine.render(CTX, DIMS, true);
    expect(a.calls.at(-1)!.frame.reducedMotion).toBe(true);
    engine.tick(0.04);
    engine.render(CTX, DIMS, false);
    expect(a.calls.at(-1)!.frame.reducedMotion).toBe(false);
  });

  it("destroy calls the active effect's destroy once", () => {
    const a = stubEffect("A");
    const engine = new ArtEngine({ effects: [a.factory], seed: 7 });
    engine.destroy();
    expect(a.counts.destroys).toBe(1);
  });

  it("throws for an empty effect set rather than silently doing nothing", () => {
    expect(() => new ArtEngine({ effects: [] })).toThrow();
  });
});
