// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcquisitionController } from "../../src/acquisition/acquisition-controller.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import { mountAcquisitionBar } from "../../src/ui/acquisition-bar.js";
import type { Flags } from "../../src/app/flags.js";

const noFlags: Flags = { fake: true, debugSensor: false };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(flags: Flags = noFlags) {
  const host = document.createElement("div");
  document.body.append(host);
  const adapter = new FakeSensorAdapter({ sampleHz: 25, now: () => 0 });
  const controller = new AcquisitionController(adapter, { samplerHz: 25 });
  const teardown = mountAcquisitionBar(host, { controller, flags });
  return { host, adapter, controller, teardown };
}

const label = (host: HTMLElement) => host.querySelector(".acq-bar__label")!.textContent;
const buttons = (host: HTMLElement) =>
  [...host.querySelectorAll(".acq-bar__actions button")].map((b) => b.textContent);

describe("acquisition bar", () => {
  it("shows friendly copy for each state — never HID/protocol vocabulary", async () => {
    const { host, controller } = setup();
    expect(label(host)).toBe("No sensor connected");
    expect(buttons(host)).toEqual(["Connect Sensor"]);

    await controller.connect();
    expect(label(host)).toBe("System Ready");
    expect(buttons(host)).toEqual(["Sensor Ready"]);

    await controller.arm();
    expect(label(host)).toBe("Sensor Ready");
    expect(buttons(host)).toEqual(["Disarm", "Start"]);

    await controller.start();
    expect(label(host)).toBe("Collecting");
    expect(buttons(host)).toEqual(["Stop"]);

    await controller.stop();
    expect(label(host)).toBe("Sensor Ready");

    const text = host.textContent ?? "";
    expect(text).not.toMatch(/protocol|report id|0x|HID|illegal|init_failed/i);
  });

  it("device-lost and error states", async () => {
    const { host, adapter, controller } = setup();
    await controller.connect();
    adapter.emitDeviceLost();
    expect(label(host)).toBe("Sensor disconnected");
    expect(buttons(host)).toEqual(["Reconnect"]);
  });

  it("shows Connecting… while the adapter opens, then resolves", async () => {
    const { host, adapter, controller } = setup();
    adapter.holdNextConnect();
    const p = controller.connect();
    expect(label(host)).toBe("Connecting…");
    adapter.releaseHeldConnect();
    await p;
    expect(label(host)).toBe("System Ready");
  });

  it("buttons call the matching controller intent", async () => {
    const { host, controller } = setup();
    const connectSpy = vi.spyOn(controller, "connect");
    (host.querySelector(".acq-bar__actions button") as HTMLButtonElement).click();
    expect(connectSpy).toHaveBeenCalled();
  });

  it("Details link only in ERROR + debug mode", async () => {
    const { host, adapter, controller } = setup({ fake: true, debugSensor: true });
    const details = host.querySelector(".acq-bar__details") as HTMLElement;
    expect(details.hidden).toBe(true);
    adapter.failNextConnect({ code: "open_failed", message: "boom" });
    await controller.connect();
    expect(details.hidden).toBe(false);
  });

  it("teardown detaches", async () => {
    const { host, controller, teardown } = setup();
    teardown();
    await controller.connect();
    expect(host.querySelector(".acq-bar")).toBeNull();
  });
});
