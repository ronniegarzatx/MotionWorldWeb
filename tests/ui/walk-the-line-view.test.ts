// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcquisitionController } from "../../src/acquisition/acquisition-controller.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import {
  __resetWalkTargetIndex,
  mountWalkTheLineView,
} from "../../src/ui/walk/walk-the-line-view.js";
import { WALK_TARGETS } from "../../src/model/walk-target.js";
import { TargetOffsets } from "../../src/ui/walk/target-offsets.js";
import type { FrameScheduler } from "../../src/ui/raf.js";

beforeEach(() => {
  vi.useFakeTimers();
  __resetWalkTargetIndex();
});
afterEach(() => vi.useRealTimers());

const sync: FrameScheduler = { schedule: (fn) => fn(), cancel: () => {} };

function setup() {
  const host = document.createElement("div");
  document.body.append(host);
  const adapter = new FakeSensorAdapter({ sampleHz: 25, now: () => 0 });
  const controller = new AcquisitionController(adapter, { samplerHz: 25 });
  const offsets = new TargetOffsets();
  const mount = () => mountWalkTheLineView(host, { controller, offsets, scheduler: sync });
  return { host, adapter, controller, offsets, mount };
}

// target path d="M x y L x y ..." -> the y of the first vertex
const firstTargetY = (host: HTMLElement): number =>
  Number(/M [\d.]+ ([\d.]+)/.exec(host.querySelector(".target")!.getAttribute("d")!)![1]);
const targetXs = (host: HTMLElement): number[] =>
  [...host.querySelector(".target")!.getAttribute("d")!.matchAll(/[ML] ([\d.]+) [\d.]+/g)].map((m) =>
    Number(m[1]),
  );
const btn = (host: HTMLElement, label: string): HTMLButtonElement =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement;

// jsdom 25 has no PointerEvent — a MouseEvent with a pointerId is enough here.
function pointer(type: string, init: { pointerId: number; clientY: number }): Event {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: init.clientY });
  Object.defineProperty(e, "pointerId", { value: init.pointerId });
  return e;
}

const traceVerts = (host: HTMLElement): number =>
  (host.querySelector(".trace")?.getAttribute("d")?.match(/[ML]/g) ?? []).length;
const targetVerts = (host: HTMLElement): number =>
  (host.querySelector(".target")?.getAttribute("d")?.match(/[ML]/g) ?? []).length;
const nav = (host: HTMLElement) =>
  Object.fromEntries(
    [...host.querySelectorAll(".walk-nav button")].map((b) => [b.textContent, b as HTMLButtonElement]),
  );

async function arm(controller: AcquisitionController) {
  await controller.connect();
  await controller.arm();
}

