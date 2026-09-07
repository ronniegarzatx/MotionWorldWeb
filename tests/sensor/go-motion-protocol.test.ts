import { describe, expect, it } from "vitest";
import {
  ProtocolError,
  classifyReport,
  decodeMeasurement,
  decodeMeasurementStatus,
  encodeGetMeasurementStatus,
  encodeInit,
  encodeSetPeriod,
  encodeStart,
  encodeStop,
  metersToFeet,
  periodToTicks,
  toHex,
} from "../../src/sensor/go-motion-protocol.js";

const hex = (b: Uint8Array) => toHex(b);

describe("encoders", () => {
  it("INIT = 1a 02 00 00 00 00 00 00", () => {
    expect(hex(encodeInit())).toBe("1a 02 00 00 00 00 00 00");
  });

  it("SET_PERIOD 0.040 s = 40 ticks -> 1b 28 00 00 00 00 00 00", () => {
    expect(hex(encodeSetPeriod(0.04))).toBe("1b 28 00 00 00 00 00 00");
  });

  it("SET_PERIOD clamps to the legal Cyclops range and rounds to 1 ms ticks", () => {
    expect(periodToTicks(0.04)).toBe(40);
    expect(periodToTicks(0.001)).toBe(20); // below min 0.02
    expect(periodToTicks(9999)).toBe(180_000); // above max 180 s
    expect(periodToTicks(0.0405)).toBe(41); // rounds
    expect(() => periodToTicks(-1)).toThrow(ProtocolError);
  });

  it("START button / immediate", () => {
    expect(hex(encodeStart({ trigger: "button" }))).toBe("18 01 00 00 00 00 00 00");
    expect(hex(encodeStart({ trigger: "immediate" }))).toBe("18 00 00 00 00 00 00 00");
  });

  it("STOP / GET_MEASUREMENT_STATUS", () => {
    expect(hex(encodeStop())).toBe("19 00 00 00 00 00 00 00");
    expect(hex(encodeGetMeasurementStatus())).toBe("30 00 00 00 00 00 00 00");
  });
});

describe("classifyReport", () => {
  it("measurement packet (header top bits 00)", () => {
    expect(classifyReport(Uint8Array.of(0x00, 0x01, 0, 0, 0, 0, 0, 0))).toEqual({
      kind: "measurement",
    });
  });

  it("cmd response, ok and error", () => {
    expect(classifyReport(Uint8Array.of(0x5a, 0x18, 0, 0, 0, 0, 0, 0))).toEqual({
      kind: "cmd_response",
      cmd: 0x18,
      error: false,
      payloadLength: 2,
    });
    const err = classifyReport(Uint8Array.of(0x7a, 0x18, 0x36, 0, 0, 0, 0, 0));
    expect(err).toMatchObject({ kind: "cmd_response", cmd: 0x18, error: true });
  });

  it("init response and idle", () => {
    expect(classifyReport(Uint8Array.of(0x9a, 0, 0, 0, 0, 0, 0, 0))).toEqual({
      kind: "init_response",
      error: false,
    });
    expect(classifyReport(Uint8Array.of(0xc0, 0, 0, 0, 0, 0, 0, 0))).toEqual({
      kind: "idle",
    });
  });

  it("short / empty -> unknown", () => {
    expect(classifyReport(new Uint8Array(0)).kind).toBe("unknown");
    expect(classifyReport(Uint8Array.of(0, 1, 2)).kind).toBe("unknown");
  });
});

describe("decodeMeasurement", () => {
  it("200000 microns -> 0.2 m", () => {
    // int32 LE 0x00030D40 = 200000
    const pkt = Uint8Array.of(0x01, 0x05, 0x40, 0x0d, 0x03, 0x00, 0x00, 0x00);
    const m = decodeMeasurement(pkt);
    expect(m.rawMicrons).toBe(200_000);
    expect(m.positionMeters).toBeCloseTo(0.2, 12);
    expect(m.rollingCounter).toBe(0x05);
  });

  it("negative (sign handling — confirm on hardware)", () => {
    // int32 LE 0xFFFF0000 = -65536
    const pkt = Uint8Array.of(0x01, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00);
    const m = decodeMeasurement(pkt);
    expect(m.rawMicrons).toBe(-65_536);
    expect(m.positionMeters).toBeCloseTo(-0.065536, 12);
  });

  it("throws on a short packet", () => {
    expect(() => decodeMeasurement(Uint8Array.of(1, 2, 3))).toThrow(ProtocolError);
  });

  it("metersToFeet", () => {
    expect(metersToFeet(1)).toBeCloseTo(3.2808399, 7);
  });
});

describe("decodeMeasurementStatus", () => {
  it("armed + triggered (flags 0xA0)", () => {
    const st = decodeMeasurementStatus(Uint8Array.of(0xa0, 0x00, 0x00, 0x00, 0x03, 0x00));
    expect(st.realtimeEnabled).toBe(true);
    expect(st.triggered).toBe(true);
    expect(st.dataRunSignature).toBe(3);
    expect(st.batteryState).toBe("good");
  });

  it("armed, not triggered (flags 0x80)", () => {
    const st = decodeMeasurementStatus(Uint8Array.of(0x80, 0x01, 0x00, 0x00, 0x00, 0x00));
    expect(st.realtimeEnabled).toBe(true);
    expect(st.triggered).toBe(false);
    expect(st.triggerType).toBe(1);
  });

  it("low battery bits decode", () => {
    const st = decodeMeasurementStatus(Uint8Array.of(0x08, 0, 0, 0, 0, 0));
    expect(st.batteryState).toBe("low_always");
  });

  it("throws on a short payload", () => {
    expect(() => decodeMeasurementStatus(Uint8Array.of(1, 2))).toThrow(ProtocolError);
  });
});
