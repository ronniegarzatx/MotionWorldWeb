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

  it("derives y from the dense trace + sampled points (a mid excursion isn't clipped)", () => {
    // a bump: rise to 3.4 in the middle then back
    const bump = makeMotionRun({
      id: "bump",
      samplerHz: 25,
      source: "fake",
      deviceLabel: null,
      samples: Array.from({ length: 81 }, (_, i) => {
        const t = i * 0.05;
        return makeMotionSample(t, 1.0 + 2.4 * Math.sin((Math.PI * t) / 4));
      }),
    });
    const s = makeClassroomSnapshot(bump, fullWindow(bump), 3); // 3 points miss the peak
    const d = classroomDomain(s);
    const traceMax = Math.max(...s.tracePoints.map((p) => p.y));
    expect(d.y[1]).toBeGreaterThanOrEqual(traceMax); // the peak is inside the domain
  });
});

describe("dense classroom motion trace", () => {
  it("includes every window sample + is anchored to x = 0 and x = N-1", () => {
    const s = makeClassroomSnapshot(walk, withRange(fullWindow(walk), walk, 0.5, 3.5), 5);
    // 0.5..3.5 s of a 0.04 s stream -> ~75 interior samples + 2 anchors
    expect(s.tracePoints.length).toBeGreaterThan(70);
    expect(s.tracePoints[0]!.x).toBe(0);
    expect(s.tracePoints.at(-1)!.x).toBeCloseTo(4, 9);
  });

  it("interior x values are continuous / non-integer", () => {
    const s = makeClassroomSnapshot(walk, fullWindow(walk), 5);
    const interior = s.tracePoints.slice(1, -1);
    const nonInteger = interior.filter((p) => !Number.isInteger(p.x));
    expect(nonInteger.length).toBeGreaterThan(interior.length / 2);
    // monotone increasing in x
    for (let i = 1; i < s.tracePoints.length; i++) {
      expect(s.tracePoints[i]!.x).toBeGreaterThanOrEqual(s.tracePoints[i - 1]!.x);
    }
  });

  it("trace y is UNROUNDED while display points stay snapped to 0.5", () => {
    const s = makeClassroomSnapshot(walk, withRange(fullWindow(walk), walk, 0.6, 3.4), 5);
    const offHalf = s.tracePoints.filter((p) => Math.abs((p.y / 0.5) % 1) > 1e-6);
    expect(offHalf.length).toBeGreaterThan(0); // trace is not on the 0.5 grid
    expect(s.points.every((p) => Math.abs((p.y / 0.5) % 1) < 1e-9)).toBe(true);
  });

  it("a raw sample at a representative time maps to the same classroom coord as its fit point", () => {
    // full 4 s walk, 5 points -> representative times 0,1,2,3,4 s exist as samples
    const s = makeClassroomSnapshot(walk, fullWindow(walk), 5);
    for (let k = 0; k < 5; k++) {
      const fp = s.fitPoints[k]!;
      // the trace point nearest classroom-x = k
      const near = s.tracePoints.reduce((a, b) => (Math.abs(b.x - k) < Math.abs(a.x - k) ? b : a));
      expect(near.x).toBeCloseTo(k, 6);
      expect(near.y).toBeCloseTo(fp.y, 6);
    }
  });

  it("does not mutate the source run", () => {
    const snap = JSON.stringify(walk.samples.map((s) => [s.timestampSeconds, s.positionMeters]));
    makeClassroomSnapshot(walk, fullWindow(walk), 8);
    expect(JSON.stringify(walk.samples.map((s) => [s.timestampSeconds, s.positionMeters]))).toBe(snap);
  });

  it("every fitPoint lies exactly on the dense trace polyline at its x", () => {
    // a window whose endpoints and interior representative times fall BETWEEN
    // samples, so the trace/fit alignment depends on interpolation, not luck
    const s = makeClassroomSnapshot(walk, withRange(fullWindow(walk), walk, 0.63, 3.29), 6);
    const pts = s.tracePoints;
    const traceYAt = (x: number): number => {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        if (x >= a.x - 1e-9 && x <= b.x + 1e-9) {
          const f = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
          return a.y + f * (b.y - a.y);
        }
      }
      return pts.at(-1)!.y;
    };
    for (const fp of s.fitPoints) {
      expect(traceYAt(fp.x)).toBeCloseTo(fp.y, 9);
    }
    // and the rounded display points are genuinely different from the fitPoints
    const anyRounded = s.points.some((p, i) => Math.abs(p.y - s.fitPoints[i]!.y) > 1e-6);
    expect(anyRounded).toBe(true);
  });
});
