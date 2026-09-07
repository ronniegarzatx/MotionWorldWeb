import { describe, expect, it } from "vitest";
import {
  SAFE_MIN_METERS,
  WALK_TARGETS,
  nextIndex,
  prevIndex,
  targetById,
  targetIndexById,
} from "../../src/model/walk-target.js";

describe("WALK_TARGETS catalog", () => {
  it("has the 8 canonical targets, in order", () => {
    expect(WALK_TARGETS.map((t) => t.title)).toEqual([
      "Stand Still",
      "Walk Away",
      "Walk Toward",
      "Positive Constant Rate",
      "Negative Constant Rate",
      "Stop → Move",
      "Stop → Move → Stop",
      "Away → Pause → Toward",
    ]);
  });

  it("all ids are unique", () => {
    const ids = WALK_TARGETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every target: positive duration, ≥2 points, strictly increasing times", () => {
    for (const target of WALK_TARGETS) {
      expect(target.durationSeconds, target.id).toBeGreaterThan(0);
      expect(target.points.length, target.id).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < target.points.length; i++) {
        expect(target.points[i]!.timeSeconds, target.id).toBeGreaterThan(
          target.points[i - 1]!.timeSeconds,
        );
      }
      expect(target.points[0]!.timeSeconds).toBe(0);
      expect(target.points.at(-1)!.timeSeconds).toBe(target.durationSeconds);
    }
  });

  it("every position is finite, inside a safe classroom range, and starts out of the near zone", () => {
    for (const target of WALK_TARGETS) {
      for (const pt of target.points) {
        expect(Number.isFinite(pt.positionMeters), target.id).toBe(true);
        expect(pt.positionMeters, target.id).toBeGreaterThanOrEqual(SAFE_MIN_METERS);
        expect(pt.positionMeters, target.id).toBeLessThanOrEqual(4.0);
      }
      // no target begins inside the sensor's unreliable near zone
      expect(target.points[0]!.positionMeters, target.id).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("positionRange contains every point and is a sensible [lo, hi]", () => {
    for (const target of WALK_TARGETS) {
      const [lo, hi] = target.positionRange;
      expect(lo).toBeLessThan(hi);
      for (const pt of target.points) {
        expect(pt.positionMeters).toBeGreaterThanOrEqual(lo);
        expect(pt.positionMeters).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("durations are classroom-sized (5–8 s)", () => {
    for (const t of WALK_TARGETS) {
      expect(t.durationSeconds).toBeGreaterThanOrEqual(5);
      expect(t.durationSeconds).toBeLessThanOrEqual(8);
    }
  });
});

describe("navigation + lookup", () => {
  it("nextIndex / prevIndex wrap", () => {
    const n = WALK_TARGETS.length;
    expect(nextIndex(0)).toBe(1);
    expect(nextIndex(n - 1)).toBe(0);
    expect(prevIndex(0)).toBe(n - 1);
    expect(prevIndex(1)).toBe(0);
  });

  it("targetById / targetIndexById", () => {
    expect(targetById("walk-away")!.title).toBe("Walk Away");
    expect(targetById("nope")).toBeUndefined();
    expect(targetIndexById("walk-toward")).toBe(2);
    expect(targetIndexById("nope")).toBe(-1);
  });
});
