import { describe, expect, it } from "vitest";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import { fullWindow, withRange } from "../../src/model/analysis-window.js";
import { positionAt } from "../../src/model/run-interpolation.js";
import { endpointSlope } from "../../src/model/endpoint-slope.js";

const walk = makeMotionRun({
  id: "w",
  samplerHz: 25,
  source: "sensor",
  deviceLabel: null,
  stopReason: "ui",
  samples: Array.from({ length: 101 }, (_, i) => makeMotionSample(i * 0.04, 1.0 + i * 0.04 * 0.5)),
});

describe("endpointSlope", () => {
  it("endpoints come from positionAt at the window bounds", () => {
    const w = withRange(fullWindow(walk), walk, 0.63, 3.29);
    const e = endpointSlope(walk, w)!;
    expect(e.startSeconds).toBeCloseTo(0.63, 9);
    expect(e.endSeconds).toBeCloseTo(3.29, 9);
    expect(e.startMeters).toBeCloseTo(positionAt(walk, 0.63), 9);
    expect(e.endMeters).toBeCloseTo(positionAt(walk, 3.29), 9);
    expect(e.deltaSeconds).toBeCloseTo(3.29 - 0.63, 9);
    expect(e.deltaMeters).toBeCloseTo(e.endMeters - e.startMeters, 12);
    expect(e.slopeMetersPerSecond).toBeCloseTo(0.5, 6);
  });

  it("null when the window duration is effectively zero", () => {
    expect(endpointSlope(walk, withRange(fullWindow(walk), walk, 2.0, 2.0))).toBeNull();
  });

  it("does not mutate the run", () => {
    const snap = JSON.stringify(walk.samples.map((s) => [s.timestampSeconds, s.positionMeters]));
    endpointSlope(walk, fullWindow(walk));
    expect(JSON.stringify(walk.samples.map((s) => [s.timestampSeconds, s.positionMeters]))).toBe(snap);
  });
});
