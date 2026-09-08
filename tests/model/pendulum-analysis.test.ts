import { describe, expect, it } from "vitest";
import { makeMotionRun, type MotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import {
  MIN_FULL_PERIODS,
  MIN_PENDULUM_EXTREMA,
  PERIOD_TOLERANCE,
  choosePeriodSide,
  detectPendulumExtrema,
  estimatePendulumMidline,
  pendulumAmplitudeSequence,
  pendulumPeriodSeries,
} from "../../src/model/pendulum-analysis.js";
import { detectExtrema } from "../../src/model/cycle-analysis.js";

function pendulumRun(
  id: string,
  { A0 = 0.3, decay = 0.03, T = 1.4, midline = 0.5, n = 800, dt = 0.02, noise = 0, jitter = 0 } = {},
): MotionRun {
  let seed = 555;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  const samples = Array.from({ length: n }, (_, i) => {
    const t = i * dt + (jitter ? rand() * jitter : 0);
    const x = midline + A0 * Math.exp(-decay * (i * dt)) * Math.cos((2 * Math.PI * (i * dt)) / T) + rand() * noise;
    return makeMotionSample(Math.max(0, t), x);
  });
  return makeMotionRun({
    id,
    samplerHz: Math.round(1 / dt),
    source: "sensor",
    deviceLabel: null,
    stopReason: "ui",
    samples,
  });
}

describe("estimatePendulumMidline", () => {
  it("recovers an offset midline", () => {
    const run = pendulumRun("m", { midline: 1.2 });
    const mid = estimatePendulumMidline(detectExtrema(run, { sensitivity: "standard" }));
    expect(mid).toBeCloseTo(1.2, 1);
  });
  it("is null without both a max and a min", () => {
    expect(estimatePendulumMidline([])).toBeNull();
  });
});

describe("choosePeriodSide", () => {
  it("prefers the side with more valid periods", () => {
    expect(choosePeriodSide([1, 1, 1, 1], [1, 1]).source).toBe("maxima");
    expect(choosePeriodSide([1, 1], [1, 1, 1, 1]).source).toBe("minima");
  });
  it("on a tie, prefers the lower coefficient of variation", () => {
    expect(choosePeriodSide([1, 1.6, 0.7], [1.0, 1.02, 0.99]).source).toBe("minima");
  });
  it("on a total tie, prefers maxima", () => {
    expect(choosePeriodSide([1, 1, 1], [1, 1, 1]).source).toBe("maxima");
  });
});

describe("detectPendulumExtrema + sequences", () => {
  it("clean sinusoid: extrema alternate, midline centred", () => {
    const run = pendulumRun("clean");
    const d = detectPendulumExtrema(run, { sensitivity: "standard" });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.extrema.length).toBeGreaterThanOrEqual(MIN_PENDULUM_EXTREMA);
    expect(d.midlineMeters).toBeCloseTo(0.5, 1);
  });

  it("amplitude sequence decays and is time-ordered", () => {
    const run = pendulumRun("amp", { decay: 0.06 });
    const d = detectPendulumExtrema(run, { sensitivity: "standard" });
    if (!d.ok) throw new Error("detect failed");
    const seq = pendulumAmplitudeSequence(d);
    expect(seq.ok).toBe(true);
    if (!seq.ok) return;
    for (let i = 1; i < seq.terms.length; i++) {
      expect(seq.terms[i]!.timeSeconds).toBeGreaterThan(seq.terms[i - 1]!.timeSeconds);
    }
    // overall decay (first few vs last few)
    expect(seq.terms.at(-1)!.amplitudeMeters).toBeLessThan(seq.terms[0]!.amplitudeMeters);
  });

  it("period sequence recovers T and is consistent for a clean swing", () => {
    const run = pendulumRun("per", { T: 1.4, decay: 0.02 });
    const d = detectPendulumExtrema(run, { sensitivity: "standard" });
    if (!d.ok) throw new Error("detect failed");
    const per = pendulumPeriodSeries(d);
    expect(per.ok).toBe(true);
    if (!per.ok) return;
    expect(per.averageSeconds).toBeCloseTo(1.4, 1);
    expect(per.consistent).toBe(true);
    expect(per.periods.length).toBeGreaterThanOrEqual(MIN_FULL_PERIODS);
  });

  it("tolerates noise and irregular timestamps", () => {
    const run = pendulumRun("nj", { noise: 0.006, jitter: 0.004 });
    const d = detectPendulumExtrema(run, { sensitivity: "standard" });
    if (!d.ok) throw new Error("detect failed");
    const per = pendulumPeriodSeries(d);
    expect(per.ok).toBe(true);
    if (per.ok) expect(per.averageSeconds).toBeCloseTo(1.4, 0);
  });

  it("sensitivity reruns extrema on the same run", () => {
    const run = pendulumRun("s", { noise: 0.01 });
    const low = detectExtrema(run, { sensitivity: "low" }).length;
    const high = detectExtrema(run, { sensitivity: "high" }).length;
    expect(high).toBeGreaterThanOrEqual(low);
  });

  it("fails honestly for too few swings", () => {
    const short = pendulumRun("short", { n: 90, T: 1.4 }); // < 2 full periods
    const d = detectPendulumExtrema(short, { sensitivity: "standard" });
    if (d.ok) {
      const amp = pendulumAmplitudeSequence(d);
      const per = pendulumPeriodSeries(d);
      expect(amp.ok && per.ok).toBe(false);
      if (!per.ok) expect(per.reason).toMatch(/swings/i);
    } else {
      expect(d.reason).toMatch(/swings/i);
    }
  });

  it("does not mutate the raw run", () => {
    const run = pendulumRun("frozen");
    const snap = JSON.stringify(run.samples.map((s) => [s.timestampSeconds, s.positionMeters]));
    const d = detectPendulumExtrema(run, { sensitivity: "high" });
    if (d.ok) {
      pendulumAmplitudeSequence(d);
      pendulumPeriodSeries(d);
    }
    expect(JSON.stringify(run.samples.map((s) => [s.timestampSeconds, s.positionMeters]))).toBe(snap);
  });

  it("constants are as documented", () => {
    expect(MIN_PENDULUM_EXTREMA).toBe(4);
    expect(MIN_FULL_PERIODS).toBe(2);
    expect(PERIOD_TOLERANCE).toBe(0.18);
  });
});
