// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  mountChart,
  pixelXToSeconds,
  secondsPerPixelX,
  type ChartSeries,
} from "../../src/ui/chart/time-series-chart.js";

const series = (t: number[], x: number[]): ChartSeries => ({ t, x });

function pointer(type: string, init: { pointerId: number; clientX: number }): Event {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.clientX });
  Object.defineProperty(e, "pointerId", { value: init.pointerId });
  return e;
}

describe("chart X geometry", () => {
  it("xGeometry after a render; pure conversions map endpoints", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const chart = mountChart(host);
    expect(chart.xGeometry()).toBeNull();
    chart.update({ series: series([0, 4], [1, 2]), xLabel: "Time (s)", yLabel: "x", xDomain: [0, 4], yDomain: [0, 3] });
    const g = chart.xGeometry()!;
    expect(g.domain).toEqual([0, 4]);
    expect(pixelXToSeconds(g, g.pixelLeft)).toBeCloseTo(0, 9);
    expect(pixelXToSeconds(g, g.pixelRight)).toBeCloseTo(4, 9);
    expect(secondsPerPixelX(g)).toBeGreaterThan(0);
    chart.destroy();
  });
});

describe("editable interval selection", () => {
  function setup() {
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 800 });
    Object.defineProperty(host, "clientHeight", { value: 450 });
    document.body.append(host);
    const onChange = vi.fn();
    const chart = mountChart(host);
    const render = (startT: number, endT: number) =>
      chart.update({
        series: series([0, 10], [1, 2]),
        xLabel: "t",
        yLabel: "x",
        xDomain: [0, 10],
        yDomain: [0, 3],
        selection: { startT, endT, editable: true, onChange },
      });
    render(2, 8);
    return { host, chart, onChange, render };
  }

  it("renders a band, two handles, and dims the outside", () => {
    const { host } = setup();
    expect(host.querySelector(".selection-band")).not.toBeNull();
    expect(host.querySelector(".sel-handle-start")).not.toBeNull();
    expect(host.querySelector(".sel-handle-end")).not.toBeNull();
    expect(host.querySelectorAll(".sel-mask")).toHaveLength(2);
  });

  it("dragging the LEFT handle right increases startT (clamped, cannot cross end)", () => {
    const { host, onChange } = setup();
    const g = (host.querySelector("svg") as SVGSVGElement)?.viewBox; // sanity
    void g;
    const hit = host.querySelector(".sel-handle-hit-start") as SVGElement;
    hit.dispatchEvent(pointer("pointerdown", { pointerId: 1, clientX: 100 }));
    host.dispatchEvent(pointer("pointermove", { pointerId: 1, clientX: 200 })); // +100px
    host.dispatchEvent(pointer("pointerup", { pointerId: 1, clientX: 200 }));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0];
    expect(last.startT).toBeGreaterThan(2);
    expect(last.startT).toBeLessThan(last.endT);
  });

  it("dragging the band shifts both edges by the same amount", () => {
    const { host, onChange } = setup();
    const band = host.querySelector(".selection-band") as SVGElement;
    band.dispatchEvent(pointer("pointerdown", { pointerId: 2, clientX: 300 }));
    host.dispatchEvent(pointer("pointermove", { pointerId: 2, clientX: 340 }));
    host.dispatchEvent(pointer("pointerup", { pointerId: 2, clientX: 340 }));
    const last = onChange.mock.calls.at(-1)![0];
    expect(last.endT - last.startT).toBeCloseTo(6, 5); // width preserved
    expect(last.startT).toBeGreaterThan(2);
  });
});

describe("model curve overlay", () => {
  it("samples the function into a .model-curve path", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const chart = mountChart(host);
    chart.update({
      series: { t: [], x: [] },
      markers: [
        { t: 0, x: 1 },
        { t: 4, x: 3 },
      ],
      functionOverlay: (x) => 0.5 * x + 1,
      xLabel: "Classroom x",
      yLabel: "Classroom y",
      xDomain: [0, 4],
      yDomain: [0, 4],
    });
    const model = host.querySelector(".model-curve");
    expect(model).not.toBeNull();
    expect(model!.getAttribute("d")!.match(/[ML]/g)!.length).toBeGreaterThan(50);
    expect(host.querySelectorAll(".marker")).toHaveLength(2);
    chart.destroy();
  });
});

describe("dense motion trace + layering", () => {
  const base = {
    series: { t: [] as number[], x: [] as number[] },
    motionTrace: { x: [0, 1, 2, 3, 4], y: [1, 1.2, 1.9, 2.4, 3.1] },
    markers: [
      { t: 0, x: 1 },
      { t: 2, x: 2 },
      { t: 4, x: 3 },
    ],
    markerRadius: 6,
    functionOverlay: (x: number) => 0.5 * x + 1,
    xLabel: "Classroom x",
    yLabel: "Classroom y",
    xDomain: [0, 4] as [number, number],
    yDomain: [0, 4] as [number, number],
  };

  it("renders motion trace, points, and model as separate elements", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const chart = mountChart(host);
    chart.update(base);
    expect(host.querySelector(".motion-trace")).not.toBeNull();
    expect(host.querySelectorAll(".marker")).toHaveLength(3);
    expect(host.querySelector(".model-curve")).not.toBeNull();
    // markers are bigger than the default
    expect(Number((host.querySelector(".marker") as SVGCircleElement).getAttribute("r"))).toBe(6);
    chart.destroy();
  });

  it("render order is motion -> model -> points (points last / on top)", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const chart = mountChart(host);
    chart.update(base);
    const clip = host.querySelector("g[clip-path]")!;
    const kids = [...clip.children].map((n) => n.getAttribute("class") ?? n.tagName);
    const iMotion = kids.findIndex((c) => c.includes("motion-trace"));
    const iModel = kids.findIndex((c) => c.includes("model-curve"));
    const iMarker = kids.findIndex((c) => c.includes("marker"));
    expect(iMotion).toBeGreaterThanOrEqual(0);
    expect(iMotion).toBeLessThan(iModel);
    expect(iModel).toBeLessThan(iMarker);
    chart.destroy();
  });

  it("no motionTrace given -> no .motion-trace element (Live Lab / Walk unaffected)", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const chart = mountChart(host);
    chart.update({ series: { t: [0, 1], x: [1, 2] }, xLabel: "t", yLabel: "x", xDomain: "auto-grow", yDomain: "auto" });
    expect(host.querySelector(".motion-trace")).toBeNull();
    chart.destroy();
  });
});
