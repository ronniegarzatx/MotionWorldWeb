import { describe, expect, it } from "vitest";
import { WALK_TARGETS } from "../../src/model/walk-target.js";
import { targetPreviewPathD } from "../../src/ui/walk/target-preview.js";

describe("targetPreviewPathD", () => {
  it("maps the first/last points to the padded box edges", () => {
    const standStill = WALK_TARGETS[0]!; // flat 1.5 m over 6 s, range [0.5, 2.5]
    const d = targetPreviewPathD(standStill, 100, 40, 4);
    // x: 0 -> pad(4), duration -> w-pad(96)
    expect(d.startsWith("M 4.00")).toBe(true);
    expect(d).toContain("L 96.00");
  });

  it("produces one vertex per target point, non-empty for every catalog entry", () => {
    for (const target of WALK_TARGETS) {
      const d = targetPreviewPathD(target, 120, 48);
      expect(d.match(/[ML]/g)?.length, target.id).toBe(target.points.length);
    }
  });

  it("higher position maps to a smaller y (top of the box)", () => {
    const walkAway = WALK_TARGETS[1]!; // 1.0 -> 3.0
    const d = targetPreviewPathD(walkAway, 100, 100, 0);
    const ys = [...d.matchAll(/[ML] [\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys[1]).toBeLessThan(ys[0]!); // ends higher up = smaller y
  });
});
