import { describe, expect, it } from "vitest";
import {
  type AcquisitionEvent,
  type AcquisitionSnapshot,
  INITIAL,
  deriveUiFlags,
  reduce,
} from "../../src/acquisition/acquisition-state.js";

const run = (events: AcquisitionEvent[], from: AcquisitionSnapshot = INITIAL) =>
  events.reduce(reduce, from);

describe("acquisition state machine", () => {
  it("starts NO_DEVICE", () => {
    expect(INITIAL.state).toBe("NO_DEVICE");
  });

  it("connect -> SYSTEM_READY; arm before connect is a no-op", () => {
    expect(run([{ type: "arm" }]).state).toBe("NO_DEVICE");
    expect(run([{ type: "connected" }]).state).toBe("SYSTEM_READY");
  });

  it("arm/disarm between SYSTEM_READY and SENSOR_READY", () => {
    const s = run([{ type: "connected" }, { type: "arm" }]);
    expect(s.state).toBe("SENSOR_READY");
    expect(run([{ type: "disarm" }], s).state).toBe("SYSTEM_READY");
  });

  it("SENSOR_READY -> MEASURING on start OR trigger.start", () => {
    const armed = run([{ type: "connected" }, { type: "arm" }]);
    expect(run([{ type: "start" }], armed).state).toBe("MEASURING");
    expect(run([{ type: "trigger", kind: "start" }], armed).state).toBe("MEASURING");
  });

  it("MEASURING -> SENSOR_READY records the stop reason", () => {
    const measuring = run([
      { type: "connected" },
      { type: "arm" },
      { type: "start" },
    ]);
    expect(run([{ type: "stop" }], measuring)).toMatchObject({
      state: "SENSOR_READY",
      lastStopReason: "ui",
    });
    expect(run([{ type: "stop", reason: "navigation" }], measuring)).toMatchObject({
      state: "SENSOR_READY",
      lastStopReason: "navigation",
    });
    expect(run([{ type: "trigger", kind: "stop" }], measuring)).toMatchObject({
      state: "SENSOR_READY",
      lastStopReason: "trigger",
    });
  });

  it("lost from any connected state -> DEVICE_LOST; from MEASURING records device_lost", () => {
    const sys = run([{ type: "connected" }]);
    expect(run([{ type: "lost" }], sys).state).toBe("DEVICE_LOST");

    const measuring = run([{ type: "connected" }, { type: "arm" }, { type: "start" }]);
    expect(run([{ type: "lost" }], measuring)).toMatchObject({
      state: "DEVICE_LOST",
      lastStopReason: "device_lost",
    });
  });

  it("DEVICE_LOST + connected -> SYSTEM_READY", () => {
    const lost = run([{ type: "connected" }, { type: "lost" }]);
    expect(run([{ type: "connected" }], lost).state).toBe("SYSTEM_READY");
    expect(run([{ type: "reconnected" }], lost).state).toBe("SYSTEM_READY");
  });

  it("error from any state -> ERROR carrying the error; recoverable", () => {
    const measuring = run([{ type: "connected" }, { type: "arm" }, { type: "start" }]);
    const errored = run([{ type: "error", code: "open_failed", message: "boom" }], measuring);
    expect(errored.state).toBe("ERROR");
    expect(errored.error).toEqual({ code: "open_failed", message: "boom" });
    expect(run([{ type: "connected" }], errored).state).toBe("SYSTEM_READY");
  });

  it("disconnected -> INITIAL from anywhere", () => {
    const measuring = run([{ type: "connected" }, { type: "arm" }, { type: "start" }]);
    expect(run([{ type: "disconnected" }], measuring)).toEqual(INITIAL);
  });

  it("no event ever throws; unknown transitions are no-ops", () => {
    const states: AcquisitionSnapshot[] = [
      INITIAL,
      run([{ type: "connected" }]),
      run([{ type: "connected" }, { type: "arm" }]),
      run([{ type: "connected" }, { type: "arm" }, { type: "start" }]),
      run([{ type: "connected" }, { type: "lost" }]),
    ];
    const events: AcquisitionEvent[] = [
      { type: "connected" },
      { type: "arm" },
      { type: "disarm" },
      { type: "start" },
      { type: "stop" },
      { type: "trigger", kind: "start" },
      { type: "trigger", kind: "stop" },
      { type: "lost" },
    ];
    for (const s of states) {
      for (const e of events) {
        expect(() => reduce(s, e)).not.toThrow();
      }
    }
  });

  it("deriveUiFlags per state", () => {
    expect(deriveUiFlags("NO_DEVICE")).toMatchObject({ canConnect: true, connected: false });
    expect(deriveUiFlags("SYSTEM_READY")).toMatchObject({ canArm: true, canStart: false });
    expect(deriveUiFlags("SENSOR_READY")).toMatchObject({ canStart: true, canDisarm: true, canStop: false });
    expect(deriveUiFlags("MEASURING")).toMatchObject({ canStop: true, canStart: false, connected: true });
    expect(deriveUiFlags("DEVICE_LOST")).toMatchObject({ canConnect: true, connected: false });
  });
});
