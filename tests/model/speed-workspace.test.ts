import { describe, expect, it } from "vitest";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import {
  setSpeedLimit,
  setSpeedWindow,
  startSpeedWorkspace,
  useAllSpeed,
  withSpeedRun,
} from "../../src/model/speed-workspace.js";

const linear = (id: string, slope: number) =>
  makeMotionRun({
    id,
    samplerHz: 25,
    source: "sensor",
    deviceLabel: null,
    stopReason: "ui",
    samples: Array.from({ length: 101 }, (_, i) => makeMotionSample(i * 0.04, 1 + i * 0.04 * slope)),
  });

// a run whose slope is much steeper in its first half than its second
const kinked = makeMotionRun({
  id: "k",
  samplerHz: 25,
  source: "sensor",
  deviceLabel: null,
  stopReason: "ui",
  samples: Array.from({ length: 101 }, (_, i) => {
    const t = i * 0.04;
    return makeMotionSample(t, t < 2 ? 1 + t * 1.2 : 1 + 2.4 + (t - 2) * 0.1);
  }),
});

describe("speed-workspace", () => {
  it("starts on the full run with the default limit and a computed analysis", () => {
    const ws = startSpeedWorkspace(linear("a", 0.5));
    expect(ws.window.startSeconds).toBe(0);
    expect(ws.window.endSeconds).toBeCloseTo(4, 9);
    expect(ws.limitMph).toBe(5);
    expect(ws.analysis.ok).toBe(true);
    if (ws.analysis.ok) expect(ws.analysis.slopeMetersPerSecond).toBeCloseTo(0.5, 6);
    expect(ws.comparison).not.toBeNull();
    expect(ws.endpoint).not.toBeNull();
  });

  it("setSpeedWindow recomputes analysis + comparison + endpoint", () => {
    const ws0 = startSpeedWorkspace(kinked);
    const ws1 = setSpeedWindow(ws0, 0, 1.6);
    const ws2 = setSpeedWindow(ws0, 2.4, 4);
    expect(ws1.analysis.ok && ws2.analysis.ok).toBe(true);
    if (ws1.analysis.ok && ws2.analysis.ok) {
      expect(ws1.analysis.slopeMetersPerSecond).toBeGreaterThan(1);
      expect(ws2.analysis.slopeMetersPerSecond).toBeLessThan(0.5);
    }
    expect(ws1.endpoint!.endSeconds).toBeCloseTo(1.6, 6);
  });

  it("useAllSpeed returns to the full window", () => {
    const ws = useAllSpeed(setSpeedWindow(startSpeedWorkspace(linear("a", 0.5)), 1, 2));
    expect(ws.window.startSeconds).toBe(0);
    expect(ws.window.endSeconds).toBeCloseTo(4, 9);
  });

  it("setSpeedLimit only changes the comparison, not the slope", () => {
    const ws0 = startSpeedWorkspace(linear("a", 2.0)); // ~4.47 mph
    const ws1 = setSpeedLimit(ws0, 2);
    expect(ws1.limitMph).toBe(2);
    expect(ws1.comparison!.standing).toBe("over");
    expect(ws0.comparison!.standing).toBe("under"); // 4.47 < 5
    if (ws0.analysis.ok && ws1.analysis.ok) {
      expect(ws1.analysis.slopeMetersPerSecond).toBe(ws0.analysis.slopeMetersPerSecond);
    }
  });

  it("a degenerate window: analysis fails and comparison is null", () => {
    const ws = setSpeedWindow(startSpeedWorkspace(linear("a", 0.5)), 2, 2);
    expect(ws.analysis.ok).toBe(false);
    expect(ws.comparison).toBeNull();
    expect(ws.endpoint).toBeNull();
  });

  it("withSpeedRun resets to a new full-run workspace; same id is a no-op", () => {
    const ws = setSpeedLimit(startSpeedWorkspace(linear("a", 0.5)), 10);
    expect(withSpeedRun(ws, linear("a", 0.5))).toBe(ws);
    const swapped = withSpeedRun(ws, linear("b", 1.0));
    expect(swapped.run.id).toBe("b");
    expect(swapped.limitMph).toBe(5); // full reset
  });

  it("does not mutate the source run", () => {
    const run = linear("a", 0.5);
    const snap = JSON.stringify(run.samples.map((s) => [s.timestampSeconds, s.positionMeters]));
    setSpeedWindow(startSpeedWorkspace(run), 1, 3);
    expect(JSON.stringify(run.samples.map((s) => [s.timestampSeconds, s.positionMeters]))).toBe(snap);
  });
});
