import { describe, expect, it } from "vitest";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import {
  activeSamples,
  fullWindow,
  useAll,
  windowContains,
  windowDurationSeconds,
  withEnd,
  withRange,
  withStart,
} from "../../src/model/analysis-window.js";

const run = (times: number[]) =>
  makeMotionRun({
    samples: times.map((t, i) => makeMotionSample(t, i)),
    samplerHz: 25,
    source: "fake",
    deviceLabel: null,
    id: "run-1",
  });

const REGULAR = run([0, 0.04, 0.08, 0.12, 0.16, 0.2]);
const IRREGULAR = run([0, 0.03, 0.11, 0.14, 0.29, 0.3, 0.55]);

describe("fullWindow / useAll", () => {
  it("spans first..last timestamp", () => {
    expect(fullWindow(REGULAR)).toEqual({ runId: "run-1", startSeconds: 0, endSeconds: 0.2 });
  });
  it("degenerate for a 0/1-sample run — still valid, no NaN", () => {
    const empty = run([]);
    const one = run([1.5]);
    expect(fullWindow(empty)).toEqual({ runId: "run-1", startSeconds: 0, endSeconds: 0 });
    expect(fullWindow(one)).toEqual({ runId: "run-1", startSeconds: 1.5, endSeconds: 1.5 });
    expect(windowDurationSeconds(fullWindow(one))).toBe(0);
  });
  it("useAll returns the full window", () => {
    const w = withStart(fullWindow(REGULAR), REGULAR, 0.08);
    expect(useAll(w, REGULAR)).toEqual(fullWindow(REGULAR));
  });
});

describe("withStart / withEnd / withRange clamp into [runStart, runEnd] and keep start < end", () => {
  const full = fullWindow(REGULAR);

  it("trims the start", () => {
    expect(withStart(full, REGULAR, 0.08).startSeconds).toBeCloseTo(0.08, 10);
  });
  it("trims the end", () => {
    expect(withEnd(full, REGULAR, 0.12).endSeconds).toBeCloseTo(0.12, 10);
  });
  it("trims both", () => {
    const w = withRange(full, REGULAR, 0.04, 0.16);
    expect(w.startSeconds).toBeCloseTo(0.04, 10);
    expect(w.endSeconds).toBeCloseTo(0.16, 10);
  });
  it("clamps out-of-range and non-finite values", () => {
    expect(withStart(full, REGULAR, -5).startSeconds).toBe(0);
    expect(withEnd(full, REGULAR, 999).endSeconds).toBe(0.2);
    expect(withStart(full, REGULAR, Number.NaN).startSeconds).toBe(0);
    expect(withEnd(full, REGULAR, Number.POSITIVE_INFINITY).endSeconds).toBe(0.2);
  });
  it("never lets start cross end", () => {
    const w = withStart(full, REGULAR, 0.5); // past the end
    expect(w.startSeconds).toBeLessThan(w.endSeconds);
    const w2 = withEnd(full, REGULAR, -1); // before the start
    expect(w2.startSeconds).toBeLessThan(w2.endSeconds);
  });
  it("withRange swaps reversed inputs", () => {
    const w = withRange(full, REGULAR, 0.16, 0.04);
    expect(w.startSeconds).toBeLessThan(w.endSeconds);
    expect(w.startSeconds).toBeCloseTo(0.04, 10);
  });
});

describe("windowContains — inclusive both ends", () => {
  const w = withRange(fullWindow(IRREGULAR), IRREGULAR, 0.11, 0.29);
  it("includes both boundaries", () => {
    expect(windowContains(w, 0.11)).toBe(true);
    expect(windowContains(w, 0.29)).toBe(true);
  });
  it("excludes outside", () => {
    expect(windowContains(w, 0.03)).toBe(false);
    expect(windowContains(w, 0.3)).toBe(false);
  });
});

describe("activeSamples — irregular timestamps, no resampling", () => {
  it("selects samples on/inside the boundaries", () => {
    const w = withRange(fullWindow(IRREGULAR), IRREGULAR, 0.11, 0.29);
    const times = activeSamples(w, IRREGULAR).map((s) => s.timestampSeconds);
    expect(times).toEqual([0.11, 0.14, 0.29]);
  });
  it("full window selects every sample", () => {
    expect(activeSamples(fullWindow(IRREGULAR), IRREGULAR)).toHaveLength(7);
  });
});

describe("immutability", () => {
  it("the MotionRun is frozen and unchanged after every op", () => {
    const r = run([0, 0.1, 0.2, 0.3]);
    const snapshot = JSON.stringify(r.samples.map((s) => [s.timestampSeconds, s.positionMeters]));
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.samples)).toBe(true);

    let w = fullWindow(r);
    w = withStart(w, r, 0.1);
    w = withEnd(w, r, 0.2);
    w = withRange(w, r, 0.05, 0.25);
    w = useAll(w, r);
    activeSamples(w, r);

    expect(JSON.stringify(r.samples.map((s) => [s.timestampSeconds, s.positionMeters]))).toBe(snapshot);
  });
});
