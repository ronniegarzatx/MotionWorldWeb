import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcquisitionController } from "../../src/acquisition/acquisition-controller.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import type { MotionRun } from "../../src/model/motion-run.js";
import type { AcquisitionState } from "../../src/acquisition/acquisition-state.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(sampleHz = 25) {
  const adapter = new FakeSensorAdapter({ sampleHz, now: () => 0 });
  const controller = new AcquisitionController(adapter, { samplerHz: sampleHz });
  const states: AcquisitionState[] = [];
  const runs: MotionRun[] = [];
  controller.subscribeUiState((s) => states.push(s.state));
  controller.subscribeRunComplete((r) => runs.push(r));
  return { adapter, controller, states, runs };
}

describe("AcquisitionController", () => {
  it("drives the happy-path state sequence", async () => {
    const { controller, states } = setup();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(200);
    await controller.stop();
    // collapse consecutive duplicates (a bare "connecting" flip emits with the
    // machine still NO_DEVICE before connect resolves)
    const collapsed = states.filter((s, i) => s !== states[i - 1]);
    expect(collapsed).toEqual([
      "NO_DEVICE",
      "SYSTEM_READY",
      "SENSOR_READY",
      "MEASURING",
      "SENSOR_READY",
    ]);
  });

  it("produces a frozen MotionRun with the right count/duration on stop", async () => {
    const { controller, runs } = setup();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(400); // 10 samples @ 25 Hz
    await controller.stop();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.sampleCount).toBe(10);
    expect(runs[0]!.durationSeconds).toBeCloseTo(0.36, 6);
    expect(runs[0]!.source).toBe("fake");
    expect(Object.isFrozen(runs[0])).toBe(true);
  });

  it("three sequential runs are distinct", async () => {
    const { controller, runs } = setup();
    await controller.connect();
    await controller.arm();
    for (let i = 0; i < 3; i++) {
      await controller.start();
      vi.advanceTimersByTime(200);
      await controller.stop();
    }
    expect(runs).toHaveLength(3);
    expect(new Set(runs.map((r) => r.id)).size).toBe(3);
    expect(runs.every((r) => r.sampleCount === 5)).toBe(true);
  });

  it("device-lost during MEASURING -> DEVICE_LOST + partial run preserved with reason", async () => {
    const { adapter, controller, states, runs } = setup();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(120); // 3 samples
    adapter.emitDeviceLost();
    expect(states.at(-1)).toBe("DEVICE_LOST");
    expect(controller.uiState.lastStopReason).toBe("device_lost");
    expect(runs).toHaveLength(1);
    expect(runs[0]!.sampleCount).toBe(3);
    expect(runs[0]!.stopReason).toBe("device_lost");
  });

  it("Start intent while only SYSTEM_READY is a no-op (adapter.start not called)", async () => {
    const { adapter, controller } = setup();
    const spy = vi.spyOn(adapter, "start");
    await controller.connect();
    await controller.start(); // not armed
    expect(spy).not.toHaveBeenCalled();
    expect(controller.uiState.state).toBe("SYSTEM_READY");
  });

  it("dispose() detaches — later adapter events do not change uiState", async () => {
    const { adapter, controller, states } = setup();
    await controller.connect();
    controller.dispose();
    const len = states.length;
    await adapter.setReady(true);
    adapter.emitDeviceLost();
    expect(states.length).toBe(len);
  });

  it("physical-button trigger path: adapter emits trigger.start -> MEASURING", async () => {
    const { adapter, controller, states } = setup();
    await controller.connect();
    await controller.arm();
    // simulate a button press: adapter goes measuring + emits a trigger
    await adapter.start();
    expect(states.at(-1)).toBe("MEASURING");
  });

  it("exposes a `connecting` flag while the adapter opens/reopens a device", async () => {
    const { adapter, controller } = setup();
    const seen: boolean[] = [];
    controller.subscribeUiState((s) => seen.push(s.connecting));
    adapter.cancelNextConnectSelection(); // -> connecting then error, no device
    await controller.connect();
    expect(seen).toContain(true);
    expect(controller.uiState.connecting).toBe(false);
  });

  it("stopForNavigation freezes the partial run with reason 'navigation'", async () => {
    const { controller, runs } = setup();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(120); // 3 samples
    await controller.stopForNavigation();
    expect(controller.uiState.state).toBe("SENSOR_READY");
    expect(controller.uiState.lastStopReason).toBe("navigation");
    expect(runs).toHaveLength(1);
    expect(runs[0]!.sampleCount).toBe(3);
  });

  it("stopForNavigation is a no-op when not measuring", async () => {
    const { controller, runs } = setup();
    await controller.connect();
    await controller.arm();
    await controller.stopForNavigation();
    expect(controller.uiState.state).toBe("SENSOR_READY");
    expect(runs).toHaveLength(0);
  });

  it("currentRunSamples / lastCompletedRun snapshots for view restore", async () => {
    const { controller } = setup();
    await controller.connect();
    await controller.arm();
    expect(controller.currentRunSamples()).toEqual([]);
    expect(controller.lastCompletedRun()).toBeNull();

    await controller.start();
    vi.advanceTimersByTime(200); // 5 samples
    const live = controller.currentRunSamples();
    expect(live).toHaveLength(5);
    expect(Object.isFrozen(live)).toBe(true);

    await controller.stop();
    expect(controller.currentRunSamples()).toEqual([]);
    expect(controller.lastCompletedRun()?.sampleCount).toBe(5);
  });
});
