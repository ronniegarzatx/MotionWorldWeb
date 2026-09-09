import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../src/art/seeded-random.js";

describe("seeded-random", () => {
  it("the same seed produces an identical sequence", () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds diverge", () => {
    const a = createSeededRandom(1);
    const b = createSeededRandom(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("next() stays in [0, 1)", () => {
    const rng = createSeededRandom(7);
    for (let i = 0; i < 2000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("range(min, max) stays within bounds and spans both ends over enough draws", () => {
    const rng = createSeededRandom(99);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 2000; i++) {
      const v = rng.range(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeLessThan(11);
    expect(max).toBeGreaterThan(19);
  });

  it("int(min, maxExclusive) never returns maxExclusive", () => {
    const rng = createSeededRandom(5);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(0, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(3);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it("pick only returns elements from the given array", () => {
    const rng = createSeededRandom(3);
    const items = ["a", "b", "c"] as const;
    for (let i = 0; i < 200; i++) {
      expect(items).toContain(rng.pick(items));
    }
  });

  it("pick on a single-element array always returns that element", () => {
    const rng = createSeededRandom(11);
    for (let i = 0; i < 20; i++) {
      expect(rng.pick(["only"])).toBe("only");
    }
  });
});
