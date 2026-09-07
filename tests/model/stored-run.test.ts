import { describe, expect, it } from "vitest";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import {
  RUN_SCHEMA_VERSION,
  deserializeRun,
  serializeRun,
  summarizeStored,
} from "../../src/model/stored-run.js";

const mkRun = (opts: Partial<Parameters<typeof makeMotionRun>[0]> = {}) =>
  makeMotionRun({
    id: "run-abc",
    startedAtEpochMs: 1_000,
    samplerHz: 25,
    source: "sensor",
    deviceLabel: "Go! Motion",
    samples: [
      makeMotionSample(0, 1.4270000001),
      makeMotionSample(0.04, 1.4319999998),
      makeMotionSample(0.08, -0.065536),
    ],
    ...opts,
  });

describe("serializeRun", () => {
  it("stamps the schema version and preserves samples exactly (no rounding)", () => {
    const s = serializeRun(mkRun(), 5_000);
    expect(s.schemaVersion).toBe(RUN_SCHEMA_VERSION);
    expect(s.savedAtEpochMs).toBe(5_000);
    expect(s.samples).toEqual([
      { t: 0, x: 1.4270000001 },
      { t: 0.04, x: 1.4319999998 },
      { t: 0.08, x: -0.065536 },
    ]);
    expect(s.sampleCount).toBe(3);
  });

  it("carries the stop reason and derives `interrupted`", () => {
    expect(serializeRun(mkRun({ stopReason: "device_lost" })).interrupted).toBe(true);
    expect(serializeRun(mkRun({ stopReason: "navigation" })).interrupted).toBe(true);
    expect(serializeRun(mkRun({ stopReason: "ui" })).interrupted).toBe(false);
    expect(serializeRun(mkRun({ stopReason: null })).interrupted).toBe(false);
  });
});

describe("deserializeRun", () => {
  it("rebuilds a frozen MotionRun that round-trips byte-identically", () => {
    const original = serializeRun(mkRun({ stopReason: "ui" }), 7_777);
    const run = deserializeRun(original);
    expect(Object.isFrozen(run)).toBe(true);
    expect(Object.isFrozen(run.samples)).toBe(true);
    expect(run.id).toBe("run-abc");
    expect(run.stopReason).toBe("ui");
    expect(run.durationSeconds).toBeCloseTo(0.08, 10);

    const again = serializeRun(run, 7_777);
    expect(again).toEqual(original);
  });

  it("is not an editable substitute — the samples array is frozen", () => {
    const run = deserializeRun(serializeRun(mkRun()));
    expect(() => (run.samples as unknown[]).push({})).toThrow();
  });
});

describe("summarizeStored", () => {
  it("projects the list fields without samples", () => {
    const sum = summarizeStored(serializeRun(mkRun({ stopReason: "navigation" }), 9_000));
    expect(sum).toEqual({
      id: "run-abc",
      savedAtEpochMs: 9_000,
      startedAtEpochMs: 1_000,
      durationSeconds: expect.closeTo(0.08, 5),
      sampleCount: 3,
      source: "sensor",
      deviceLabel: "Go! Motion",
      stopReason: "navigation",
      interrupted: true,
    });
    expect("samples" in sum).toBe(false);
  });
});
