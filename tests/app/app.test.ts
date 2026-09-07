// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startApp } from "../../src/app/app.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import type { Flags } from "../../src/app/flags.js";

const fakeFlags: Flags = { fake: true, debugSensor: false };
const debugFlags: Flags = { fake: true, debugSensor: true };

beforeEach(() => {
  vi.useFakeTimers();
  location.hash = "";
});
afterEach(() => vi.useRealTimers());

function boot(flags: Flags = fakeFlags) {
  const container = document.createElement("div");
  document.body.append(container);
  const adapter = new FakeSensorAdapter({ sampleHz: 25, now: () => 0 });
  const app = startApp({ container, flagsOverride: flags, adapterOverride: adapter });
  return { container, adapter, app };
}

describe("startApp", () => {
  it("boots to Home with the shell + acquisition bar", () => {
    const { container } = boot();
    expect(container.querySelector(".app-shell")).not.toBeNull();
    expect(container.querySelector(".app-wordmark")!.textContent).toBe("Motion World");
    expect(container.querySelector(".home-grid")).not.toBeNull();
    expect(container.querySelector(".acq-bar__label")!.textContent).toBe("No sensor connected");
  });

  it("Diagnostics link hidden without a debug/fake flag; shown with one", () => {
    const plain = boot({ fake: false, debugSensor: false });
    // note: no hid + not fake + adapterOverride present -> still boots
    expect((plain.container.querySelector(".dev-link") as HTMLElement).hidden).toBe(true);

    const dbg = boot(debugFlags);
    expect((dbg.container.querySelector(".dev-link") as HTMLElement).hidden).toBe(false);
  });

  it("#/diagnostics mounts the diagnostics view only under a debug flag", () => {
    const { container } = boot(debugFlags);
    location.hash = "#/diagnostics";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(container.querySelector(".diagnostics")).not.toBeNull();
  });

  it("navigate Home -> Live -> Home keeps one controller; adapter never disconnected", async () => {
    const { container, adapter, app } = boot();
    const disconnectSpy = vi.spyOn(adapter, "disconnect");
    const c1 = app.controller;

    location.hash = "#/live";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(container.querySelector(".live-lab")).not.toBeNull();

    location.hash = "#/";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(container.querySelector(".home-grid")).not.toBeNull();
    expect(container.querySelector(".live-lab")).toBeNull();

    expect(app.controller).toBe(c1);
    expect(disconnectSpy).not.toHaveBeenCalled();
  });

  it("#/walk mounts Walk the Line with the shared controller; leaving mid-run stops for navigation", async () => {
    const { container, app } = boot();
    const c = app.controller!;
    location.hash = "#/walk";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(container.querySelector(".walk-lab")).not.toBeNull();
    expect(container.querySelector(".walk-head__title")!.textContent).toBe("Walk the Line");

    const stopNavSpy = vi.spyOn(c, "stopForNavigation");
    await c.connect();
    await c.arm();
    await c.start();
    vi.advanceTimersByTime(120);
    location.hash = "#/";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(stopNavSpy).toHaveBeenCalled();
    expect(c.lastCompletedRun()?.sampleCount).toBe(3);
  });

  it("navigating away while MEASURING calls stopForNavigation and keeps the run", async () => {
    const { adapter, app } = boot();
    const c = app.controller!;
    const stopNavSpy = vi.spyOn(c, "stopForNavigation");
    location.hash = "#/live";
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    await c.connect();
    await c.arm();
    await c.start();
    vi.advanceTimersByTime(120);

    location.hash = "#/";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(stopNavSpy).toHaveBeenCalled();
    expect(c.lastCompletedRun()?.sampleCount).toBe(3);
    void adapter;
  });

  it("renders the unsupported screen when there is no WebHID and not fake", () => {
    const container = document.createElement("div");
    document.body.append(container);
    startApp({ container, flagsOverride: { fake: false, debugSensor: false }, hidOverride: null });
    expect(container.textContent).toContain("WebHID is not available");
  });
});
