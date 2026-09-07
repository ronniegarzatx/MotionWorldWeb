import { describe, expect, it } from "vitest";
import { computePresentationState } from "../../src/app/presentation-state.js";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import type { AcquisitionUiState } from "../../src/acquisition/acquisition-controller.js";

const ui = (overrides: Partial<AcquisitionUiState> = {}): AcquisitionUiState => ({
  state: "MEASURING",
  connected: true,
  connecting: false,
  deviceLabel: "Go! Motion",
  canConnect: false,
  canReconnect: false,
  canArm: false,
  canDisarm: false,
  canStart: false,
  canStop: true,
  lastStopReason: null,
  lastError: null,
  ...overrides,
});

describe("computePresentationState", () => {
  it("is a plain, JSON-round-trippable object (no functions / DOM)", () => {
    const s = computePresentationState("live", ui(), null, { timestampSeconds: 1, positionMeters: 2 }, 3);
    const round = JSON.parse(JSON.stringify(s));
    expect(round).toEqual(s);
    expect(typeof s.derivedReadouts).toBe("object");
  });

  it("prefers the live sample for readouts", () => {
    const s = computePresentationState("live", ui(), null, { timestampSeconds: 3.24, positionMeters: 1.427 }, 1);
    expect(s.derivedReadouts).toMatchObject({ position: "1.427 m", time: "3.240 s" });
    expect(s.collecting).toBe(true);
  });

  it("falls back to the last completed run", () => {
    const run = makeMotionRun({
      samples: [makeMotionSample(0, 1), makeMotionSample(0.04, 4.3)],
      samplerHz: 25,
      source: "fake",
      deviceLabel: null,
      id: "run-x",
    });
    const s = computePresentationState("data", ui({ state: "SENSOR_READY", canStop: false }), run, null, 1);
    expect(s.activeRunId).toBe("run-x");
    expect(s.derivedReadouts["position"]).toBe("4.300 m");
    expect(s.collecting).toBe(false);
  });

  it("no data -> empty readouts", () => {
    const s = computePresentationState("home", ui({ state: "SYSTEM_READY" }), null, null, 0);
    expect(s.derivedReadouts).toEqual({});
    expect(s.activeRunId).toBeNull();
  });
});
