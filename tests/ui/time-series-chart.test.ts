// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildPathD,
  computeXDomain,
  computeYDomain,
  makeScale,
  mountChart,
  type ChartSeries,
} from "../../src/ui/chart/time-series-chart.js";

const series = (t: number[], x: number[]): ChartSeries => ({ t, x });

describe("computeXDomain", () => {
  it("explicit passthrough", () => {
    expect(computeXDomain(series([], []), [2, 8])).toEqual([2, 8]);
  });
  it("auto-grow: below the floor -> [0, 10]", () => {
    expect(computeXDomain(series([0, 1, 3], [0, 0, 0]), "auto-grow")).toEqual([0, 10]);
  });
  it("auto-grow: past the floor -> 30 s sliding window", () => {
    expect(computeXDomain(series([0, 42], [0, 0]), "auto-grow")).toEqual([12, 42]);
  });
  it("auto-grow: between 10 and 30 -> bottom clamped at 0", () => {
    expect(computeXDomain(series([0, 20], [0, 0]), "auto-grow")).toEqual([0, 20]);
  });
});

describe("computeYDomain", () => {
  it("empty series keeps prev (or a default)", () => {
    expect(computeYDomain(series([], []), "auto")).toEqual([0, 1]);
    expect(computeYDomain(series([], []), "auto", [1, 4])).toEqual([1, 4]);
  });
  it("pads the data range", () => {
    const d = computeYDomain(series([0, 1], [1, 3]), "auto");
    expect(d[0]).toBeLessThan(1);
    expect(d[1]).toBeGreaterThan(3);
  });
  it("hysteresis: a small excursion inside prev keeps prev", () => {
    // prev [0,10], data 4..6 fills 20% (<40%) -> would shrink; use 3..8 (50%)
    expect(computeYDomain(series([0, 1], [3, 8]), "auto", [0, 10])).toEqual([0, 10]);
  });
  it("hysteresis: data outside prev expands", () => {
    const d = computeYDomain(series([0, 1], [-2, 12]), "auto", [0, 10]);
    expect(d[0]).toBeLessThan(-2);
    expect(d[1]).toBeGreaterThan(12);
  });
});

describe("makeScale / buildPathD", () => {
  it("linear scale maps endpoints", () => {
    const s = makeScale([0, 10], [100, 200]);
    expect(s(0)).toBe(100);
    expect(s(10)).toBe(200);
    expect(s(5)).toBe(150);
  });
  it("empty series -> empty d; single point -> one M", () => {
    const id = (v: number) => v;
    expect(buildPathD(series([], []), id, id)).toBe("");
    expect(buildPathD(series([2], [5]), id, id)).toBe("M 2.00 5.00");
  });
  it("N points -> N vertices, mapped", () => {
    const xs = makeScale([0, 4], [0, 400]);
    const ys = makeScale([0, 10], [450, 0]);
    const d = buildPathD(series([0, 2, 4], [0, 5, 10]), xs, ys);
    expect(d.match(/[ML]/g)).toHaveLength(3);
    expect(d).toContain("M 0.00 450.00");
    expect(d).toContain("L 400.00 0.00");
  });
});

describe("mountChart", () => {
  it("creates one svg with axis titles and a growing trace", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const chart = mountChart(host);
    chart.update({ series: series([], []), xLabel: "Time (s)", yLabel: "Position (m)", xDomain: "auto-grow", yDomain: "auto" });

    const svgs = host.querySelectorAll("svg.chart-svg");
    expect(svgs).toHaveLength(1);
    const titles = [...host.querySelectorAll(".axis-title")].map((t) => t.textContent);
    expect(titles).toContain("Time (s)");
    expect(titles).toContain("Position (m)");
    expect(host.querySelector(".trace")!.getAttribute("d")).toBeNull(); // empty

    chart.update({
      series: series([0, 0.04, 0.08, 0.12], [1, 1.1, 1.2, 1.25]),
      xLabel: "Time (s)",
      yLabel: "Position (m)",
      xDomain: "auto-grow",
      yDomain: "auto",
    });
    const d = host.querySelector(".trace")!.getAttribute("d")!;
    expect(d.match(/[ML]/g)).toHaveLength(4);

    chart.destroy();
    expect(host.querySelector("svg")).toBeNull();
  });

  it("renders a selection band when given one", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const chart = mountChart(host);
    chart.update({
      series: series([0, 10], [1, 2]),
      xLabel: "t",
      yLabel: "x",
      selection: { startT: 2, endT: 6 },
    });
    expect(host.querySelector(".selection-band")).not.toBeNull();
    chart.destroy();
  });
});
