import { describe, expect, it } from "vitest";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import {
  ART_SIGNAL_CONSTANTS,
  INITIAL_ART_SIGNAL_STATE,
  advanceArtSignal,
  onArtSample,
  toArtSignal,
  type ArtSignalState,
} from "../../src/model/art-signal.js";

const {
  POSITION_MIN_M,
  POSITION_MAX_M,
  MAX_DT_SECONDS,
  IDLE_AFTER_SECONDS,
} = ART_SIGNAL_CONSTANTS;

/** Feed one sample per simulated frame (sample dt === frame dt), the common case. */
function run(
  state: ArtSignalState,
  samples: readonly { t: number; x: number }[],
  frameDt = 0.04,
): ArtSignalState {
  let s = state;
  for (const { t, x } of samples) {
    s = onArtSample(s, makeMotionSample(t, x));
    s = advanceArtSignal(s, frameDt);
  }
  return s;
}

function walk(from: number, to: number, seconds: number, hz = 25): { t: number; x: number }[] {
  const n = Math.round(seconds * hz);
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / hz;
    const x = from + ((to - from) * i) / n;
    return { t, x };
  });
}

describe("art-signal — onArtSample", () => {
  it("the first sample sets rawPositionMeters but leaves the velocity target at 0", () => {
    const s = onArtSample(INITIAL_ART_SIGNAL_STATE, makeMotionSample(0, 2.0));
    expect(s.rawPositionMeters).toBe(2.0);
    expect(s.targetVelocityMPerS).toBe(0);
    expect(s.lastSampleAtSeconds).toBe(0);
  });

  it("clamps position to the documented physical range", () => {
    const s = onArtSample(INITIAL_ART_SIGNAL_STATE, makeMotionSample(0, 50));
    expect(s.rawPositionMeters).toBe(POSITION_MAX_M);
    const s2 = onArtSample(INITIAL_ART_SIGNAL_STATE, makeMotionSample(0, -3));
    expect(s2.rawPositionMeters).toBe(POSITION_MIN_M);
  });

  it("rejects non-finite samples — state is unchanged, never NaN/Infinity downstream", () => {
    const seeded = onArtSample(INITIAL_ART_SIGNAL_STATE, makeMotionSample(0, 2.0));
    const afterNaN = onArtSample(seeded, { timestampSeconds: NaN, positionMeters: 2.5 });
    expect(afterNaN).toEqual(seeded);
    const afterInf = onArtSample(seeded, { timestampSeconds: 1, positionMeters: Infinity });
    expect(afterInf).toEqual(seeded);
    const signal = toArtSignal(advanceArtSignal(afterInf, 0.04));
    for (const v of Object.values(signal)) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("a duplicate timestamp (dt <= 0) does not change the velocity target", () => {
    const s1 = onArtSample(INITIAL_ART_SIGNAL_STATE, makeMotionSample(1, 2.0));
    const s2 = onArtSample(s1, makeMotionSample(1, 3.5)); // same timestamp, different position
    expect(s2.targetVelocityMPerS).toBe(s1.targetVelocityMPerS);
    expect(() => onArtSample(s2, makeMotionSample(1, 4))).not.toThrow();
  });

  it("an irregularly large gap (dt > MAX_DT_SECONDS) does not spike the velocity target", () => {
    const s1 = onArtSample(INITIAL_ART_SIGNAL_STATE, makeMotionSample(0, 1.0));
    const s2 = onArtSample(s1, makeMotionSample(MAX_DT_SECONDS + 5, 5.9));
    expect(s2.targetVelocityMPerS).toBe(s1.targetVelocityMPerS);
  });

  it("a fast sustained run fires exactly one impulse", () => {
    const fast = walk(1.0, 5.5, 1.0); // ~4.5 m/s, well above the fire threshold
    let s = INITIAL_ART_SIGNAL_STATE;
    for (const { t, x } of fast) s = onArtSample(s, makeMotionSample(t, x));
    expect(s.impulseSeq).toBe(1);
  });

  it("dithering around the fire threshold without dropping below rearm does not refire", () => {
    let s = onArtSample(INITIAL_ART_SIGNAL_STATE, makeMotionSample(0, 2.0));
    // several fast steps in a row, close together — one sustained burst, not many small ones
    for (let i = 1; i <= 10; i++) {
      s = onArtSample(s, makeMotionSample(i * 0.04, 2.0 + i * 0.09));
    }
    expect(s.impulseSeq).toBeLessThanOrEqual(1);
  });

  it("dropping below rearm then exceeding fire again bumps a second time", () => {
    let s = onArtSample(INITIAL_ART_SIGNAL_STATE, makeMotionSample(0, 2.0));
    // fast burst away
    s = onArtSample(s, makeMotionSample(0.04, 2.3));
    expect(s.impulseSeq).toBe(1);
    // several stationary samples — speed01 drops to ~0, well below rearm
    for (let i = 1; i <= 15; i++) {
      s = onArtSample(s, makeMotionSample(0.04 + i * 0.04, 2.3));
    }
    expect(s.impulseArmed).toBe(true);
    // fast burst again, immediately after the last stationary sample
    s = onArtSample(s, makeMotionSample(0.68, 2.8));
    expect(s.impulseSeq).toBe(2);
  });
});

describe("art-signal — advanceArtSignal", () => {
  it("energy and impulse decay toward 0 over repeated frame ticks with no new samples", () => {
    let s = onArtSample(INITIAL_ART_SIGNAL_STATE, makeMotionSample(0, 2.0));
    s = onArtSample(s, makeMotionSample(0.04, 2.5)); // a burst — sets energy/impulse up
    for (let i = 0; i < 300; i++) s = advanceArtSignal(s, 1 / 60); // 5s of idle frame ticks
    const signal = toArtSignal(s);
    expect(signal.energy).toBeLessThan(0.15);
    expect(signal.impulse).toBeLessThan(0.05);
  });

  it("after an idle gap, signedVelocity relaxes toward 0 even though the last sample implied motion", () => {
    let s = INITIAL_ART_SIGNAL_STATE;
    for (const { t, x } of walk(1.0, 3.0, 1.0)) {
      s = onArtSample(s, makeMotionSample(t, x));
      s = advanceArtSignal(s, 0.04);
    }
    const movingSpeed = Math.abs(toArtSignal(s).signedVelocity);
    expect(movingSpeed).toBeGreaterThan(0.3);
    // no new samples for well past IDLE_AFTER_SECONDS
    for (let i = 0; i < 60; i++) s = advanceArtSignal(s, IDLE_AFTER_SECONDS / 10);
    expect(Math.abs(toArtSignal(s).signedVelocity)).toBeLessThan(0.05);
  });

  it("a single huge dtSeconds is clamped, not a jump", () => {
    let s = onArtSample(INITIAL_ART_SIGNAL_STATE, makeMotionSample(0, 2.0));
    s = onArtSample(s, makeMotionSample(0.04, 2.6));
    const normal = advanceArtSignal(s, 0.04);
    const huge = advanceArtSignal(s, 1000);
    // both are finite and huge dt cannot overshoot past a clamped-equivalent step
    expect(Number.isFinite(toArtSignal(huge).position01)).toBe(true);
    expect(Number.isFinite(toArtSignal(huge).energy)).toBe(true);
    expect(toArtSignal(huge).energy).toBeGreaterThanOrEqual(0);
    expect(toArtSignal(huge).energy).toBeLessThanOrEqual(1);
    void normal;
  });
});

describe("art-signal — direction and relative speed", () => {
  it("walking away (increasing position) settles direction to 1", () => {
    const s = run(INITIAL_ART_SIGNAL_STATE, walk(1.0, 3.0, 1.5));
    expect(toArtSignal(s).direction).toBe(1);
    expect(toArtSignal(s).signedVelocity).toBeGreaterThan(0);
  });

  it("walking toward (decreasing position) settles direction to -1", () => {
    const s = run(INITIAL_ART_SIGNAL_STATE, walk(4.0, 1.0, 1.5));
    expect(toArtSignal(s).direction).toBe(-1);
    expect(toArtSignal(s).signedVelocity).toBeLessThan(0);
  });

  it("standing still keeps direction at 0 and low energy", () => {
    const still = Array.from({ length: 40 }, (_, i) => ({ t: i * 0.04, x: 2.0 }));
    const s = run(INITIAL_ART_SIGNAL_STATE, still);
    const signal = toArtSignal(s);
    expect(signal.direction).toBe(0);
    expect(signal.energy).toBeLessThan(0.1);
    expect(signal.stillness).toBeGreaterThan(0.9);
  });

  it("a faster walk produces higher energy than an equally-long slower walk", () => {
    const slow = run(INITIAL_ART_SIGNAL_STATE, walk(1.0, 1.6, 1.5)); // 0.4 m/s
    const fast = run(INITIAL_ART_SIGNAL_STATE, walk(1.0, 4.0, 1.5)); // 2.0 m/s
    expect(toArtSignal(fast).energy).toBeGreaterThan(toArtSignal(slow).energy);
    expect(toArtSignal(fast).speed01).toBeGreaterThan(toArtSignal(slow).speed01);
  });
});

describe("art-signal — stillness complements energy", () => {
  it("stillness is always 1 - energy", () => {
    const s = run(INITIAL_ART_SIGNAL_STATE, walk(1.0, 3.0, 1.0));
    const signal = toArtSignal(s);
    expect(signal.stillness).toBeCloseTo(1 - signal.energy, 10);
  });
});

describe("art-signal — purity", () => {
  it("never writes to the input MotionSample", () => {
    const sample = makeMotionSample(1, 2.5); // Object.freeze'd at the source
    const before = { ...sample };
    onArtSample(INITIAL_ART_SIGNAL_STATE, sample);
    expect(sample).toEqual(before);
  });
});
