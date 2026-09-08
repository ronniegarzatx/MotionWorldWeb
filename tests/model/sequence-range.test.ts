import { describe, expect, it } from "vitest";
import {
  applyRange,
  clampRange,
  fullRange,
  includedIndices,
  withEnd,
  withStart,
} from "../../src/model/sequence-range.js";

describe("sequence-range", () => {
  it("fullRange covers 1..count; empty count → {1,0}", () => {
    expect(fullRange(6)).toEqual({ start: 1, end: 6 });
    expect(fullRange(0)).toEqual({ start: 1, end: 0 });
  });

  it("clampRange keeps 1 ≤ start ≤ end ≤ count", () => {
    expect(clampRange({ start: 0, end: 99 }, 5)).toEqual({ start: 1, end: 5 });
    expect(clampRange({ start: 4, end: 2 }, 5)).toEqual({ start: 4, end: 4 });
    expect(clampRange({ start: 3, end: 5 }, 5)).toEqual({ start: 3, end: 5 });
  });

  it("withStart / withEnd cannot cross", () => {
    expect(withStart({ start: 2, end: 5 }, 6, 5)).toEqual({ start: 5, end: 5 });
    expect(withStart({ start: 2, end: 5 }, 6, 9)).toEqual({ start: 5, end: 5 });
    expect(withEnd({ start: 2, end: 5 }, 6, 1)).toEqual({ start: 2, end: 2 });
    expect(withEnd({ start: 2, end: 5 }, 6, 6)).toEqual({ start: 2, end: 6 });
  });

  it("includedIndices lists the kept 1-based n's", () => {
    expect(includedIndices({ start: 2, end: 4 })).toEqual([2, 3, 4]);
  });

  it("applyRange partitions, preserving order and original n", () => {
    const events = ["a", "b", "c", "d", "e"];
    const { included, excluded } = applyRange(events, { start: 2, end: 4 });
    expect(included).toEqual([
      { n: 2, item: "b" },
      { n: 3, item: "c" },
      { n: 4, item: "d" },
    ]);
    expect(excluded).toEqual([
      { n: 1, item: "a" },
      { n: 5, item: "e" },
    ]);
  });

  it("applyRange on an empty list is empty", () => {
    expect(applyRange([], fullRange(0))).toEqual({ included: [], excluded: [] });
  });
});
