// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcquisitionController } from "../../src/acquisition/acquisition-controller.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import { installStartStopKey } from "../../src/ui/keyboard.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function armedController() {
  const adapter = new FakeSensorAdapter({ sampleHz: 25, now: () => 0 });
  const controller = new AcquisitionController(adapter, { samplerHz: 25 });
  await controller.connect();
  await controller.arm();
  return controller;
}

function press(target: EventTarget = document.body): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

describe("installStartStopKey", () => {
  it("Space toggles Start then Stop", async () => {
    const controller = await armedController();
    const start = vi.spyOn(controller, "start");
    const stop = vi.spyOn(controller, "stop");
    const uninstall = installStartStopKey(controller);

    const e1 = press();
    expect(start).toHaveBeenCalledTimes(1);
    expect(e1.defaultPrevented).toBe(true);
    await Promise.resolve();

    press();
    expect(stop).toHaveBeenCalledTimes(1);
    uninstall();
  });

  it("ignored when focus is in an input", async () => {
    const controller = await armedController();
    const start = vi.spyOn(controller, "start");
    const uninstall = installStartStopKey(controller);
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    press(input);
    expect(start).not.toHaveBeenCalled();
    uninstall();
    input.remove();
  });

  it("ignored when a button is the target (no double-activation)", async () => {
    const controller = await armedController();
    const start = vi.spyOn(controller, "start");
    const uninstall = installStartStopKey(controller);
    const btn = document.createElement("button");
    document.body.append(btn);
    press(btn);
    expect(start).not.toHaveBeenCalled();
    uninstall();
    btn.remove();
  });

  it("ignored on auto-repeat", async () => {
    const controller = await armedController();
    const start = vi.spyOn(controller, "start");
    const uninstall = installStartStopKey(controller);
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", repeat: true, bubbles: true, cancelable: true }),
    );
    expect(start).not.toHaveBeenCalled();
    uninstall();
  });

  it("no-op when neither start nor stop is allowed", async () => {
    const adapter = new FakeSensorAdapter();
    const controller = new AcquisitionController(adapter);
    const start = vi.spyOn(controller, "start");
    const stop = vi.spyOn(controller, "stop");
    const uninstall = installStartStopKey(controller);
    const e = press();
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
    uninstall();
  });
});
