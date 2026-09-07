import { describe, expect, it } from "vitest";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import { makeMotionRun } from "../../src/model/motion-run.js";

const s = makeMotionSample;

describe("makeMotionRun", () => {
  it("freezes the run and its samples array", () => {
    const run = makeMotionRun({
      samples: [s(0, 1), s(0.04, 1.1)],
      samplerHz: 25,
      source: "fake",
      deviceLabel: "CBR 2 / Go!Motion",
    });
    expect(Object.isFrozen(run)).toBe(true);
    expect(Object.isFrozen(run.samples)).toBe(true);
  });

  it("computes sampleCount and durationSeconds from endpoints", () => {
    const run = makeMotionRun({
      samples: [s(1.0, 0), s(1.04, 0), s(1.08, 0)],
      samplerHz: 25,
      source: "sensor",
      deviceLabel: null,
    });
    expect(run.sampleCount).toBe(3);
    expect(run.durationSeconds).toBeCloseTo(0.08, 10);
  });

  it("duration is 0 for fewer than 2 samples", () => {
    expect(
      makeMotionRun({ samples: [], samplerHz: 25, source: "fake", deviceLabel: null })
        .durationSeconds,
    ).toBe(0);
    expect(
      makeMotionRun({ samples: [s(5, 1)], samplerHz: 25, source: "fake", deviceLabel: null })
        .durationSeconds,
    ).toBe(0);
  });

  it("honours injected id and startedAtEpochMs", () => {
    const run = makeMotionRun({
      samples: [],
      samplerHz: 25,
      source: "fake",
      deviceLabel: null,
      id: "run-1",
      startedAtEpochMs: 1_000,
    });
    expect(run.id).toBe("run-1");
    expect(run.startedAtEpochMs).toBe(1_000);
  });

  it("copies the samples array (caller mutation cannot leak in)", () => {
    const src = [s(0, 1), s(0.04, 2)];
    const run = makeMotionRun({ samples: src, samplerHz: 25, source: "fake", deviceLabel: null });
    src.push(s(0.08, 3));
    expect(run.sampleCount).toBe(2);
  });
});
