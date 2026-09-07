// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startApp } from "../../src/app/app.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import { MemoryRunStore } from "../../src/store/memory-run-store.js";
import { __resetWalkTargetIndex } from "../../src/ui/walk/walk-the-line-view.js";
import type { Flags } from "../../src/app/flags.js";

const fakeFlags: Flags = { fake: true, debugSensor: false };
const debugFlags: Flags = { fake: true, debugSensor: true };

beforeEach(() => {
  vi.useFakeTimers();
  location.hash = "";
  __resetWalkTargetIndex();
});
afterEach(() => vi.useRealTimers());

async function boot(flags: Flags = fakeFlags) {
  const container = document.createElement("div");
  document.body.append(container);
  const adapter = new FakeSensorAdapter({ sampleHz: 25, now: () => 0 });
  const runStore = new MemoryRunStore();
  const app = await startApp({
    container,
    flagsOverride: flags,
    adapterOverride: adapter,
    runStoreOverride: runStore,
  });
  return { container, adapter, runStore, app };
}

const hashTo = (h: string) => {
  location.hash = h;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
};

describe("startApp", () => {
  it("boots to Home with the shell + acquisition bar + a Runs link", async () => {
    const { container } = await boot();
    expect(container.querySelector(".app-shell")).not.toBeNull();
    expect(container.querySelector(".home-grid")).not.toBeNull();
    expect(container.querySelector(".acq-bar__label")!.textContent).toBe("No sensor connected");
    expect([...container.querySelectorAll(".header-link")].map((l) => l.textContent)).toContain("Runs");
  });

  it("Diagnostics link hidden without a debug/fake flag; shown with one", async () => {
    const plain = await boot({ fake: false, debugSensor: false });
    expect((plain.container.querySelector(".dev-link") as HTMLElement).hidden).toBe(true);
    const dbg = await boot(debugFlags);
    expect((dbg.container.querySelector(".dev-link") as HTMLElement).hidden).toBe(false);
  });

  it("#/diagnostics mounts only under a debug flag", async () => {
    const { container } = await boot(debugFlags);
    hashTo("#/diagnostics");
    expect(container.querySelector(".diagnostics")).not.toBeNull();
  });

  it("navigate Home -> Live -> Home keeps one controller; adapter never disconnected", async () => {
    const { container, adapter, app } = await boot();
    const disconnectSpy = vi.spyOn(adapter, "disconnect");
    const c1 = app.controller;
    hashTo("#/live");
    expect(container.querySelector(".live-lab")).not.toBeNull();
    hashTo("#/");
    expect(container.querySelector(".live-lab")).toBeNull();
    expect(app.controller).toBe(c1);
    expect(disconnectSpy).not.toHaveBeenCalled();
  });

  it("#/walk uses the shared controller + offsets; leaving mid-run stops for navigation", async () => {
    const { container, app } = await boot();
    const c = app.controller!;
    hashTo("#/walk");
    expect(container.querySelector(".walk-lab")).not.toBeNull();
    const stopNavSpy = vi.spyOn(c, "stopForNavigation");
    await c.connect();
    await c.arm();
    await c.start();
    vi.advanceTimersByTime(120);
    hashTo("#/");
    expect(stopNavSpy).toHaveBeenCalled();
    expect(c.lastCompletedRun()?.sampleCount).toBe(3);
  });

  it("#/runs mounts the list; a completed fake run is persisted and appears", async () => {
    const { container, app, runStore } = await boot();
    const c = app.controller!;
    await c.connect();
    await c.arm();
    await c.start();
    vi.advanceTimersByTime(200); // 5 samples
    await c.stop();
    await vi.runAllTimersAsync();

    expect(await runStore.listSummaries()).toHaveLength(1); // persistence coordinator ran once

    hashTo("#/runs");
    await vi.runAllTimersAsync();
    expect(container.querySelector(".runs-list")).not.toBeNull();
    expect(container.querySelectorAll(".run-row")).toHaveLength(1);
  });

  it("navigating to #/runs does not touch the sensor / build a 2nd controller", async () => {
    const { adapter, app } = await boot();
    const connectSpy = vi.spyOn(adapter, "connect");
    const c1 = app.controller;
    hashTo("#/runs");
    await vi.runAllTimersAsync();
    expect(connectSpy).not.toHaveBeenCalled();
    expect(app.controller).toBe(c1);
  });

  it("#/run/<id> mounts the saved-run detail (no sensor needed)", async () => {
    const { container, runStore } = await boot();
    const { serializeRun } = await import("../../src/model/stored-run.js");
    const { makeMotionRun } = await import("../../src/model/motion-run.js");
    const { makeMotionSample } = await import("../../src/model/motion-sample.js");
    await runStore.save(
      serializeRun(
        makeMotionRun({
          id: "saved-1",
          samplerHz: 25,
          source: "fake",
          deviceLabel: null,
          samples: [makeMotionSample(0, 1), makeMotionSample(0.04, 1.2), makeMotionSample(0.08, 1.4)],
        }),
        1_000,
      ),
    );
    hashTo("#/run/saved-1");
    await vi.runAllTimersAsync();
    expect(container.querySelector(".run-detail")).not.toBeNull();
    expect(container.querySelector(".run-detail .trace")).not.toBeNull();
  });

  it("renders the unsupported screen when there is no WebHID and not fake", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    await startApp({
      container,
      flagsOverride: { fake: false, debugSensor: false },
      hidOverride: null,
    });
    expect(container.textContent).toContain("WebHID is not available");
  });
});
