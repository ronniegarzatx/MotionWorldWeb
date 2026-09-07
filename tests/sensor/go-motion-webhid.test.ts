import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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

/**
 * Regression: real Chromium binds `setTimeout`/`setInterval` to `Window` and
 * throws `TypeError: Illegal invocation` when they are called with any other
 * receiver (e.g. as a property of the adapter). Node/jsdom do not enforce this,
 * which is why every earlier unit test passed while the real Go!Motion init
 * failed with `protocol_init_failed` right after a valid `9a 1a ...` INIT reply.
 *
 * These tests install strict, receiver-checking globals and exercise the
 * adapter's DEFAULT (non-injected) timer path.
 */
describe("GoMotionWebHIDAdapter — browser timer receiver safety", () => {
  const strictBuilt: GoMotionWebHIDAdapter[] = [];
  let realSetTimeout: typeof setTimeout;
  let realClearTimeout: typeof clearTimeout;
  let realSetInterval: typeof setInterval;
  let realClearInterval: typeof clearInterval;

  const guard =
    <A extends unknown[], R>(name: string, real: (...args: A) => R) =>
    function (this: unknown, ...args: A): R {
      // Mimic Chromium: the receiver must be the global (or undefined for a
      // bare call). Any other object -> Illegal invocation.
      if (this !== undefined && this !== null && this !== globalThis) {
        throw new TypeError(`Illegal invocation (${name} called with a foreign receiver)`);
      }
      return real.apply(globalThis, args);
    };

  beforeAll(() => {
    realSetTimeout = globalThis.setTimeout;
    realClearTimeout = globalThis.clearTimeout;
    realSetInterval = globalThis.setInterval;
    realClearInterval = globalThis.clearInterval;
    globalThis.setTimeout = guard("setTimeout", realSetTimeout) as typeof setTimeout;
    globalThis.clearTimeout = guard("clearTimeout", realClearTimeout) as typeof clearTimeout;
    globalThis.setInterval = guard("setInterval", realSetInterval) as typeof setInterval;
    globalThis.clearInterval = guard("clearInterval", realClearInterval) as typeof clearInterval;
  });

  afterAll(() => {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
  });

  afterEach(async () => {
    for (const a of strictBuilt.splice(0)) await a.disconnect();
    await new Promise((r) => realSetTimeout(r, 5));
  });

  function strictBuild() {
    const hid = new FakeHid();
    const device = new FakeHidDevice();
    hid.requestResult = [device];
    hid.grantedDevices = [device];
    // NOTE: no setTimeoutFn/setIntervalFn injected -> exercises the default path.
    const adapter = new GoMotionWebHIDAdapter(hid, {
      statusPollMs: 5,
      commandTimeoutMs: 200,
      now: () => 0,
    });
    strictBuilt.push(adapter);
    return { hid, device, adapter };
  }

  it("the strict global itself rejects a foreign receiver (test scaffold sanity)", () => {
    const foreign = { setTimeout: globalThis.setTimeout };
    expect(() => foreign.setTimeout(() => {}, 0)).toThrow(/Illegal invocation/);
  });

  it("connect(): INIT waiter installs, packet is sent, 9a 1a reply resolves -> system_ready", async () => {
    const { adapter, device } = strictBuild();
    await adapter.connect();
    await new Promise((r) => realSetTimeout(r, 0));

    expect(toHex(device.sentReports[0]!)).toBe("1a 02 00 00 00 00 00 00");
    // the FakeHidDevice auto-answers 9a 1a 00 ... to INIT
    expect(adapter.status).toBe("system_ready");
    expect(adapter.lastError).toBeNull();
  });

  it("setReady(true): SET_PERIOD + START(button) round-trip under strict timers -> sensor_ready", async () => {
    const { adapter, device } = strictBuild();
    await adapter.connect();
    await new Promise((r) => realSetTimeout(r, 0));
    device.sentReports.length = 0;
    await adapter.setReady(true);
    await new Promise((r) => realSetTimeout(r, 0));
    expect(toHex(device.sentReports[0]!)).toBe("1b 28 00 00 00 00 00 00");
    expect(toHex(device.sentReports[1]!)).toBe("18 01 00 00 00 00 00 00");
    expect(adapter.status).toBe("sensor_ready");
  });
});
