import { describe, expect, it } from "vitest";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import { positionAt } from "../../src/model/run-interpolation.js";

const run = (pts: [number, number][]) =>
  makeMotionRun({
    id: "r",
    samplerHz: 25,
    source: "fake",
    deviceLabel: null,
    samples: pts.map(([t, x]) => makeMotionSample(t, x)),
  });

describe("positionAt", () => {
  const r = run([
    [0, 1.0],
    [1, 2.0],
    [2, 2.0],
    [3, 5.0],
  ]);

  it("is exact at a sample", () => {
    expect(positionAt(r, 0)).toBe(1.0);
    expect(positionAt(r, 2)).toBe(2.0);
    expect(positionAt(r, 3)).toBe(5.0);
  });

  it("interpolates linearly between samples", () => {
    expect(positionAt(r, 0.5)).toBeCloseTo(1.5, 12);
    expect(positionAt(r, 2.5)).toBeCloseTo(3.5, 12);
  });

  it("clamps outside the range", () => {
    expect(positionAt(r, -10)).toBe(1.0);
    expect(positionAt(r, 99)).toBe(5.0);
  });

  it("handles 0 / 1 sample runs", () => {
    expect(positionAt(run([]), 1)).toBe(0);
    expect(positionAt(run([[5, 1.7]]), 99)).toBe(1.7);
  });

  it("works with irregular timestamps", () => {
    const ir = run([
      [0, 0],
      [0.03, 3],
      [0.55, 3],
    ]);
    expect(positionAt(ir, 0.015)).toBeCloseTo(1.5, 10);
    expect(positionAt(ir, 0.29)).toBeCloseTo(3, 10);
  });

  it("does not mutate the run", () => {
    const snap = JSON.stringify(r.samples.map((s) => [s.timestampSeconds, s.positionMeters]));
    positionAt(r, 1.234);
    expect(JSON.stringify(r.samples.map((s) => [s.timestampSeconds, s.positionMeters]))).toBe(snap);
    expect(Object.isFrozen(r)).toBe(true);
  });
});
