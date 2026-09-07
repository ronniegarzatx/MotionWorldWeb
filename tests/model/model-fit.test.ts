import { describe, expect, it } from "vitest";
import type { ClassroomPoint } from "../../src/model/classroom-snapshot.js";
import { fitModel, isFitFailure, predict } from "../../src/model/model-fit.js";

const pts = (f: (x: number) => number, n = 7): ClassroomPoint[] =>
  Array.from({ length: n }, (_, x) => ({ x, y: f(x) }));

function expectFit(family: Parameters<typeof fitModel>[0], points: ClassroomPoint[]) {
  const r = fitModel(family, points);
  if (isFitFailure(r)) throw new Error(`expected a fit, got: ${r.reason}`);
  return r;
}

describe("polynomial fits", () => {
  it("constant y=2", () => {
    const r = expectFit("constant", pts(() => 2));
    expect(r.coefficients[0]).toBeCloseTo(2, 9);
    expect(r.rSquared).toBe(1);
  });

  it("linear y=3x-1", () => {
    const r = expectFit("linear", pts((x) => 3 * x - 1));
    expect(r.coefficients[0]).toBeCloseTo(3, 6);
    expect(r.coefficients[1]).toBeCloseTo(-1, 6);
    expect(r.rSquared).toBeCloseTo(1, 9);
    expect(r.preciseExpression).toBe("f(x) = 3x - 1");
    expect(predict("linear", r.coefficients, 10)).toBeCloseTo(29, 6);
  });

  it("quadratic y=2x^2-x+4", () => {
    const r = expectFit("quadratic", pts((x) => 2 * x * x - x + 4));
    expect(r.coefficients.map((c) => Number(c.toFixed(4)))).toEqual([2, -1, 4]);
    expect(r.rSquared).toBeCloseTo(1, 9);
  });

  it("cubic y=x^3-2x^2+x", () => {
    const r = expectFit("cubic", pts((x) => x ** 3 - 2 * x * x + x));
    expect(r.coefficients.map((c) => Number(c.toFixed(3)))).toEqual([1, -2, 1, 0]);
    expect(r.rSquared).toBeCloseTo(1, 8);
  });

  it("noisy linear -> good but not perfect r^2", () => {
    const noise = [0.03, -0.05, 0.02, -0.01, 0.04, -0.03, 0.01];
    const r = expectFit("linear", pts((x) => 2 * x + 1 + noise[x]!));
    expect(r.rSquared).toBeGreaterThan(0.9);
    expect(r.rSquared).toBeLessThan(1);
  });

  it("insufficient points -> FitFailure", () => {
    expect(isFitFailure(fitModel("linear", [{ x: 1, y: 1 }]))).toBe(true);
    expect(isFitFailure(fitModel("cubic", pts((x) => x, 3)))).toBe(true);
  });

  it("a bad fit reports an honest (low) r^2", () => {
    const r = expectFit("linear", [
      { x: 0, y: 0 },
      { x: 1, y: 5 },
      { x: 2, y: 0 },
      { x: 3, y: 5 },
      { x: 4, y: 0 },
    ]);
    expect(r.rSquared).toBeLessThan(0.5);
  });
});

describe("abs / sqrt / exp fits", () => {
  it("abs y=2|x-3|+1", () => {
    const r = expectFit("abs", pts((x) => 2 * Math.abs(x - 3) + 1));
    expect(r.coefficients[0]).toBeCloseTo(2, 4);
    expect(r.coefficients[1]).toBeCloseTo(3, 4);
    expect(r.coefficients[2]).toBeCloseTo(1, 4);
    expect(r.rSquared).toBeCloseTo(1, 6);
  });

  it("sqrt y=1.5*sqrt(x)+0.5", () => {
    const r = expectFit("sqrt", pts((x) => 1.5 * Math.sqrt(x) + 0.5));
    expect(r.coefficients[0]).toBeCloseTo(1.5, 3);
    expect(r.coefficients[2]).toBeCloseTo(0.5, 3);
    expect(r.rSquared).toBeGreaterThan(0.99);
  });

  it("exp y=2*e^(0.5x)", () => {
    const r = expectFit("exp", pts((x) => 2 * Math.exp(0.5 * x)));
    expect(r.coefficients[0]).toBeCloseTo(2, 3);
    expect(r.coefficients[1]).toBeCloseTo(0.5, 3);
    expect(r.rSquared).toBeGreaterThan(0.99);
  });

  it("exp refuses data with a non-positive y", () => {
    const bad = fitModel("exp", pts((x) => x - 3));
    expect(isFitFailure(bad)).toBe(true);
  });

  it("exp refuses an essentially-straight line (|b|≈0)", () => {
    const line = fitModel("exp", pts(() => 5)); // constant positive
    expect(isFitFailure(line)).toBe(true);
  });

  it("sqrt refuses non-monotone junk", () => {
    const junk = fitModel("sqrt", [
      { x: 0, y: 5 },
      { x: 1, y: 0 },
      { x: 2, y: 9 },
      { x: 3, y: 1 },
    ]);
    expect(isFitFailure(junk)).toBe(true);
  });
});
