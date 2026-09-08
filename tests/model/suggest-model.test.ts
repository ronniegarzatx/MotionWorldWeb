import { describe, expect, it } from "vitest";
import type { ClassroomPoint } from "../../src/model/classroom-snapshot.js";
import { GOOD, MATERIAL, suggestModel } from "../../src/model/suggest-model.js";

const pts = (f: (x: number) => number, n = 8): ClassroomPoint[] =>
  Array.from({ length: n }, (_, x) => ({ x, y: f(x) }));

describe("suggestModel", () => {
  it("exports its thresholds", () => {
    expect(GOOD).toBe(0.98);
    expect(MATERIAL).toBe(0.03);
  });

  it("a perfect line -> linear", () => {
    expect(suggestModel(pts((x) => 2 * x + 1)).family).toBe("linear");
  });

  it("linear ~0.995 beats cubic 1.000 -> still linear", () => {
    // gently wavy around a line: cubic will fit ~perfectly, linear ~0.99+
    const wobble = [0, 0.06, -0.05, 0.04, -0.03, 0.05, -0.04, 0.02];
    const s = suggestModel(pts((x) => 2 * x + 1 + wobble[x]!));
    expect(s.family).toBe("linear");
  });

  it("a real parabola where the line materially fails -> quadratic", () => {
    expect(suggestModel(pts((x) => 0.5 * (x - 4) ** 2 + 1)).family).toBe("quadratic");
  });

  it("a flat run -> constant", () => {
    expect(suggestModel(pts(() => 2.5)).family).toBe("constant");
  });

  it("a clean V -> abs", () => {
    expect(suggestModel(pts((x) => 2 * Math.abs(x - 3.5) + 1)).family).toBe("abs");
  });

  it("clean exponential growth -> exp", () => {
    expect(suggestModel(pts((x) => 1.5 * Math.exp(0.4 * x))).family).toBe("exp");
  });

  it("returns a human reason string", () => {
    expect(typeof suggestModel(pts((x) => x)).reason).toBe("string");
  });
});
