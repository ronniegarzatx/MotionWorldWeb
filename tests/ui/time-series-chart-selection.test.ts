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
