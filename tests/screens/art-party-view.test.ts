// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcquisitionController } from "../../src/acquisition/acquisition-controller.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import type { Flags } from "../../src/app/flags.js";
import type { FrameScheduler } from "../../src/ui/raf.js";
import { ArtEngine } from "../../src/art/art-engine.js";
import { EFFECT_FACTORIES } from "../../src/art/effects/index.js";
import { mountArtPartyView, type ArtPartyViewDeps } from "../../src/screens/art-party-view.js";
import { createRecordingContext } from "../art/recording-context.js";

const flags: Flags = { fake: true, debugSensor: false };

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

/** A deterministic, manually-fired stand-in for the real RAF-driven scheduler. */
function manualScheduler(): FrameScheduler & { fire(): void; isScheduled(): boolean } {
  let pending: (() => void) | null = null;
  return {
    schedule: (fn) => {
      pending = fn;
    },
    cancel: () => {
      pending = null;
    },
    fire: () => {
      const fn = pending;
      pending = null;
      fn?.();
    },
    isScheduled: () => pending !== null,
  };
}

function setup(overrides: Partial<ArtPartyViewDeps> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const adapter = new FakeSensorAdapter({ sampleHz: 25, now: () => 0 });
  const controller = new AcquisitionController(adapter, { samplerHz: 25 });
  const navigate = vi.fn();
  const scheduler = overrides.scheduler ?? manualScheduler();
  const teardown = mountArtPartyView(host, {
    controller,
    navigate,
    flags,
    ctxOverride: null, // jsdom's real getContext("2d") is unimplemented — silence it unless a test overrides
    scheduler,
    ...overrides,
  });
  return { host, adapter, controller, navigate, scheduler: scheduler as ReturnType<typeof manualScheduler>, teardown };
}

const byLabel = (host: HTMLElement, label: string): HTMLButtonElement | null =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement | null;

