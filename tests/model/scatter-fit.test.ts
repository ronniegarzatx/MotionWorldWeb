import { describe, expect, it } from "vitest";
import { fitScatter, pearsonR, MIN_SCATTER_POINTS, type ScatterPoint } from "../../src/model/scatter-fit.js";

describe("pearsonR", () => {
  it("is 1 for a perfect increasing line", () => {
    expect(pearsonR([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 9);
  });
  it("is -1 for a perfect decreasing line", () => {
    expect(pearsonR([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 9);
  });
  it("is 0 when y never varies", () => {
    expect(pearsonR([1, 2, 3], [5, 5, 5])).toBe(0);
  });
});

describe("fitScatter", () => {
  it("returns null below MIN_SCATTER_POINTS", () => {
    const points: ScatterPoint[] = [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    expect(points.length).toBeLessThan(MIN_SCATTER_POINTS);
    expect(fitScatter(points)).toBeNull();
  });

  it("a clean line: strong positive, best model linear", () => {
    const points = [1, 2, 3, 4, 5, 6].map((n) => ({ x: n, y: 2 * n + 1 }));
    const fit = fitScatter(points)!;
    expect(fit.direction).toBe("positive");
    expect(fit.strength).toBe("strong");
    expect(fit.r).toBeCloseTo(1, 6);
    expect(fit.linear.slope).toBeCloseTo(2, 6);
    expect(fit.linear.intercept).toBeCloseTo(1, 6);
    expect(fit.bestModel).toBe("linear");
  });

  it("a clean geometric decay: best model exponential, not forced linear", () => {
    // matches bounce-height decay: a_n = 5 * 0.5^n
    const points = [1, 2, 3, 4, 5, 6].map((n) => ({ x: n, y: 5 * 0.5 ** n }));
    const fit = fitScatter(points)!;
    expect(fit.exponential).not.toBeNull();
    expect(fit.exponential!.rSquared).toBeGreaterThan(fit.linear.rSquared);
    expect(fit.bestModel).toBe("exponential");
    expect(fit.exponential!.b).toBeCloseTo(0.5, 2);
  });

  it("an exactly constant sequence: a flat line fits perfectly too — ties go to linear, not exponential", () => {
    const points = [1, 2, 3, 4, 5, 6].map((n) => ({ x: n, y: 0.5 }));
    const fit = fitScatter(points)!;
    expect(fit.linear.rSquared).toBeCloseTo(1, 9);
    expect(fit.linear.slope).toBeCloseTo(0, 9);
    expect(fit.bestModel).toBe("linear");
  });

  it("a nearly constant sequence: weak/none correlation, best model neither", () => {
    const points = [1, 2, 3, 4, 5, 6].map((n, i) => ({ x: n, y: 1.4 + (i % 2 === 0 ? 0.001 : -0.001) }));
    const fit = fitScatter(points)!;
    expect(["weak", "none"]).toContain(fit.strength);
    expect(fit.bestModel).toBe("neither");
  });

  it("a decreasing relationship reports negative direction", () => {
    const points = [1, 2, 3, 4, 5].map((n) => ({ x: n, y: 10 - n }));
    const fit = fitScatter(points)!;
    expect(fit.direction).toBe("negative");
    expect(fit.strength).toBe("strong");
  });

  it("exponential fit is null when any y is non-positive", () => {
    const points = [
      { x: 1, y: -1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    const fit = fitScatter(points)!;
    expect(fit.exponential).toBeNull();
    expect(fit.bestModel).not.toBe("exponential");
  });
});
