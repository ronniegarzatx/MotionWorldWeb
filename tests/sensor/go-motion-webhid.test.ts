import { afterEach, describe, expect, it } from "vitest";
import { GoMotionWebHIDAdapter } from "../../src/sensor/go-motion-webhid.js";
import { toHex } from "../../src/sensor/go-motion-protocol.js";
import type { MotionSample, SensorStatus, TriggerEvent } from "../../src/sensor/types.js";
import { FakeHid, FakeHidDevice, tick } from "./fake-hid.js";

const built: GoMotionWebHIDAdapter[] = [];
afterEach(async () => {
  for (const a of built.splice(0)) await a.disconnect();
  await tick(5);
});

function build(overrides: Partial<ConstructorParameters<typeof GoMotionWebHIDAdapter>[1]> = {}) {
  const hid = new FakeHid();
  const device = new FakeHidDevice();
  hid.requestResult = [device];
  hid.grantedDevices = [device];
  const statuses: SensorStatus[] = [];
  const samples: MotionSample[] = [];
  const triggers: TriggerEvent[] = [];
  const adapter = new GoMotionWebHIDAdapter(hid, {
    statusPollMs: 5,
    commandTimeoutMs: 200,
    lostAfterFailedPolls: 4,
    now: () => 0,
    ...overrides,
  });
  adapter.subscribeStatus((s) => statuses.push(s));
  adapter.subscribeSamples((s) => samples.push(s));
  adapter.subscribeTrigger((t) => triggers.push(t));
  built.push(adapter);
  return { hid, device, adapter, statuses, samples, triggers };
}

describe("GoMotionWebHIDAdapter", () => {
  it("connect() sends INIT bytes and reaches system_ready", async () => {
    const { adapter, device } = build();
    await adapter.connect();
    await tick();
    expect(toHex(device.sentReports[0]!)).toBe("1a 02 00 00 00 00 00 00");
    expect(adapter.status).toBe("system_ready");
    expect(adapter.deviceLabel).toBe("Go!Motion");
  });

  it("reports unsupported_api when WebHID is absent", async () => {
    const adapter = new GoMotionWebHIDAdapter(null);
    await adapter.connect();
    expect(adapter.status).toBe("error");
    expect(adapter.lastError?.code).toBe("unsupported_api");
  });

  it("maps a cancelled picker to no_device_selected", async () => {
    const { adapter, hid } = build();
    const err = new Error("no selection");
    err.name = "NotFoundError";
    hid.requestResult = err;
    await adapter.connect();
    expect(adapter.lastError?.code).toBe("no_device_selected");
  });

  it("maps a SecurityError to policy_blocked", async () => {
    const { adapter, hid } = build();
    const err = new Error("blocked by policy");
    err.name = "SecurityError";
    hid.requestResult = err;
    await adapter.connect();
    expect(adapter.lastError?.code).toBe("policy_blocked");
  });

  it("falls back to sendFeatureReport, then reports send_report_unsupported", async () => {
    const { adapter, device } = build();
    device.failSendReport = true;
    device.failSendFeatureReport = false;
    await adapter.connect();
    await tick();
    expect(device.sentFeatureReports.length).toBeGreaterThan(0);
    expect(adapter.status).toBe("system_ready");

    const two = build();
    two.device.failSendReport = true;
    two.device.failSendFeatureReport = true;
    await two.adapter.connect();
    expect(two.adapter.status).toBe("error");
    expect(two.adapter.lastError?.code).toBe("send_report_unsupported");
  });

  it("setReady(true) sends SET_PERIOD then START(button)", async () => {
    const { adapter, device } = build();
    await adapter.connect();
    await tick();
    device.sentReports.length = 0;
    await adapter.setReady(true);
    await tick();
    expect(toHex(device.sentReports[0]!)).toBe("1b 28 00 00 00 00 00 00");
    expect(toHex(device.sentReports[1]!)).toBe("18 01 00 00 00 00 00 00");
    expect(adapter.status).toBe("sensor_ready");
  });

  it("a measurement inputreport becomes one frozen MotionSample in metres", async () => {
    const { adapter, device, samples } = build();
    await adapter.connect();
    await tick();
    device.emitMeasurement(1_427_000); // 1.427 m
    expect(samples).toHaveLength(1);
    expect(samples[0]!.positionMeters).toBeCloseTo(1.427, 6);
    expect(Object.isFrozen(samples[0])).toBe(true);
  });

  it("100 measurements get monotonic acquisition-relative timestamps", async () => {
    const { adapter, device, samples } = build();
    await adapter.connect();
    await tick();
    for (let i = 0; i < 100; i++) device.emitMeasurement(1_000_000 + i, i & 0xff);
    expect(samples).toHaveLength(100);
    expect(samples[0]!.timestampSeconds).toBe(0);
    expect(samples[99]!.timestampSeconds).toBeCloseTo(99 * 0.04, 9);
  });

  it("status flip 0x80 -> 0xA0 emits a start trigger and status measuring", async () => {
    const { adapter, device, triggers } = build();
    await adapter.connect();
    await tick();
    await adapter.setReady(true);
    await tick();
    device.triggered = true;
    await tick(20); // let the poll run
    expect(triggers.some((t) => t.kind === "start")).toBe(true);
    expect(adapter.status).toBe("measuring");
  });

  it("consecutive status-poll failures -> device_lost", async () => {
    const { adapter, device } = build({
      statusPollMs: 5,
      commandTimeoutMs: 10,
      lostAfterFailedPolls: 3,
    });
    await adapter.connect();
    await tick();
    await adapter.setReady(true);
    await tick();
    device.autoRespond = false; // stop answering status polls
    await tick(200);
    expect(adapter.status).toBe("device_lost");
  });

  it("hid disconnect event -> device_lost; disconnect() closes the device", async () => {
    const { adapter, device, hid } = build();
    await adapter.connect();
    await tick();
    hid.emitDisconnect(device);
    expect(adapter.status).toBe("device_lost");

    const again = build();
    await again.adapter.connect();
    await tick();
    await again.adapter.disconnect();
    expect(again.device.opened).toBe(false);
    expect(again.adapter.status).toBe("no_device");
  });
});
