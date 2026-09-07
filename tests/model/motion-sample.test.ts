import { describe, expect, it } from "vitest";
import { makeMotionSample } from "../../src/model/motion-sample.js";

describe("makeMotionSample", () => {
  it("returns a frozen object with exact fields", () => {
    const s = makeMotionSample(3.24, 1.427);
    expect(s).toEqual({ timestampSeconds: 3.24, positionMeters: 1.427 });
    expect(Object.isFrozen(s)).toBe(true);
  });

  it("rejects non-finite input", () => {
    expect(() => makeMotionSample(Number.NaN, 1)).toThrow(RangeError);
    expect(() => makeMotionSample(1, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("allows negative position (toward the sensor / origin choice)", () => {
    expect(makeMotionSample(0, -0.5).positionMeters).toBe(-0.5);
  });
});