describe("art-party-view — structure", () => {
  it("mounts a full-bleed canvas with no educational chrome", () => {
    const { host, teardown } = setup();
    const canvas = host.querySelector(".art-party__canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.tagName).toBe("CANVAS");
    expect(host.querySelector(".chart-host")).toBeNull();
    // no bare-number readouts anywhere (the "no educational numbers" guard)
    expect(host.textContent ?? "").not.toMatch(/\d+\.\d+\s*(m|mph|m\/s)\b/);
    teardown();
  });

  it("Exit always navigates home", () => {
    const { host, navigate, teardown } = setup();
    byLabel(host, "Exit")!.click();
    expect(navigate).toHaveBeenCalledWith("home");
    teardown();
  });
});

describe("art-party-view — acquisition states", () => {
  it("NO_DEVICE shows Connect Sensor wired to controller.connect()", () => {
    const { host, controller, teardown } = setup();
    const connectSpy = vi.spyOn(controller, "connect").mockResolvedValue(undefined);
    byLabel(host, "Connect Sensor")!.click();
    expect(connectSpy).toHaveBeenCalled();
    teardown();
  });

  it("SENSOR_READY shows Start wired to controller.start()", async () => {
    const { host, controller, teardown } = setup();
    await controller.connect();
    await controller.arm();
    const startSpy = vi.spyOn(controller, "start").mockResolvedValue(undefined);
    byLabel(host, "Start")!.click();
    expect(startSpy).toHaveBeenCalled();
    teardown();
  });

  it("MEASURING shows Stop wired to controller.stop()", async () => {
    const { host, controller, teardown } = setup();
    await controller.connect();
    await controller.arm();
    await controller.start();
    const stopSpy = vi.spyOn(controller, "stop").mockResolvedValue(undefined);
    byLabel(host, "Stop")!.click();
    expect(stopSpy).toHaveBeenCalled();
    teardown();
  });

  it("DEVICE_LOST shows Reconnect, and its panel is exempt from fade", async () => {
    const { host, adapter, controller, teardown } = setup();
    await controller.connect();
    adapter.emitDeviceLost();
    const reconnectSpy = vi.spyOn(controller, "reconnect").mockResolvedValue(true);
    const btn = byLabel(host, "Reconnect")!;
    expect(btn).not.toBeNull();
    btn.click();
    expect(reconnectSpy).toHaveBeenCalled();
    // even after the inactivity window elapses, the overlay never fades outside MEASURING
    vi.advanceTimersByTime(10_000);
    expect(host.querySelector(".art-party__overlay")?.classList.contains("art-party__overlay--faded")).toBe(false);
    teardown();
  });
});

describe("art-party-view — Change Effect", () => {
  it("cycles the active effect and shows a transient name label that clears", () => {
    const { host, teardown } = setup();
    const changeBtn = byLabel(host, "Change Effect")!;
    const labelEl = host.querySelector(".art-party__effect-label") as HTMLElement;
    expect(labelEl.hidden).toBe(true);

    changeBtn.click();
    expect(labelEl.hidden).toBe(false);
    const firstName = labelEl.textContent;
    expect(firstName).toBeTruthy();

    vi.advanceTimersByTime(2000);
    expect(labelEl.hidden).toBe(true);
    teardown();
  });

  it("never shows two different names without a click between them", () => {
    const { host, teardown } = setup();
    const changeBtn = byLabel(host, "Change Effect")!;
    const labelEl = host.querySelector(".art-party__effect-label") as HTMLElement;

    changeBtn.click();
    const first = labelEl.textContent;
    vi.advanceTimersByTime(200);
    expect(labelEl.textContent).toBe(first); // unchanged without another click
    teardown();
  });
});

describe("art-party-view — control auto-fade", () => {
  it("fades the overlay after inactivity while MEASURING, and a pointer move restores it", async () => {
    const { host, controller, teardown } = setup();
    await controller.connect();
    await controller.arm();
    await controller.start();

    const overlay = host.querySelector(".art-party__overlay") as HTMLElement;
    expect(overlay.classList.contains("art-party__overlay--faded")).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(overlay.classList.contains("art-party__overlay--faded")).toBe(true);
    // the button is still in the DOM and accessible — fading is presentation only
    expect(byLabel(host, "Exit")).not.toBeNull();
    expect(byLabel(host, "Exit")!.hidden).toBe(false);

    host.querySelector(".art-party")!.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(overlay.classList.contains("art-party__overlay--faded")).toBe(false);
    teardown();
  });

  it("does not fade while idle (not MEASURING)", () => {
    const { host, teardown } = setup();
    const overlay = host.querySelector(".art-party__overlay") as HTMLElement;
    vi.advanceTimersByTime(10_000);
    expect(overlay.classList.contains("art-party__overlay--faded")).toBe(false);
    teardown();
  });

  it("Escape restores a faded overlay", async () => {
    const { host, controller, teardown } = setup();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(5000);
    const overlay = host.querySelector(".art-party__overlay") as HTMLElement;
    expect(overlay.classList.contains("art-party__overlay--faded")).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(overlay.classList.contains("art-party__overlay--faded")).toBe(false);
    teardown();
  });
});

describe("art-party-view — engine wiring", () => {
  it("forwards MEASURING samples to the engine", async () => {
    const engine = new ArtEngine({ effects: EFFECT_FACTORIES, seed: 1 });
    const onSampleSpy = vi.spyOn(engine, "onSample");
    const { controller, teardown } = setup({ engineOverride: engine });

    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(40); // one tick @ 25 Hz from FakeSensorAdapter
    expect(onSampleSpy).toHaveBeenCalled();
    teardown();
  });

  it("passes reducedMotion through to render once the loop ticks", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;

    const engine = new ArtEngine({ effects: EFFECT_FACTORIES, seed: 2 });
    const renderSpy = vi.spyOn(engine, "render");
    const { ctx } = createRecordingContext();
    const { scheduler, teardown } = setup({ engineOverride: engine, ctxOverride: ctx });

    scheduler.fire();
    expect(renderSpy).toHaveBeenCalled();
    expect(renderSpy.mock.calls[0]![2]).toBe(true);

    teardown();
    window.matchMedia = originalMatchMedia;
  });

  it("re-fires the loop each frame (schedules again after firing) until teardown", () => {
    const { scheduler, teardown } = setup();
    expect(scheduler.isScheduled()).toBe(true);
    scheduler.fire();
    expect(scheduler.isScheduled()).toBe(true); // rescheduled itself
    teardown();
    expect(scheduler.isScheduled()).toBe(false);
  });
});

describe("art-party-view — route cleanup", () => {
  it("re-mounting after teardown creates exactly one healthy session (no duplicate loop)", () => {
    const shared = manualScheduler();

    const first = setup({ scheduler: shared });
    expect(shared.isScheduled()).toBe(true);
    first.teardown();
    expect(shared.isScheduled()).toBe(false);

    const second = setup({ scheduler: shared });
    expect(shared.isScheduled()).toBe(true);
    second.teardown();
    expect(shared.isScheduled()).toBe(false);
  });
});