describe("walk-the-line-view", () => {
  it("fresh: shows the target graph, no student trace, no Run Again", () => {
    const { host, mount } = setup();
    mount();
    expect(host.querySelector(".walk-head__title")!.textContent).toBe("Walk the Line");
    expect(targetVerts(host)).toBe(WALK_TARGETS[0]!.points.length);
    expect(host.querySelector(".trace")!.getAttribute("d")).toBeNull();
    expect((nav(host)["Run Again"] as HTMLButtonElement).hidden).toBe(true);
  });

  it("Start -> live student samples append over the target", async () => {
    const { host, controller, mount } = setup();
    mount();
    await arm(controller);
    await controller.start();
    vi.advanceTimersByTime(200); // 5 samples
    expect(traceVerts(host)).toBe(5);
    expect(targetVerts(host)).toBeGreaterThan(0); // target still there
  });

  it("Stop freezes both lines; Run Again clears only the student trace", async () => {
    const { host, controller, mount } = setup();
    mount();
    await arm(controller);
    await controller.start();
    vi.advanceTimersByTime(200);
    await controller.stop();
    expect(traceVerts(host)).toBe(5);
    expect((nav(host)["Run Again"] as HTMLButtonElement).hidden).toBe(false);

    nav(host)["Run Again"]!.click();
    expect(host.querySelector(".trace")!.getAttribute("d")).toBeNull();
    expect(targetVerts(host)).toBe(WALK_TARGETS[0]!.points.length); // target retained
    expect(controller.uiState.state).toBe("SENSOR_READY"); // sensor untouched
  });

  it("a new run clears the previous student trace", async () => {
    const { host, controller, mount } = setup();
    mount();
    await arm(controller);
    await controller.start();
    vi.advanceTimersByTime(200);
    await controller.stop();
    await controller.start();
    vi.advanceTimersByTime(80); // 2 samples of the new run
    expect(traceVerts(host)).toBe(2);
  });

  it("Previous / Next change the target; blocked while MEASURING", async () => {
    const { host, controller, mount } = setup();
    mount();
    const first = host.querySelector(".walk-head__target")!.textContent;
    nav(host)["Next"]!.click();
    expect(host.querySelector(".walk-head__target")!.textContent).not.toBe(first);
    nav(host)["Previous"]!.click();
    expect(host.querySelector(".walk-head__target")!.textContent).toBe(first);

    await arm(controller);
    await controller.start();
    const n = nav(host);
    expect(n["Next"]!.disabled).toBe(true);
    expect(n["Previous"]!.disabled).toBe(true);
    expect(n["Change Target"]!.disabled).toBe(true);
    n["Next"]!.click(); // no-op
    // still measuring, target unchanged
    await controller.stop();
    expect(nav(host)["Next"]!.disabled).toBe(false);
  });

  it("Change Target picker: picking one swaps the target and clears the student trace, keeps the sensor", async () => {
    const { host, controller, mount } = setup();
    mount();
    await arm(controller);
    await controller.start();
    vi.advanceTimersByTime(120);
    await controller.stop();
    expect(traceVerts(host)).toBe(3);

    nav(host)["Change Target"]!.click();
    const items = [...host.querySelectorAll(".target-picker__item")] as HTMLButtonElement[];
    items[3]!.click(); // "Positive Constant Rate"
    expect(host.querySelector(".target-picker")).toBeNull(); // closed
    expect(host.querySelector(".walk-head__target")!.textContent).toBe("Positive Constant Rate");
    expect(host.querySelector(".trace")!.getAttribute("d")).toBeNull();
    expect(controller.uiState.state).toBe("SENSOR_READY");
  });

  it("target persists across a remount; no acquisition restart", async () => {
    const { host, adapter, mount } = setup();
    const startSpy = vi.spyOn(adapter, "start");
    const teardown = mount();
    nav(host)["Next"]!.click();
    nav(host)["Next"]!.click(); // -> "Walk Toward"
    const chosen = host.querySelector(".walk-head__target")!.textContent;
    teardown();
    host.replaceChildren();
    mount();
    expect(host.querySelector(".walk-head__target")!.textContent).toBe(chosen);
    expect(startSpy).not.toHaveBeenCalled();
  });

  it("remount while MEASURING restores the live student trace", async () => {
    const { host, controller, mount } = setup();
    const teardown = mount();
    await arm(controller);
    await controller.start();
    vi.advanceTimersByTime(240); // 6 samples
    teardown();
    host.replaceChildren();
    mount();
    expect(traceVerts(host)).toBe(6);
  });
});

