import { describe, expect, it } from "vitest";
import type { AnalysisWindow } from "../../src/model/analysis-window.js";
import {
  MIN_ZOOM_Y_SPAN_METERS,
  initialViewport,
  reduceViewport,
  zoomedXDomain,
  zoomedYDomain,
} from "../../src/model/speed-viewport.js";

const win = (startSeconds: number, endSeconds: number): AnalysisWindow => ({
  runId: "r",
  startSeconds,
  endSeconds,
});

describe("speed viewport mode", () => {
  it("defaults to full", () => {
    expect(initialViewport().mode).toBe("full");
  });

  it("zoom-to-window -> window; full-run -> full", () => {
    const full = initialViewport();
    const zoomed = reduceViewport(full, { type: "zoom-to-window" });
    expect(zoomed.mode).toBe("window");
    expect(reduceViewport(zoomed, { type: "full-run" }).mode).toBe("full");
  });

  it("Use All while zoomed returns to full", () => {
    const zoomed = reduceViewport(initialViewport(), { type: "zoom-to-window" });
    expect(reduceViewport(zoomed, { type: "use-all" }).mode).toBe("full");
  });

  it("a run change always resets to full", () => {
    const zoomed = reduceViewport(initialViewport(), { type: "zoom-to-window" });
    expect(reduceViewport(zoomed, { type: "run-changed" }).mode).toBe("full");
    expect(reduceViewport(initialViewport(), { type: "run-changed" }).mode).toBe("full");
  });

  it("is pure — no mutation, stable identity when unchanged", () => {
    const full = initialViewport();
    expect(reduceViewport(full, { type: "full-run" })).toBe(full);
    const zoomed = reduceViewport(full, { type: "zoom-to-window" });
    expect(reduceViewport(zoomed, { type: "zoom-to-window" })).toBe(zoomed);
    expect(full.mode).toBe("full"); // untouched
  });
});

describe("zoomedXDomain", () => {
  it("is exactly the AnalysisWindow bounds", () => {
    expect(zoomedXDomain(win(18.1, 18.45))).toEqual([18.1, 18.45]);
  });

  it("widens a zero-length interval so the chart never divides by zero", () => {
    const [a, b] = zoomedXDomain(win(2, 2));
    expect(b).toBeGreaterThan(a);
    expect(Number.isFinite(a) && Number.isFinite(b)).toBe(true);
  });
});

describe("zoomedYDomain", () => {
  it("brackets the sample range with modest padding", () => {
    const [lo, hi] = zoomedYDomain([1.0, 1.4, 1.2, 1.35]);
    expect(lo).toBeLessThan(1.0);
    expect(hi).toBeGreaterThan(1.4);
    expect(hi - lo).toBeLessThan(1.0); // not blown out
  });

  it("gives nearly-constant motion a sensible minimum span", () => {
    const [lo, hi] = zoomedYDomain([2.001, 2.0, 2.002, 1.999]);
    expect(hi - lo).toBeGreaterThanOrEqual(MIN_ZOOM_Y_SPAN_METERS);
    expect((lo + hi) / 2).toBeCloseTo(2.0, 2);
  });

  it("includes noisy extremes", () => {
    const ys = [0.5, 0.9, 0.3, 1.1, 0.6, 0.2, 1.0];
    const [lo, hi] = zoomedYDomain(ys);
    expect(lo).toBeLessThanOrEqual(0.2);
    expect(hi).toBeGreaterThanOrEqual(1.1);
  });

  it("filters non-finite input and still returns a finite domain", () => {
    const [lo, hi] = zoomedYDomain([NaN, 1.0, Infinity, 1.5, -Infinity]);
    expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
    expect(lo).toBeLessThan(1.0);
    expect(hi).toBeGreaterThan(1.5);
  });

  it("handles an empty / all-invalid input without NaN", () => {
    for (const input of [[], [NaN, Infinity]]) {
      const [lo, hi] = zoomedYDomain(input);
      expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
      expect(hi).toBeGreaterThan(lo);
    }
  });

  it("works for a very short (2-value) interval", () => {
    const [lo, hi] = zoomedYDomain([0.19, 0.67]);
    expect(lo).toBeLessThan(0.19);
    expect(hi).toBeGreaterThan(0.67);
  });

  it("does not mutate its input", () => {
    const input = [3, 1, 2];
    const snapshot = [...input];
    zoomedYDomain(input);
    expect(input).toEqual(snapshot);
  });
});
