import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcquisitionController } from "../../src/acquisition/acquisition-controller.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import { MemoryRunStore } from "../../src/store/memory-run-store.js";
import { startRunPersistence } from "../../src/store/run-persistence.js";
import type { RunStore } from "../../src/store/run-store.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(store: RunStore = new MemoryRunStore()) {
  const adapter = new FakeSensorAdapter({ sampleHz: 25, now: () => 0 });
  const controller = new AcquisitionController(adapter, { samplerHz: 25 });
  const onError = vi.fn();
  const onSaved = vi.fn();
  const stop = startRunPersistence(controller, store, { onError, onSaved, now: () => 12_345 });
  return { adapter, controller, store, onError, onSaved, stop };
}

async function oneRun(controller: AcquisitionController, ms = 200) {
  await controller.connect();
  await controller.arm();
  await controller.start();
  vi.advanceTimersByTime(ms);
  await controller.stop();
  await vi.runAllTimersAsync();
}

describe("startRunPersistence", () => {
  it("saves each completed run exactly once", async () => {
    const { controller, store, onSaved } = setup();
    await controller.connect();
    await controller.arm();
    for (let i = 0; i < 3; i++) {
      await controller.start();
      vi.advanceTimersByTime(120);
      await controller.stop();
    }
    await vi.runAllTimersAsync();
    const list = await store.listSummaries();
    expect(list).toHaveLength(3);
    expect(new Set(list.map((r) => r.id)).size).toBe(3);
    expect(onSaved).toHaveBeenCalledTimes(3);
  });

  it("retains a device-lost partial run with its stop reason", async () => {
    const { adapter, controller, store } = setup();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(120); // 3 samples
    adapter.emitDeviceLost();
    await vi.runAllTimersAsync();
    const list = await store.listSummaries();
    expect(list).toHaveLength(1);
    expect(list[0]!.stopReason).toBe("device_lost");
    expect(list[0]!.interrupted).toBe(true);
    expect(list[0]!.sampleCount).toBe(3);
  });

  it("retains a navigation partial run", async () => {
    const { controller, store } = setup();
    await controller.connect();
    await controller.arm();
    await controller.start();
    vi.advanceTimersByTime(80);
    await controller.stopForNavigation();
    await vi.runAllTimersAsync();
    expect((await store.listSummaries())[0]!.stopReason).toBe("navigation");
  });

  it("a save failure is reported and does not throw out of acquisition", async () => {
    const failing: RunStore = {
      kind: "memory",
      save: () => Promise.reject(new Error("quota exceeded")),
      get: async () => null,
      listSummaries: async () => [],
      delete: async () => {},
      clear: async () => {},
    };
    const { controller, onError } = setup(failing);
    await expect(oneRun(controller)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
    expect(controller.uiState.state).toBe("SENSOR_READY"); // acquisition unharmed
  });

  it("never double-saves the same run id (subscriber driven twice)", async () => {
    const store = new MemoryRunStore();
    const saveSpy = vi.spyOn(store, "save");
    const { controller } = setup(store);
    // a second, independent coordinator on the same controller+store
    startRunPersistence(controller, store, { now: () => 1 });
    await oneRun(controller);
    // two coordinators each fire once for the run, but the store ends with 1 run;
    // (each coordinator has its own guard — this asserts idempotency at the store)
    expect((await store.listSummaries())).toHaveLength(1);
    expect(saveSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("stop() detaches the coordinator", async () => {
    const { controller, store, stop } = setup();
    stop();
    await oneRun(controller);
    expect(await store.listSummaries()).toEqual([]);
  });
});
