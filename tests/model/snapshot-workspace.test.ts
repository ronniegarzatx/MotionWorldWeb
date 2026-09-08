import { describe, expect, it } from "vitest";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import { isFitFailure } from "../../src/model/model-fit.js";
import {
  changeWindow,
  makeSnapshot,
  runFit,
  runSuggest,
  selectWindow,
  setFamily,
  setPointCount,
  setWindowRange,
  startWorkspace,
  useAll,
} from "../../src/model/snapshot-workspace.js";

// a clean linear walk 1.0 -> 3.0 m over 4 s
const walk = makeMotionRun({
  id: "w",
  samplerHz: 25,
  source: "sensor",
  deviceLabel: null,
  samples: Array.from({ length: 101 }, (_, i) => makeMotionSample(i * 0.04, 1.0 + i * 0.04 * 0.5)),
});
const SNAP = JSON.stringify(walk.samples.map((s) => [s.timestampSeconds, s.positionMeters]));
const runUnchanged = () =>
  expect(JSON.stringify(walk.samples.map((s) => [s.timestampSeconds, s.positionMeters]))).toBe(SNAP);

describe("SnapshotWorkspace", () => {
  it("startWorkspace", () => {
    const ws = startWorkspace(walk);
    expect(ws).toMatchObject({ mode: "raw", window: null, pointCount: 5, snapshot: null, fit: null });
  });

  it("selectWindow / setWindowRange / useAll clamp and keep the window valid", () => {
    let ws = selectWindow(startWorkspace(walk));
    expect(ws.window).toEqual({ runId: "w", startSeconds: 0, endSeconds: 4 });
    ws = setWindowRange(ws, 1.0, 3.0);
    expect(ws.window!.startSeconds).toBeCloseTo(1.0, 10);
    expect(ws.window!.endSeconds).toBeCloseTo(3.0, 10);
    ws = setWindowRange(ws, -5, 99);
    expect(ws.window!.startSeconds).toBe(0);
    expect(ws.window!.endSeconds).toBe(4);
    ws = setWindowRange(ws, 2, 1); // reversed -> swapped
    expect(ws.window!.startSeconds).toBeLessThan(ws.window!.endSeconds);
    ws = useAll(ws);
    expect(ws.window).toEqual({ runId: "w", startSeconds: 0, endSeconds: 4 });
  });

  it("makeSnapshot -> snapshot mode + snapshot built + fit null", () => {
    let ws = setWindowRange(selectWindow(startWorkspace(walk)), 0.6, 3.4);
    ws = makeSnapshot(ws);
    expect(ws.mode).toBe("snapshot");
    expect(ws.snapshot!.pointCount).toBe(5);
    expect(ws.fit).toBeNull();
  });

  it("changeWindow -> back to raw, snapshot + fit gone", () => {
    let ws = runFit(setFamily(makeSnapshot(selectWindow(startWorkspace(walk))), "linear"));
    expect(ws.fit).not.toBeNull();
    ws = changeWindow(ws);
    expect(ws.mode).toBe("raw");
    expect(ws.snapshot).toBeNull();
    expect(ws.fit).toBeNull();
  });

  it("setPointCount rebuilds the snapshot and clears the fit", () => {
    let ws = runFit(setFamily(makeSnapshot(selectWindow(startWorkspace(walk))), "linear"));
    ws = setPointCount(ws, 8);
    expect(ws.snapshot!.pointCount).toBe(8);
    expect(ws.fit).toBeNull();
    expect(ws.family).toBe("linear"); // family may persist
    ws = setPointCount(ws, 99);
    expect(ws.snapshot!.pointCount).toBe(10);
  });

  it("setFamily keeps fit null until runFit", () => {
    let ws = makeSnapshot(selectWindow(startWorkspace(walk)));
    ws = setFamily(ws, "linear");
    expect(ws.fit).toBeNull();
    ws = runFit(ws);
    expect(ws.fit?.ok).toBe(true);
    if (ws.fit && !isFitFailure(ws.fit)) {
      expect(ws.fit.coefficients[0]).toBeCloseTo(0.5, 4); // slope of the walk over the grid
    }
  });

  it("runSuggest sets family + fit", () => {
    const ws = runSuggest(makeSnapshot(selectWindow(startWorkspace(walk))));
    expect(ws.family).toBe("linear");
    expect(ws.fit?.ok).toBe(true);
  });

  it("any window/pointCount change after a fit removes the stale fit", () => {
    let ws = runSuggest(makeSnapshot(selectWindow(startWorkspace(walk))));
    expect(ws.fit).not.toBeNull();
    ws = setWindowRange(ws, 1, 3);
    expect(ws.fit).toBeNull();
    expect(ws.snapshot).toBeNull();
  });

  it("never mutates the run", () => {
    let ws = startWorkspace(walk);
    ws = selectWindow(ws);
    ws = setWindowRange(ws, 1, 3);
    ws = makeSnapshot(ws);
    ws = setPointCount(ws, 7);
    ws = runSuggest(ws);
    runUnchanged();
  });
});
