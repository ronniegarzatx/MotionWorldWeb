// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcquisitionController } from "../../src/acquisition/acquisition-controller.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import { mountDataDisplayView } from "../../src/ui/data/data-display-view.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const host = document.createElement("div");
  document.body.append(host);
  const adapter = new FakeSensorAdapter({ sampleHz: 25, now: () => 0 });
  const controller = new AcquisitionController(adapter, { samplerHz: 25 });
  const teardown = mountDataDisplayView(host, { controller });
  return { host, adapter, controller, teardown };
}

const value = (host: HTMLElement) => host.querySelector(".hero-value")!.textContent;
const time = (host: HTMLElement) => host.querySelector(".hero-time")!.textContent;

describe("data-display-view", () => {
  it("shows — before any sample", () => {
    const { host } = setup();
    expect(value(host)).toBe("—");
    expect(time(host)).toBe("—");
    expect(host.querySelector(".hero-value")!.className).toContain("hero-value--muted");
  });

  it("updates while measuring", async () => {
    const { host, controller } = setup();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(120); // 3 samples
    expect(value(host)).toMatch(/^\d+\.\d{3} m$/);
    expect(value(host)).not.toBe("—");
    expect(time(host)).toMatch(/ s$/);
    expect(host.querySelector(".hero-value")!.className).not.toContain("hero-value--muted");
  });

  it("retains the last value after Stop", async () => {
    const { host, controller } = setup();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(200);
    const held = value(host);
    await controller.stop();
    expect(value(host)).toBe(held);
    expect(value(host)).not.toBe("—");
  });

  it("Reset blanks the display without disarming", async () => {
    const { host, controller } = setup();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(200);
    await controller.stop();
    (host.querySelector("button") as HTMLButtonElement).click();
    expect(value(host)).toBe("—");
    expect(controller.uiState.state).toBe("SENSOR_READY");
  });

  it("a fresh run blanks the display first", async () => {
    const { host, controller } = setup();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(200);
    await controller.stop();
    expect(value(host)).not.toBe("—");
    await controller.start(); // fresh run
    expect(value(host)).toBe("—");
  });
});
