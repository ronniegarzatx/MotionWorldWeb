// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcquisitionController } from "../../src/acquisition/acquisition-controller.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import { DiagnosticLog } from "../../src/dev/diagnostic-log.js";
import { RawReportRing } from "../../src/dev/raw-report-ring.js";
import { mountSensorDiagnosticsView } from "../../src/dev/sensor-diagnostics-view.js";
import { renderUnsupportedView } from "../../src/dev/unsupported-view.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const container = document.createElement("div");
  document.body.append(container);
  const adapter = new FakeSensorAdapter({ sampleHz: 25, now: () => 0 });
  const controller = new AcquisitionController(adapter, { samplerHz: 25 });
  const log = new DiagnosticLog();
  const rawRing = new RawReportRing();
  let clock = 0;
  const teardown = mountSensorDiagnosticsView(container, {
    controller,
    log,
    rawRing,
    getDeviceInfoText: () => "productName : Go!Motion (fake)",
    now: () => (clock += 40),
  });
  return { container, adapter, controller, log, rawRing, teardown };
}

const byText = (root: HTMLElement, text: string): HTMLButtonElement =>
  [...root.querySelectorAll("button")].find((b) => b.textContent === text) as HTMLButtonElement;

describe("sensor-diagnostics-view", () => {
  it("renders the core controls and blank readouts", () => {
    const { container } = setup();
    expect(container.querySelector(".diagnostics h2")!.textContent).toMatch(/Diagnostics/i);
    expect(byText(container, "CONNECT SENSOR")).toBeTruthy();
  });

  it("shows an Environment panel with protocol / secure context / WebHID", () => {
    const { container } = setup();
    const headings = [...container.querySelectorAll(".diagnostics h2")].map((h) => h.textContent);
    expect(headings).toContain("Environment");
    const env = [...container.querySelectorAll(".device-info")]
      .map((p) => p.textContent ?? "")
      .find((t) => t.includes("origin / protocol"));
    expect(env).toBeTruthy();
    expect(env).toMatch(/secure context/);
    expect(env).toMatch(/WebHID API/);
    expect(byText(container, "START").disabled).toBe(true);
    expect(container.querySelector(".readout .big")!.textContent).toBe("—");
  });

  it("CONNECT -> status shows the device label; ARM + START -> POSITION changes", async () => {
    const { container, controller } = setup();
    await controller.connect();
    expect(container.querySelector(".status-line .value")!.textContent).toContain("Go!Motion");

    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(200);
    const pos = container.querySelector(".readout .big")!.textContent!;
    expect(pos).toMatch(/ m$/);
    expect(pos).not.toBe("—");
    const diagText = [...container.querySelectorAll(".diag")].map((d) => d.textContent).join(" ");
    expect(diagText).toContain("Samples:");
    expect(diagText).toMatch(/Observed rate: \d/);
  });

  it("CLEAR LOG empties the log element", async () => {
    const { container, log } = setup();
    log.add("hello");
    vi.advanceTimersByTime(1);
    expect(container.querySelector(".log")!.textContent).toContain("hello");
    byText(container, "CLEAR LOG").click();
    expect(container.querySelector(".log")!.textContent).toBe("");
  });

  it("PAUSE toggles the raw ring", () => {
    const { container, rawRing } = setup();
    const btn = byText(container, "PAUSE");
    btn.click();
    expect(btn.textContent).toBe("RESUME");
    expect(rawRing.paused).toBe(true);
  });

  it("teardown removes the view and detaches subscriptions", async () => {
    const { container, controller, teardown } = setup();
    teardown();
    expect(container.querySelector(".diagnostics")).toBeNull();
    await controller.connect(); // must not throw / touch detached DOM
  });
});

describe("unsupported-view", () => {
  it("renders the WebHID-not-available message", () => {
    const container = document.createElement("div");
    renderUnsupportedView(container);
    expect(container.textContent).toContain("WebHID is not available");
    expect(container.textContent).toContain("Chrome");
    expect(container.querySelector("button")).toBeNull();
  });
});
