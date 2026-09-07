import { describe, expect, it } from "vitest";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import { fullWindow, withRange } from "../../src/model/analysis-window.js";
import {
  DEFAULT_POINTS,
  classroomDomain,
  clampPointCount,
  makeClassroomSnapshot,
} from "../../src/model/classroom-snapshot.js";

// a clean linear walk 1.0 -> 3.0 m over 4 s
const walk = makeMotionRun({
  id: "walk-1",
  samplerHz: 25,
  source: "sensor",
  deviceLabel: null,
  samples: Array.from({ length: 101 }, (_, i) =>
    makeMotionSample(i * 0.04, 1.0 + (i * 0.04) * 0.5),
  ),
});

describe("makeClassroomSnapshot", () => {
  it("x is the integer grid 0..N-1; N defaults + clamps to [3,10]", () => {
    expect(clampPointCount(0)).toBe(3);
    expect(clampPointCount(99)).toBe(10);
    expect(clampPointCount(5.4)).toBe(5);
    const s = makeClassroomSnapshot(walk, fullWindow(walk), DEFAULT_POINTS);
    expect(s.pointCount).toBe(5);
    expect(s.points.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
    expect(s.fitPoints.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
  });

  it("fitPoints.y is the unrounded interpolated position; points.y is snapped to 0.5", () => {
    // window 0.6 s -> 3.4 s of the linear walk: y goes 1.3 -> 2.7
    const s = makeClassroomSnapshot(walk, withRange(fullWindow(walk), walk, 0.6, 3.4), 5);
    expect(s.fitPoints.map((p) => Number(p.y.toFixed(4)))).toEqual([1.3, 1.65, 2.0, 2.35, 2.7]);
    expect(s.points.map((p) => p.y)).toEqual([1.5, 1.5, 2.0, 2.5, 2.5]);
  });

  it("is deterministic (no random sampling)", () => {
    const a = makeClassroomSnapshot(walk, fullWindow(walk), 7);
    const b = makeClassroomSnapshot(walk, fullWindow(walk), 7);
    expect(a.fitPoints).toEqual(b.fitPoints);
  });

  it("a clean linear window gives clean points", () => {
    const s = makeClassroomSnapshot(walk, fullWindow(walk), 5);
    // full 4 s: y 1.0 -> 3.0
    expect(s.fitPoints.map((p) => Number(p.y.toFixed(4)))).toEqual([1.0, 1.5, 2.0, 2.5, 3.0]);
  });

  it("degenerate window -> an (effectively) constant point set, no crash", () => {
    const zero = withRange(fullWindow(walk), walk, 2.0, 2.0);
    const s = makeClassroomSnapshot(walk, zero, 4);
    const ys = s.fitPoints.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-6);
    expect(s.points.every((p) => Number.isFinite(p.y))).toBe(true);
  });

  it("does not mutate the source run", () => {
    const snap = JSON.stringify(walk.samples.map((s) => [s.timestampSeconds, s.positionMeters]));
    makeClassroomSnapshot(walk, fullWindow(walk), 10);
    expect(JSON.stringify(walk.samples.map((s) => [s.timestampSeconds, s.positionMeters]))).toBe(snap);
    expect(Object.isFrozen(walk)).toBe(true);
  });
});

describe("classroomDomain", () => {
  it("is fixed: x spans the grid + pad, y padded to 0.5", () => {
    const s = makeClassroomSnapshot(walk, fullWindow(walk), 5); // y 1..3
    const d = classroomDomain(s);
    expect(d.x[0]).toBeLessThan(0);
    expect(d.x[1]).toBeGreaterThan(4);
    expect(d.y[0]).toBeLessThanOrEqual(1);
    expect(d.y[1]).toBeGreaterThanOrEqual(3);
  });
});
