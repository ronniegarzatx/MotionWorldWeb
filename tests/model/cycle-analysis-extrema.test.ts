import { describe, expect, it } from "vitest";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import {
  computeProminence,
  detectExtrema,
  findLocalExtrema,
  refineVertex,
} from "../../src/model/cycle-analysis.js";

const run = (fn: (t: number) => number, { n = 400, dt = 0.02, id = "r" } = {}) =>
  makeMotionRun({
    id,
    samplerHz: 50,
    source: "sensor",
    deviceLabel: null,
    stopReason: "ui",
    samples: Array.from({ length: n }, (_, i) => makeMotionSample(i * dt, fn(i * dt))),
  });

describe("findLocalExtrema", () => {
  it("finds the turning points of a sine, alternating max/min", () => {
    const vals = Array.from({ length: 200 }, (_, i) => Math.sin((i / 200) * 4 * Math.PI));
    const ex = findLocalExtrema(vals);
    expect(ex.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ex.length; i++) expect(ex[i]!.kind).not.toBe(ex[i - 1]!.kind);
  });
  it("keeps a single index for a flat-topped plateau", () => {
    const ex = findLocalExtrema([0, 1, 2, 2, 2, 1, 0]);
    expect(ex.filter((e) => e.kind === "max")).toHaveLength(1);
  });
  it("returns nothing for a monotone series", () => {
    expect(findLocalExtrema([1, 2, 3, 4, 5])).toEqual([]);
    expect(findLocalExtrema([5, 4, 3, 2, 1])).toEqual([]);
  });
  it("never reports the first or last sample", () => {
    const ex = findLocalExtrema([5, 1, 4, 1, 5]);
    expect(ex.every((e) => e.index > 0 && e.index < 4)).toBe(true);
  });
});

describe("computeProminence", () => {
  it("an isolated peak's prominence is its rise above the surrounding valleys", () => {
    const vals = [0, 0, 0, 5, 0, 0, 0, 3, 0, 0, 0];
    expect(computeProminence(vals, 3, "max")).toBeCloseTo(5, 6);
  });
  it("a small wiggle riding a slope has small prominence", () => {
    const vals = Array.from({ length: 40 }, (_, i) => i + (i === 20 ? 0.3 : 0));
    expect(computeProminence(vals, 20, "max")).toBeLessThan(1);
  });
});

describe("refineVertex", () => {
  it("recovers the sub-sample vertex of a parabola", () => {
    const vals = Array.from({ length: 9 }, (_, i) => (i - 2.3) ** 2);
    // nearest integer min is index 2; true vertex at 2.3 -> deltaIndex ≈ +0.3
    const r = refineVertex(vals, 2);
    expect(r.deltaIndex).toBeCloseTo(0.3, 2);
  });
});

describe("detectExtrema", () => {
  const sine = (amp: number, cycles: number, n = 500) =>
    run((t) => amp * Math.sin((t / (n * 0.02)) * cycles * 2 * Math.PI), { n });

  it("counts the turning points of a clean sine", () => {
    const ex = detectExtrema(sine(0.2, 5), { sensitivity: "standard" });
    // 5 cycles -> ~10 turning points (allow ±2 for the open ends)
    expect(ex.length).toBeGreaterThanOrEqual(8);
    expect(ex.length).toBeLessThanOrEqual(12);
  });

  it("survives additive white noise", () => {
    let seed = 99;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff - 0.5;
    };
    const noisy = run(
      (t) => 0.2 * Math.sin((t / (500 * 0.02)) * 5 * 2 * Math.PI) + rand() * 0.01,
      { n: 500 },
    );
    const ex = detectExtrema(noisy, { sensitivity: "standard" });
    expect(ex.length).toBeGreaterThanOrEqual(8);
    expect(ex.length).toBeLessThanOrEqual(12);
  });

  it("reads times from the real (irregular) sample timestamps", () => {
    const base = Array.from({ length: 300 }, (_, i) => ({
      t: i * 0.02 + (i % 3 === 0 ? 0.004 : 0),
      x: 0.15 * Math.sin((i / 300) * 4 * 2 * Math.PI),
    }));
    const r = makeMotionRun({
      id: "irr",
      samplerHz: 50,
      source: "sensor",
      deviceLabel: null,
      stopReason: "ui",
      samples: base.map((s) => makeMotionSample(s.t, s.x)),
    });
    const ex = detectExtrema(r, { sensitivity: "standard" });
    for (const e of ex) {
      expect(e.timeSeconds).toBeGreaterThanOrEqual(0);
      expect(e.timeSeconds).toBeLessThanOrEqual(r.samples.at(-1)!.timestampSeconds + 1e-9);
    }
  });

  it("min-separation drops a close lower twin (no double detection per swing)", () => {
    // a tall hump at index 40 and a much shorter local max 4 samples later
    const hump = (i: number, c: number, w: number, h: number) =>
      Math.max(0, h * (1 - Math.abs(i - c) / w));
    const vals = Array.from({ length: 90 }, (_, i) => hump(i, 40, 5, 1.0) + hump(i, 44, 1.5, 0.4));
    const r = makeMotionRun({
      id: "twin",
      samplerHz: 50,
      source: "sensor",
      deviceLabel: null,
      stopReason: "ui",
      samples: vals.map((v, i) => makeMotionSample(i * 0.02, v)),
    });
    const maxes = detectExtrema(r, { sensitivity: "standard" }).filter((e) => e.kind === "max");
    expect(maxes).toHaveLength(1);
    expect(maxes[0]!.index).toBeGreaterThanOrEqual(38);
    expect(maxes[0]!.index).toBeLessThanOrEqual(42);
  });

  it("sensitivity is monotone: Low ≤ Standard ≤ High in detected count", () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff - 0.5;
    };
    const r = run(
      (t) => 0.2 * Math.sin((t / (600 * 0.02)) * 6 * 2 * Math.PI) + rand() * 0.02,
      { n: 600 },
    );
    const low = detectExtrema(r, { sensitivity: "low" }).length;
    const std = detectExtrema(r, { sensitivity: "standard" }).length;
    const high = detectExtrema(r, { sensitivity: "high" }).length;
    expect(low).toBeLessThanOrEqual(std);
    expect(std).toBeLessThanOrEqual(high);
  });

  it("does not mutate the run", () => {
    const r = sine(0.2, 4);
    const snap = JSON.stringify(r.samples.map((s) => [s.timestampSeconds, s.positionMeters]));
    detectExtrema(r, { sensitivity: "high" });
    expect(JSON.stringify(r.samples.map((s) => [s.timestampSeconds, s.positionMeters]))).toBe(snap);
  });
});
