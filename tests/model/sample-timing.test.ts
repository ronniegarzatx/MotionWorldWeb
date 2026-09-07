import { describe, expect, it } from "vitest";
import { summariseTiming } from "../../src/model/sample-timing.js";

describe("summariseTiming", () => {
  it("empty and single-sample inputs never throw and report nulls", () => {
    const e = summariseTiming([]);
    expect(e.sampleCount).toBe(0);
    expect(e.observedRateHz).toBeNull();

    const one = summariseTiming([123]);
    expect(one.sampleCount).toBe(1);
    expect(one.meanIntervalMs).toBeNull();
    expect(one.stdevIntervalMs).toBeNull();
  });

  it("perfect 25 Hz (40 ms spacing)", () => {
    const arr = Array.from({ length: 26 }, (_, i) => 1000 + i * 40);
    const t = summariseTiming(arr);
    expect(t.sampleCount).toBe(26);
    expect(t.elapsedSeconds).toBeCloseTo(1.0, 10);
    expect(t.observedRateHz).toBeCloseTo(25.0, 10);
    expect(t.meanIntervalMs).toBeCloseTo(40, 10);
    expect(t.stdevIntervalMs).toBeCloseTo(0, 10);
    expect(t.minIntervalMs).toBe(40);
    expect(t.maxIntervalMs).toBe(40);
    expect(t.lastIntervalMs).toBe(40);
  });

  it("jittered intervals: stdev matches hand calculation", () => {
    // intervals: 10, 20, 30, 40  -> mean 25, variance ((225+25+25+225)/4)=125
    const arr = [0, 10, 30, 60, 100];
    const t = summariseTiming(arr);
    expect(t.meanIntervalMs).toBeCloseTo(25, 10);
    expect(t.stdevIntervalMs).toBeCloseTo(Math.sqrt(125), 10);
    expect(t.minIntervalMs).toBe(10);
    expect(t.maxIntervalMs).toBe(40);
    expect(t.lastIntervalMs).toBe(40);
  });

  it("guards a zero elapsed span", () => {
    expect(summariseTiming([5, 5, 5]).observedRateHz).toBeNull();
  });
});
