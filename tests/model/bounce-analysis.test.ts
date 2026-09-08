import { describe, expect, it } from "vitest";
import { makeMotionRun, type MotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import {
  MIN_BOUNCE_PEAKS,
  detectBouncePeaks,
  estimateBounceReference,
} from "../../src/model/bounce-analysis.js";
import { RATIO_TOLERANCE, sequenceRatio } from "../../src/model/sequence-ratio.js";
import { detectExtrema } from "../../src/model/cycle-analysis.js";

const G = 9.8;

/**
 * A synthetic bouncing-ball position trace: a throw to `h1` above the floor,
 * then bounces with apex `h1·r^k`, optionally an orientation flip, optional
 * white noise, and an optional settled tail at the resting level.
 */
function bounceRun(
  id: string,
  {
    h1 = 0.8,
    r = 0.7,
    ref = 0.15,
    bounces = 6,
    dt = 0.01,
    orientation = "up" as "up" | "down",
    noise = 0,
    tailSeconds = 1.2,
  } = {},
): MotionRun {
  let seed = 4242;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  const samples: { t: number; x: number }[] = [];
  let t = 0;
  const sign = orientation === "up" ? 1 : -1;
  for (let k = 0; k <= bounces; k++) {
    const apex = h1 * r ** k;
    const dur = 2 * Math.sqrt((2 * apex) / G);
    const steps = Math.max(4, Math.round(dur / dt));
    for (let s = 0; s < steps; s++) {
      const tau = (s / steps) * dur;
      const heightAboveRef = apex - 0.5 * G * (tau - dur / 2) ** 2;
      samples.push({ t, x: ref + sign * Math.max(0, heightAboveRef) + rand() * noise });
      t += dt;
    }
  }
  const tailSteps = Math.round(tailSeconds / dt);
  for (let s = 0; s < tailSteps; s++) {
    samples.push({ t, x: ref + rand() * noise });
    t += dt;
  }
  return makeMotionRun({
    id,
    samplerHz: Math.round(1 / dt),
    source: "sensor",
    deviceLabel: null,
    stopReason: "ui",
    samples: samples.map((s) => makeMotionSample(s.t, s.x)),
  });
}

describe("estimateBounceReference", () => {
  it("finds the floor and 'up' orientation for a normal drop", () => {
    const run = bounceRun("up");
    const ref = estimateBounceReference(run, detectExtrema(run, { sensitivity: "standard" }));
    expect(ref.ok).toBe(true);
    if (ref.ok) {
      expect(ref.referenceMeters).toBeCloseTo(0.15, 1);
      expect(ref.apexKind).toBe("max");
    }
  });

  it("handles a flipped sensor — apexes as minima, reference above", () => {
    const run = bounceRun("down", { orientation: "down", ref: 1.8 });
    const ref = estimateBounceReference(run, detectExtrema(run, { sensitivity: "standard" }));
    expect(ref.ok).toBe(true);
    if (ref.ok) {
      expect(ref.referenceMeters).toBeCloseTo(1.8, 1);
      expect(ref.apexKind).toBe("min");
    }
  });

  it("refuses when the ball never settles", () => {
    const run = bounceRun("nosettle", { r: 0.85, bounces: 9, tailSeconds: 0 });
    const ref = estimateBounceReference(run, detectExtrema(run, { sensitivity: "standard" }));
    expect(ref.ok).toBe(false);
    if (!ref.ok) expect(ref.reason).toMatch(/resting level|settle/i);
  });
});

describe("detectBouncePeaks", () => {
  it("recovers a clean geometric height sequence and its ratio", () => {
    const run = bounceRun("clean", { h1: 0.9, r: 0.72, bounces: 6 });
    const res = detectBouncePeaks(run, { sensitivity: "standard" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.peaks.length).toBeGreaterThanOrEqual(5);
    const heights = res.peaks.map((p) => p.heightMeters);
    // strictly decreasing, geometric
    for (let i = 1; i < heights.length; i++) expect(heights[i]!).toBeLessThan(heights[i - 1]!);
    const ratio = sequenceRatio(heights);
    expect(ratio.ratio!).toBeGreaterThan(0.6);
    expect(ratio.ratio!).toBeLessThan(0.85);
    expect(ratio.consistent).toBe(true);
    // provenance maps back to the raw run
    for (const p of res.peaks) {
      expect(p.sampleIndex).toBeGreaterThanOrEqual(0);
      expect(p.sampleIndex).toBeLessThan(run.sampleCount);
    }
  });

  it("gives the same heights for a flipped sensor", () => {
    const up = detectBouncePeaks(bounceRun("u", { h1: 0.8, r: 0.7 }), { sensitivity: "standard" });
    const down = detectBouncePeaks(bounceRun("d", { h1: 0.8, r: 0.7, orientation: "down", ref: 2.0 }), {
      sensitivity: "standard",
    });
    expect(up.ok && down.ok).toBe(true);
    if (!up.ok || !down.ok) return;
    const hu = up.peaks.map((p) => p.heightMeters);
    const hd = down.peaks.map((p) => p.heightMeters);
    expect(hd.length).toBe(hu.length);
    for (let i = 0; i < hu.length; i++) expect(hd[i]!).toBeCloseTo(hu[i]!, 2);
  });

  it("tolerates noise", () => {
    const run = bounceRun("noisy", { h1: 0.9, r: 0.7, bounces: 6, noise: 0.01 });
    const res = detectBouncePeaks(run, { sensitivity: "standard" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const ratio = sequenceRatio(res.peaks.map((p) => p.heightMeters));
      expect(ratio.ratio!).toBeGreaterThan(0.55);
      expect(ratio.ratio!).toBeLessThan(0.9);
    }
  });

  it("refuses a run with too few bounces", () => {
    const run = bounceRun("few", { bounces: 1 });
    const res = detectBouncePeaks(run, { sensitivity: "standard" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/bounces/i);
  });

  it("does not mutate the raw run", () => {
    const run = bounceRun("frozen");
    const snap = JSON.stringify(run.samples.map((s) => [s.timestampSeconds, s.positionMeters]));
    detectBouncePeaks(run, { sensitivity: "high" });
    expect(JSON.stringify(run.samples.map((s) => [s.timestampSeconds, s.positionMeters]))).toBe(snap);
    expect(Object.isFrozen(run)).toBe(true);
  });

  it("MIN_BOUNCE_PEAKS is 3", () => {
    expect(MIN_BOUNCE_PEAKS).toBe(3);
  });
});

describe("sequenceRatio", () => {
  it("is the median of consecutive ratios, skipping near-zero denominators", () => {
    const r = sequenceRatio([1, 0.7, 0.49, 0.343]);
    expect(r.ratio!).toBeCloseTo(0.7, 6);
    expect(r.consistent).toBe(true);
    expect(r.ratios).toHaveLength(3);
  });
  it("marks an erratic series as varying", () => {
    const r = sequenceRatio([1, 0.7, 0.2, 0.19, 0.02]);
    expect(r.consistent).toBe(false);
  });
  it("returns null ratio for fewer than two terms", () => {
    expect(sequenceRatio([5]).ratio).toBeNull();
  });
  it("RATIO_TOLERANCE is 0.18", () => {
    expect(RATIO_TOLERANCE).toBe(0.18);
  });
});
