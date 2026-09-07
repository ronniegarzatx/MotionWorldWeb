// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcquisitionController } from "../../src/acquisition/acquisition-controller.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import { mountWalkTheLineView } from "../../src/ui/walk/walk-the-line-view.js";
import { WALK_TARGETS } from "../../src/model/walk-target.js";
import type { FrameScheduler } from "../../src/ui/raf.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const sync: FrameScheduler = { schedule: (fn) => fn(), cancel: () => {} };

function setup() {
  const host = document.createElement("div");
  document.body.append(host);
  const adapter = new FakeSensorAdapter({ sampleHz: 25, now: () => 0 });
  const controller = new AcquisitionController(adapter, { samplerHz: 25 });
  const mount = () => mountWalkTheLineView(host, { controller, scheduler: sync });
  return { host, adapter, controller, mount };
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