describe("walk-the-line-view — movable target", () => {
  it("renders the ±0.5 controls, an offset label, and Reset Position", () => {
    const { host, mount } = setup();
    mount();
    expect(btn(host, "− 0.5 m")).toBeTruthy();
    expect(btn(host, "+ 0.5 m")).toBeTruthy();
    expect(btn(host, "Reset Position")).toBeTruthy();
    expect(host.querySelector(".walk-offset__label")!.textContent).toBe("Target height: 1.5 m");
  });

  it("+0.5 raises the target and −0.5 lowers it, without moving X", () => {
    const { host, mount } = setup(); // default target = Stand Still (flat 1.5)
    mount();
    const y0 = firstTargetY(host);
    const xs0 = targetXs(host);

    btn(host, "+ 0.5 m").click();
    // SVG y grows downward -> raising the target LOWERS the pixel y
    expect(firstTargetY(host)).toBeLessThan(y0);
    expect(targetXs(host)).toEqual(xs0); // X unchanged
    expect(host.querySelector(".walk-offset__label")!.textContent).toBe("Target height: 2.0 m");

    btn(host, "− 0.5 m").click();
    expect(firstTargetY(host)).toBeCloseTo(y0, 6);
    expect(host.querySelector(".walk-offset__label")!.textContent).toBe("Target height: 1.5 m");
  });

  it("Reset Position returns the offset to 0", () => {
    const { host, offsets, mount } = setup();
    mount();
    btn(host, "+ 0.5 m").click();
    btn(host, "+ 0.5 m").click();
    expect(offsets.get("stand-still")).toBeCloseTo(1.0, 6);
    btn(host, "Reset Position").click();
    expect(offsets.get("stand-still")).toBe(0);
    expect(host.querySelector(".walk-offset__label")!.textContent).toBe("Target height: 1.5 m");
  });

  it("± disable at the legal offset limits (never distorts the shape)", () => {
    const { host, mount } = setup();
    mount();
    // Stand Still 1.5 m: min offset -1.0, max +2.0
    for (let i = 0; i < 5; i++) btn(host, "+ 0.5 m").click();
    expect(btn(host, "+ 0.5 m").disabled).toBe(true);
    expect(host.querySelector(".walk-offset__label")!.textContent).toBe("Target height: 3.5 m");
    for (let i = 0; i < 10; i++) btn(host, "− 0.5 m").click();
    expect(btn(host, "− 0.5 m").disabled).toBe(true);
    expect(host.querySelector(".walk-offset__label")!.textContent).toBe("Target height: 0.5 m");
  });

  it("all offset controls are locked while MEASURING and return after Stop", async () => {
    const { host, controller, mount } = setup();
    mount();
    await arm(controller);
    await controller.start();
    for (const l of ["− 0.5 m", "+ 0.5 m", "Reset Position"]) {
      expect(btn(host, l).disabled, l).toBe(true);
    }
    await controller.stop();
    expect(btn(host, "+ 0.5 m").disabled).toBe(false);
  });

  it("pointer drag on the target changes only Y; X/times and chart y-domain unchanged", () => {
    const { host, offsets, mount } = setup();
    mount();
    const chart = host.querySelector("svg.chart-svg")!;
    const domainBefore = chart.querySelectorAll(".tick-label").length; // proxy for a stable axis
    const xs0 = targetXs(host);
    const hit = host.querySelector(".target-hit") as SVGElement;
    const chartHost = host.querySelector(".chart-host")!;

    hit.dispatchEvent(pointer("pointerdown", { pointerId: 1, clientY: 300 }));
    chartHost.dispatchEvent(pointer("pointermove", { pointerId: 1, clientY: 200 })); // dragged up 100px
    chartHost.dispatchEvent(pointer("pointerup", { pointerId: 1, clientY: 200 }));

    // X coordinates of the target path are untouched
    expect(targetXs(host)).toEqual(xs0);
    // offset moved up (jsdom clientHeight is 0 -> fallback 450px plot, so a 100px
    // drag maps to a real positive shift), and stays clamped/valid
    expect(offsets.get("stand-still")).toBeGreaterThan(0);
    expect(chart.querySelectorAll(".tick-label").length).toBe(domainBefore); // axis stable
  });

  it("Run Again keeps the current target offset", async () => {
    const { host, offsets, controller, mount } = setup();
    mount();
    btn(host, "+ 0.5 m").click();
    await arm(controller);
    await controller.start();
    vi.advanceTimersByTime(120);
    await controller.stop();
    btn(host, "Run Again").click();
    expect(offsets.get("stand-still")).toBeCloseTo(0.5, 6);
    expect(host.querySelector(".walk-offset__label")!.textContent).toBe("Target height: 2.0 m");
  });

  it("switching target and back restores each target's own offset", () => {
    const { host, offsets, mount } = setup();
    mount();
    btn(host, "+ 0.5 m").click(); // stand-still -> +0.5
    btn(host, "Next").click(); // -> Walk Away (offset 0)
    expect(host.querySelector(".walk-offset__label")!.textContent).toBe("Target shift: 0.0 m");
    btn(host, "− 0.5 m").click(); // walk-away -> -0.5
    btn(host, "Previous").click(); // back to Stand Still
    expect(offsets.get("stand-still")).toBeCloseTo(0.5, 6);
    expect(host.querySelector(".walk-offset__label")!.textContent).toBe("Target height: 2.0 m");
    btn(host, "Next").click();
    expect(offsets.get("walk-away")).toBeCloseTo(-0.5, 6);
  });

  it("offset never rescales the chart y-domain", () => {
    const { host, mount } = setup();
    mount();
    const ticks0 = [...host.querySelectorAll(".tick-label")].map((t) => t.textContent).join(",");
    btn(host, "+ 0.5 m").click();
    btn(host, "+ 0.5 m").click();
    expect([...host.querySelectorAll(".tick-label")].map((t) => t.textContent).join(",")).toBe(
      ticks0,
    );
  });
});
