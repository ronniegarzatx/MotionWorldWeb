import { describe, expect, it } from "vitest";
import {
  DISPLAY_MAX_METERS,
  DISPLAY_MIN_METERS,
  WALK_TARGETS,
  canonicalYRange,
  clampOffset,
  displayedPoints,
  isFlat,
  offsetLimits,
  targetById,
  targetOffsetLabel,
} from "../../src/model/walk-target.js";
import { TargetOffsets } from "../../src/ui/walk/target-offsets.js";

const standStill = targetById("stand-still")!;
const walkAway = targetById("walk-away")!;
const posRate = targetById("positive-constant-rate")!; // reaches 3.5 m

const CANONICAL_SNAPSHOT = JSON.stringify(WALK_TARGETS);

describe("catalog immutability under movement", () => {
  it("displayedPoints never mutates the canonical catalog", () => {
    for (const t of WALK_TARGETS) {
      displayedPoints(t, 0.7);
      displayedPoints(t, -0.4);
      clampOffset(t, 99);
      offsetLimits(t);
    }
    expect(JSON.stringify(WALK_TARGETS)).toBe(CANONICAL_SNAPSHOT);
  });
});

describe("isFlat / canonicalYRange", () => {
  it("Stand Still is flat, Walk Away is not", () => {
    expect(isFlat(standStill)).toBe(true);
    expect(isFlat(walkAway)).toBe(false);
    expect(canonicalYRange(standStill)).toEqual([1.5, 1.5]);
    expect(canonicalYRange(walkAway)).toEqual([1.0, 3.0]);
  });
});

describe("offsetLimits / clampOffset", () => {
  it("Stand Still (1.5 m) can move well up and down", () => {
    const { min, max } = offsetLimits(standStill);
    expect(min).toBeCloseTo(DISPLAY_MIN_METERS - 1.5, 10); // -1.0
    expect(max).toBeCloseTo(DISPLAY_MAX_METERS - 1.5, 10); // +2.0
  });
  it("a target already at 3.5 m cannot shift up", () => {
    expect(offsetLimits(posRate).max).toBeCloseTo(0, 10);
    expect(clampOffset(posRate, 1.0)).toBeCloseTo(0, 10);
  });
  it("clamps beyond the legal interval and rejects non-finite", () => {
    expect(clampOffset(standStill, 99)).toBeCloseTo(2.0, 10);
    expect(clampOffset(standStill, -99)).toBeCloseTo(-1.0, 10);
    expect(clampOffset(standStill, Number.NaN)).toBe(0);
  });
});

describe("displayedPoints — translate only, never distort", () => {
  it("adds the offset to every position and keeps times + slopes", () => {
    const off = 0.6;
    const shifted = displayedPoints(walkAway, off);
    expect(shifted.map((p) => p.timeSeconds)).toEqual(walkAway.points.map((p) => p.timeSeconds));
    for (let i = 0; i < shifted.length; i++) {
      expect(shifted[i]!.positionMeters).toBeCloseTo(walkAway.points[i]!.positionMeters + off, 10);
    }
    // slope of each segment unchanged
    const slope = (pts: readonly { timeSeconds: number; positionMeters: number }[], i: number) =>
      (pts[i + 1]!.positionMeters - pts[i]!.positionMeters) /
      (pts[i + 1]!.timeSeconds - pts[i]!.timeSeconds);
    for (let i = 0; i < walkAway.points.length - 1; i++) {
      expect(slope(shifted, i)).toBeCloseTo(slope(walkAway.points, i), 10);
    }
  });

  it("piecewise shape unchanged for a multi-segment target", () => {
    const t = targetById("stop-move-stop")!;
    const shifted = displayedPoints(t, -0.3);
    const shape = (pts: readonly { positionMeters: number }[]) =>
      pts.map((p, i) => (i === 0 ? 0 : p.positionMeters - pts[0]!.positionMeters));
    expect(shape(shifted)).toEqual(shape(t.points));
  });
});

describe("targetOffsetLabel", () => {
  it("flat target -> height", () => {
    expect(targetOffsetLabel(standStill, 0)).toBe("Target height: 1.5 m");
    expect(targetOffsetLabel(standStill, 0.5)).toBe("Target height: 2.0 m");
    expect(targetOffsetLabel(standStill, -1.0)).toBe("Target height: 0.5 m");
  });
  it("non-flat target -> signed shift", () => {
    expect(targetOffsetLabel(walkAway, 0)).toBe("Target shift: 0.0 m");
    expect(targetOffsetLabel(walkAway, 0.5)).toBe("Target shift: +0.5 m");
    expect(targetOffsetLabel(walkAway, -0.5)).toBe("Target shift: −0.5 m");
  });
});

describe("TargetOffsets — independent per target, defaults to 0", () => {
  it("stores, resets, and isolates per id", () => {
    const o = new TargetOffsets();
    expect(o.get("stand-still")).toBe(0);
    o.set("stand-still", 1.0);
    o.set("walk-away", -0.5);
    expect(o.get("stand-still")).toBe(1.0);
    expect(o.get("walk-away")).toBe(-0.5);
    o.reset("stand-still");
    expect(o.get("stand-still")).toBe(0);
    expect(o.get("walk-away")).toBe(-0.5);
  });
});
