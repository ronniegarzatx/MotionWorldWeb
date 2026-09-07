// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  metresPerPixelY,
  mountChart,
  pixelYToMetres,
  type ChartSeries,
} from "../../src/ui/chart/time-series-chart.js";

const series = (t: number[], x: number[]): ChartSeries => ({ t, x });

describe("chart Y geometry", () => {
  it("yGeometry is null before the first render, then reflects the y-domain", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const chart = mountChart(host);
    expect(chart.yGeometry()).toBeNull();

    chart.update({
      series: series([0, 1], [1, 2]),
      target: { t: [0, 6], x: [1, 3] },
      xLabel: "t",
      yLabel: "x",
      xDomain: [0, 6],
      yDomain: [0.5, 3.5],
    });
    const g = chart.yGeometry()!;
    expect(g.domain).toEqual([0.5, 3.5]);
    expect(g.pixelBottom).toBeGreaterThan(g.pixelTop);
    chart.destroy();
  });

  it("pure conversions map endpoints (bottom px -> domain lo, top px -> domain hi)", () => {
    const g = { domain: [0.5, 3.5] as const, pixelTop: 16, pixelBottom: 416 };
    expect(pixelYToMetres(g, 416)).toBeCloseTo(0.5, 10);
    expect(pixelYToMetres(g, 16)).toBeCloseTo(3.5, 10);
    expect(pixelYToMetres(g, 216)).toBeCloseTo(2.0, 10);
    // 400 px spans 3.0 m -> 0.0075 m/px
    expect(metresPerPixelY(g)).toBeCloseTo(3 / 400, 12);
  });
});

describe("chart target hit region", () => {
  const base = {
    series: series([0], [1]),
    target: { t: [0, 6], x: [1, 3] },
    xLabel: "t",
    yLabel: "x",
    xDomain: [0, 6] as [number, number],
    yDomain: [0.5, 3.5] as [number, number],
  };

  it("draws an invisible wide hit path and fires onTargetPointerDown", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const onDown = vi.fn();
    const chart = mountChart(host);
    chart.update({ ...base, onTargetPointerDown: onDown });

    const hit = host.querySelector(".target-hit") as SVGElement;
    expect(hit).not.toBeNull();
    expect(hit.getAttribute("stroke")).toBe("transparent");
    expect(Number(hit.getAttribute("stroke-width"))).toBeGreaterThanOrEqual(20);

    hit.dispatchEvent(new Event("pointerdown"));
    expect(onDown).toHaveBeenCalledTimes(1);

    // the visible target stroke is not thickened
    const visible = host.querySelector(".target") as SVGElement;
    expect(visible.getAttribute("stroke-width")).toBeNull(); // styled via CSS, not inline
    chart.destroy();
  });
});
