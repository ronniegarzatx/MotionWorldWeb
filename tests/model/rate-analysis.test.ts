import { describe, expect, it } from "vitest";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import { fullWindow, withRange } from "../../src/model/analysis-window.js";
import {
  MPH_PER_MPS,
  STATIONARY_SPEED_MPS,
  analyzeRate,
} from "../../src/model/rate-analysis.js";

const run = (
  fn: (t: number) => number,
  { n = 101, dt = 0.04, id = "r", t0 = 0 } = {},
) =>
  makeMotionRun({
    id,
    samplerHz: 25,
    source: "sensor",
    deviceLabel: null,
    stopReason: "ui",
    samples: Array.from({ length: n }, (_, i) => makeMotionSample(t0 + i * dt, fn(t0 + i * dt))),
  });

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

describe("analyzeRate — OLS over the window", () => {
  it("recovers a clean linear slope / intercept / r²", () => {
    const r = ok(analyzeRate(run((t) => 0.5 * t + 1), withRange(fullWindow(run(() => 0)), run(() => 0), 0.8, 3.2)));
    expect(r.slopeMetersPerSecond).toBeCloseTo(0.5, 6);
    expect(r.interceptMeters).toBeCloseTo(1, 6);
    expect(r.rSquared).toBeCloseTo(1, 6);
    expect(r.speedMetersPerSecond).toBeCloseTo(0.5, 6);
    expect(r.speedMilesPerHour).toBeCloseTo(0.5 * MPH_PER_MPS, 6);
    expect(r.direction).toBe("away");
    expect(r.sampleCount).toBeGreaterThan(50);
  });

  it("uses ALL samples, not just the endpoints", () => {
    const base = run((t) => 0.4 * t + 0.2);
    const samples = base.samples.slice();
    // yank one off-centre interior sample far off the line — this tilts the OLS
    // slope but leaves the (unchanged) endpoints' two-point slope at 0.4
    const q = Math.floor(samples.length / 4);
    samples[q] = makeMotionSample(samples[q]!.timestampSeconds, samples[q]!.positionMeters + 3);
    const yanked = makeMotionRun({
      id: "y",
      samplerHz: 25,
      source: "sensor",
      deviceLabel: null,
      stopReason: "ui",
      samples,
    });
    const r = ok(analyzeRate(yanked, fullWindow(yanked)));
    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    const endpointSlope = (last.positionMeters - first.positionMeters) / (last.timestampSeconds - first.timestampSeconds);
    // the outlier pulls the OLS slope away from both the true line and the endpoint slope
    expect(r.slopeMetersPerSecond).not.toBeCloseTo(endpointSlope, 3);
    expect(r.rSquared).toBeLessThan(1);
  });

  it("noisy-but-linear: slope near truth, r² < 1", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
    const noisy = run((t) => -0.3 * t + 2 + 0.02 * rand());
    const r = ok(analyzeRate(noisy, fullWindow(noisy)));
    expect(r.slopeMetersPerSecond).toBeCloseTo(-0.3, 1);
    expect(r.rSquared).toBeLessThan(1);
    expect(r.rSquared).toBeGreaterThan(0.9);
  });
});

describe("analyzeRate — direction + speed semantics", () => {
  it("positive slope is away, negative is toward, near-zero is stationary", () => {
    const away = ok(analyzeRate(run((t) => 0.6 * t), fullWindow(run(() => 0))));
    expect(away.direction).toBe("away");
    const toward = run((t) => 3 - 0.6 * t);
    expect(ok(analyzeRate(toward, fullWindow(toward))).direction).toBe("toward");
    const still = run((t) => 1.5 + 0.01 * t);
    expect(ok(analyzeRate(still, fullWindow(still))).direction).toBe("stationary");
  });

  it("never reports a negative speed for toward motion", () => {
    const toward = run((t) => 3 - 0.6 * t);
    const r = ok(analyzeRate(toward, fullWindow(toward)));
    expect(r.slopeMetersPerSecond).toBeLessThan(0);
    expect(r.speedMetersPerSecond).toBeGreaterThan(0);
    expect(r.speedMilesPerHour).toBeGreaterThan(0);
  });

  it("centralized mph constant, exact", () => {
    expect(MPH_PER_MPS).toBe(2.2369362920544);
    expect(STATIONARY_SPEED_MPS).toBe(0.05);
    const r = ok(analyzeRate(run((t) => 0.7 * t), fullWindow(run(() => 0))));
    expect(r.speedMilesPerHour).toBe(r.speedMetersPerSecond * MPH_PER_MPS);
  });

  it("a perfectly flat run: r² = 1, stationary, no NaN", () => {
    const flat = run(() => 2.0);
    const r = ok(analyzeRate(flat, fullWindow(flat)));
    expect(r.rSquared).toBe(1);
    expect(r.direction).toBe("stationary");
    expect(Number.isFinite(r.slopeMetersPerSecond)).toBe(true);
    expect(Object.is(r.slopeMetersPerSecond, -0)).toBe(false);
  });

  it("conditions well for runs starting at a large absolute timestamp", () => {
    const r = ok(analyzeRate(run((t) => 0.5 * t + 1, { t0: 100000 }), fullWindow(run(() => 0, { t0: 100000 }))));
    expect(r.slopeMetersPerSecond).toBeCloseTo(0.5, 4);
  });
});

describe("analyzeRate — refusal", () => {
  const good = run((t) => 0.5 * t + 1);
  it("refuses with fewer than two samples in the window", () => {
    const r = analyzeRate(good, withRange(fullWindow(good), good, 1.0, 1.0));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.reason).toBe("string");
  });
  it("refuses a single-sample run", () => {
    const one = makeMotionRun({
      id: "one",
      samplerHz: 25,
      source: "sensor",
      deviceLabel: null,
      stopReason: "ui",
      samples: [makeMotionSample(0, 1)],
    });
    expect(analyzeRate(one, fullWindow(one)).ok).toBe(false);
  });
  it("refuses when all timestamps are equal", () => {
    const stuck = makeMotionRun({
      id: "stuck",
      samplerHz: 25,
      source: "sensor",
      deviceLabel: null,
      stopReason: "ui",
      samples: [makeMotionSample(1, 1), makeMotionSample(1, 2), makeMotionSample(1, 3)],
    });
    expect(analyzeRate(stuck, fullWindow(stuck)).ok).toBe(false);
  });
  it("no NaN / Infinity in any returned field for a valid run", () => {
    const r = ok(analyzeRate(good, fullWindow(good)));
    for (const v of [
      r.slopeMetersPerSecond,
      r.interceptMeters,
      r.rSquared,
      r.speedMetersPerSecond,
      r.speedMilesPerHour,
      r.sampleCount,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(r.rSquared).toBeGreaterThanOrEqual(0);
  });
  it("does not mutate the source run", () => {
    const snap = JSON.stringify(good.samples.map((s) => [s.timestampSeconds, s.positionMeters]));
    analyzeRate(good, fullWindow(good));
    expect(JSON.stringify(good.samples.map((s) => [s.timestampSeconds, s.positionMeters]))).toBe(snap);
    expect(Object.isFrozen(good)).toBe(true);
  });
});
