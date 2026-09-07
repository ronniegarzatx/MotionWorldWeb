// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcquisitionController } from "../../src/acquisition/acquisition-controller.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import { mountLiveLabView } from "../../src/ui/live/live-lab-view.js";
import type { FrameScheduler } from "../../src/ui/raf.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// synchronous scheduler: run scheduled work immediately
const syncScheduler: FrameScheduler = {
  schedule: (fn) => fn(),
  cancel: () => {},
};

function setup() {
  const host = document.createElement("div");
  document.body.append(host);
  const adapter = new FakeSensorAdapter({ sampleHz: 25, now: () => 0 });
  const controller = new AcquisitionController(adapter, { samplerHz: 25 });
  const mount = () => mountLiveLabView(host, { controller, scheduler: syncScheduler });
  return { host, adapter, controller, mount };
}

const vertexCount = (host: HTMLElement): number =>
  (host.querySelector(".trace")?.getAttribute("d")?.match(/[ML]/g) ?? []).length;

describe("live-lab-view", () => {
  it("renders the chart + stat strip, no HID log", () => {
    const { host, mount } = setup();
    mount();
    expect(host.querySelector("svg.chart-svg")).not.toBeNull();
    expect(host.querySelectorAll(".stat").length).toBe(3);
    expect(host.querySelector(".log")).toBeNull();
    expect(host.querySelector(".raw")).toBeNull();
  });

  it("samples grow the trace; stats update", async () => {
    const { host, controller, mount } = setup();
    mount();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(200); // 5 samples @ 25 Hz
    expect(vertexCount(host)).toBe(5);
    const values = [...host.querySelectorAll(".stat__value")].map((v) => v.textContent);
    expect(values).toContain("5"); // sample count
    expect(values.some((v) => v?.endsWith(" m"))).toBe(true);
  });

  it("Stop freezes the completed run on screen", async () => {
    const { host, controller, mount } = setup();
    mount();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(400); // 10 samples
    await controller.stop();
    expect(vertexCount(host)).toBe(controller.lastCompletedRun()!.sampleCount);
    expect(vertexCount(host)).toBe(10);
  });

  it("a new run clears the trace first", async () => {
    const { host, controller, mount } = setup();
    mount();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(200);
    await controller.stop();
    expect(vertexCount(host)).toBe(5);

    await controller.start();
    vi.advanceTimersByTime(80); // 2 samples of the new run
    expect(vertexCount(host)).toBe(2);
  });

  it("remount while MEASURING restores the trace; no acquisition restart", async () => {
    const { host, adapter, controller, mount } = setup();
    const startSpy = vi.spyOn(adapter, "start");
    const teardown = mount();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(240); // 6 samples
    expect(startSpy).toHaveBeenCalledTimes(1);

    teardown();
    host.replaceChildren();
    mount();
    expect(vertexCount(host)).toBe(6); // restored from currentRunSamples()
    expect(startSpy).toHaveBeenCalledTimes(1); // not restarted
  });

  it("remount while frozen restores from the last completed run", async () => {
    const { host, controller, mount } = setup();
    const teardown = mount();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(120);
    await controller.stop();
    teardown();
    host.replaceChildren();
    mount();
    expect(vertexCount(host)).toBe(3);
  });
});
