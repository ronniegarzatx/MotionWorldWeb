import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import type { MotionSample, SensorStatus } from "../../src/sensor/types.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function armed(): Promise<{ a: FakeSensorAdapter; statuses: SensorStatus[]; samples: MotionSample[] }> {
  const a = new FakeSensorAdapter({ sampleHz: 25, now: () => 0 });
  const statuses: SensorStatus[] = [];
  const samples: MotionSample[] = [];
  a.subscribeStatus((s) => statuses.push(s));
  a.subscribeSamples((s) => samples.push(s));
  await a.connect();
  await a.setReady(true);
  return { a, statuses, samples };
}

describe("FakeSensorAdapter", () => {
  it("connect -> system_ready -> sensor_ready -> measuring -> sensor_ready", async () => {
    const { a, statuses, samples } = await armed();
    expect(a.status).toBe("sensor_ready");

    await a.start();
    expect(a.status).toBe("measuring");
    vi.advanceTimersByTime(200); // 5 ticks @ 25 Hz
    expect(samples.length).toBe(5);
    expect(samples.every((s) => Object.isFrozen(s))).toBe(true);
    // monotonic acquisition-relative time
    expect(samples.map((s) => s.timestampSeconds)).toEqual([0, 0.04, 0.08, 0.12, 0.16]);

    await a.stop();
    expect(a.status).toBe("sensor_ready");
    const before = samples.length;
    vi.advanceTimersByTime(200);
    expect(samples.length).toBe(before); // no samples after stop

    expect(statuses).toEqual([
      "connecting",
      "system_ready",
      "sensor_ready",
      "measuring",
      "sensor_ready",
    ]);
  });

  it("supports repeated runs, each re-anchored at t=0", async () => {
    const { a, samples } = await armed();
    for (let i = 0; i < 3; i++) {
      await a.start();
      vi.advanceTimersByTime(120);
      await a.stop();
    }
    // three runs of 3 samples, each starting at 0
    expect(samples.length).toBe(9);
    expect(samples[0]!.timestampSeconds).toBe(0);
    expect(samples[3]!.timestampSeconds).toBe(0);
    expect(samples[6]!.timestampSeconds).toBe(0);
  });

  it("disconnect stops timers and clears subscribers", async () => {
    const { a, samples } = await armed();
    await a.start();
    vi.advanceTimersByTime(80);
    await a.disconnect();
    const before = samples.length;
    vi.advanceTimersByTime(400);
    expect(samples.length).toBe(before);
    expect(a.status).toBe("no_device");
    expect(a.deviceLabel).toBeNull();
  });

  it("emitDeviceLost -> device_lost and no more samples", async () => {
    const { a, samples } = await armed();
    await a.start();
    vi.advanceTimersByTime(80);
    a.emitDeviceLost();
    expect(a.status).toBe("device_lost");
    const before = samples.length;
    vi.advanceTimersByTime(400);
    expect(samples.length).toBe(before);
  });

  it("failNextConnect -> error with a code", async () => {
    const a = new FakeSensorAdapter();
    a.failNextConnect({ code: "open_failed", message: "nope" });
    await a.connect();
    expect(a.status).toBe("error");
    expect(a.lastError?.code).toBe("open_failed");
  });

  it("cancelNextConnectSelection -> no_device_selected", async () => {
    const a = new FakeSensorAdapter();
    a.cancelNextConnectSelection();
    await a.connect();
    expect(a.status).toBe("error");
    expect(a.lastError?.code).toBe("no_device_selected");
  });
});
