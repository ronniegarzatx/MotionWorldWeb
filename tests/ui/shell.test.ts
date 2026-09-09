// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcquisitionController } from "../../src/acquisition/acquisition-controller.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import type { Flags } from "../../src/app/flags.js";
import { mountShell } from "../../src/ui/shell.js";

const flags: Flags = { fake: true, debugSensor: false };

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function setup() {
  const container = document.createElement("div");
  document.body.append(container);
  const adapter = new FakeSensorAdapter({ sampleHz: 25, now: () => 0 });
  const controller = new AcquisitionController(adapter, { samplerHz: 25 });
  const navigate = vi.fn();
  const mountRoute = vi.fn((_location, main: HTMLElement) => {
    main.append(document.createElement("div"));
    return () => {};
  });
  const shell = mountShell(container, { controller, flags, navigate, mountRoute });
  return { container, shell };
}

describe("shell — immersive route (Art Party)", () => {
  it("hides the classroom header and drops main padding only on the art route", () => {
    const { container, shell } = setup();
    const header = container.querySelector(".app-header") as HTMLElement;
    const main = container.querySelector(".app-main") as HTMLElement;

    shell.renderLocation({ route: "home" });
    expect(header.hidden).toBe(false);
    expect(main.classList.contains("app-main--immersive")).toBe(false);

    shell.renderLocation({ route: "art" });
    expect(header.hidden).toBe(true);
    expect(main.classList.contains("app-main--immersive")).toBe(true);

    // and every other route keeps the ordinary classroom chrome
    for (const route of ["live", "data", "walk", "snapshot", "speed", "sequence", "runs"] as const) {
      shell.renderLocation({ route });
      expect(header.hidden).toBe(false);
      expect(main.classList.contains("app-main--immersive")).toBe(false);
    }
  });
});
