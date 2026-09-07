// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mountChart, type ChartSeries } from "../../src/ui/chart/time-series-chart.js";

const series = (t: number[], x: number[]): ChartSeries => ({ t, x });
const tickLabels = (host: HTMLElement): string[] =>
  [...host.querySelectorAll(".tick-label")].map((n) => n.textContent ?? "");

describe("chart target overlay + fixed axes (Walk the Line)", () => {
  it("renders the target path separately from the student trace, target behind", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const chart = mountChart(host);
    chart.update({
      series: series([0, 3], [1.5, 1.6]),
      target: { t: [0, 6], x: [1.0, 3.0] },
      xLabel: "Time (s)",
      yLabel: "Position (m)",
      xDomain: [0, 6],
      yDomain: [0.5, 3.5],
    });

    const target = host.querySelector(".target");
    const trace = host.querySelector(".trace");
    expect(target).not.toBeNull();
    expect(trace).not.toBeNull();
    expect(target!.getAttribute("d")).not.toBe(trace!.getAttribute("d"));
    // target is a previous sibling of the student trace (drawn under it)
    expect(target!.compareDocumentPosition(trace!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    chart.destroy();
  });

  it("axes stay fixed to the target domain even when the student walks out of range", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const chart = mountChart(host);
    const base = {
      target: { t: [0, 6], x: [1.0, 3.0] },
      xLabel: "t",
      yLabel: "x",
      xDomain: [0, 6] as [number, number],
      yDomain: [0.5, 3.5] as [number, number],
    };
    chart.update({ ...base, series: series([0, 1], [1.5, 1.5]) });
    const before = tickLabels(host);

    // a wild student excursion far outside the target range
    chart.update({ ...base, series: series([0, 1, 2], [1.5, 9.9, -4]) });
    expect(tickLabels(host)).toEqual(before); // no rescale

    chart.destroy();
  });

  it("clips data to the plot rect", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const chart = mountChart(host);
    chart.update({
      series: series([0, 1], [1, 8]),
      target: { t: [0, 6], x: [1, 3] },
      xLabel: "t",
      yLabel: "x",
      xDomain: [0, 6],
      yDomain: [0.5, 3.5],
    });
    const clipped = host.querySelector("g[clip-path]");
    expect(clipped).not.toBeNull();
    expect(host.querySelector("clipPath rect")).not.toBeNull();
    expect(clipped!.querySelector(".trace")).not.toBeNull();
    expect(clipped!.querySelector(".target")).not.toBeNull();
    chart.destroy();
  });

  it("still works with no target (existing Live Lab usage unchanged)", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const chart = mountChart(host);
    chart.update({
      series: series([0, 0.04], [1, 1.1]),
      xLabel: "Time (s)",
      yLabel: "Position (m)",
      xDomain: "auto-grow",
      yDomain: "auto",
    });
    expect(host.querySelector(".target")).toBeNull();
    expect(host.querySelector(".trace")!.getAttribute("d")).toContain("M ");
    chart.destroy();
  });
});
