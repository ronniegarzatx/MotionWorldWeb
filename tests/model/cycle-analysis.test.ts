import { describe, expect, it } from "vitest";
import {
  coefficientOfVariation,
  diff,
  estimateNoise,
  mad,
  median,
  movingAverage,
} from "../../src/model/cycle-analysis.js";

describe("movingAverage", () => {
  it("halfWindow 0 is the identity", () => {
    expect(movingAverage([1, 2, 3], 0)).toEqual([1, 2, 3]);
  });
  it("is centred and edge-clamped", () => {
    // halfWindow 1: [avg(1,1,2), avg(1,2,3), avg(2,3,3)]
    expect(movingAverage([1, 2, 3], 1)).toEqual([4 / 3, 2, 8 / 3]);
  });
  it("smooths a spike", () => {
    const out = movingAverage([0, 0, 10, 0, 0], 1);
    expect(out[2]).toBeCloseTo(10 / 3, 9);
    expect(Math.max(...out)).toBeLessThan(10);
  });
  it("does not mutate the input", () => {
    const input = [3, 1, 4, 1, 5];
    const copy = [...input];
    movingAverage(input, 2);
    expect(input).toEqual(copy);
  });
});

describe("median", () => {
  it("odd / even / single", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([7])).toBe(7);
  });
  it("does not mutate the input", () => {
    const input = [5, 2, 9, 1];
    const copy = [...input];
    median(input);
    expect(input).toEqual(copy);
  });
});

describe("mad", () => {
  it("is 1.4826 · median(|v − median|)", () => {
    // v = [1,2,3,4,5]  median 3  abs devs [2,1,0,1,2]  median 1
    expect(mad([1, 2, 3, 4, 5])).toBeCloseTo(1.4826, 4);
  });
  it("is 0 for a constant series", () => {
    expect(mad([2, 2, 2, 2])).toBe(0);
  });
});

describe("estimateNoise", () => {
  it("is ~0 for a smooth ramp", () => {
    const ramp = Array.from({ length: 50 }, (_, i) => i * 0.1);
    expect(estimateNoise(ramp)).toBeLessThan(1e-9);
  });
  it("approximates the white-noise sigma", () => {
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff - 0.5;
    };
    // uniform(-0.5,0.5) scaled to sd ~0.05: uniform sd = 1/sqrt(12) ≈ 0.2887
    const sd = 0.05;
    const noise = Array.from({ length: 400 }, () => (rand() / 0.2887) * sd);
    expect(estimateNoise(noise)).toBeGreaterThan(sd * 0.4);
    expect(estimateNoise(noise)).toBeLessThan(sd * 2.2);
  });
  it("is robust to a single large spike", () => {
    const base = Array.from({ length: 60 }, (_, i) => Math.sin(i * 0.3) * 0.01);
    const spiked = [...base];
    spiked[30] = 5;
    expect(estimateNoise(spiked)).toBeLessThan(0.1);
  });
});

describe("diff", () => {
  it("is first differences (length n−1)", () => {
    expect(diff([1, 3, 6, 10])).toEqual([2, 3, 4]);
    expect(diff([5])).toEqual([]);
  });
});

describe("coefficientOfVariation", () => {
  it("is 0 for a constant series", () => {
    expect(coefficientOfVariation([4, 4, 4])).toBe(0);
  });
  it("is 0 when the mean is ~0", () => {
    expect(coefficientOfVariation([-1, 1, -1, 1])).toBe(0);
  });
  it("matches std / |mean| for a known set", () => {
    // [2,4,4,4,5,5,7,9] mean 5, population sd 2
    expect(coefficientOfVariation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2 / 5, 9);
  });
});
