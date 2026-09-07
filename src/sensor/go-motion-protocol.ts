/**
 * Pure Go!Motion / CBR 2 ("Cyclops") protocol codec. NO I/O.
 *
 * Every constant carries its evidence into the Vernier GoIO SDK source tree
 * (`/Users/sine/Desktop/GoIO_SDK/src`, read-only). See
 * `docs/research/go-motion-webhid-protocol.md` for the full write-up.
 *
 * Wire format: 8-byte application packets. On WebHID these ride in HID report
 * id 0 (the Windows SDK uses a 9-byte report: [reportId=0, ...8 bytes]).
 */

// ── Command IDs ──────────────────────────────────────────────────────────────
// evidence: GoIO_cpp/GSkipCommExt.h:48-63, GCyclopsCommExt.h:58
export const CMD_GET_STATUS = 0x10;
export const CMD_START_MEASUREMENTS = 0x18;
export const CMD_STOP_MEASUREMENTS = 0x19;
export const CMD_INIT = 0x1a;
export const CMD_SET_MEASUREMENT_PERIOD = 0x1b;
export const CMD_GET_MEASUREMENT_PERIOD = 0x1c;
export const CMD_GET_MEASUREMENT_STATUS = 0x30;

// ── INIT params (Cyclops) ────────────────────────────────────────────────────
// evidence: GCyclopsCommExt.h:78-85, GoIO_DLL_interface.cpp:604-618
export const SKIP_HOST_TYPE_COMPUTER = 2;

// ── START_MEASUREMENTS params (Cyclops) ──────────────────────────────────────
// evidence: GCyclopsCommExt.h:88-94, 122-130 ; GSkipComm.h:256-266
export const TRIGGER_TYPE_IMMEDIATE = 0;
export const TRIGGER_TYPE_BUTTON = 1;
export const MEAS_TYPE_DISTANCE = 0;
export const MEAS_TYPE_VELOCITY = 1;
export const MEAS_TYPE_ACCEL = 2;
export const FILTER_NONE = 0;

// ── Measurement period ───────────────────────────────────────────────────────
// evidence: GCyclopsDevice.h:71 (tick 0.001s), GCyclopsDevice.cpp:50-55 (range)
export const MEASUREMENT_TICK_SECONDS = 0.001;
export const MIN_PERIOD_SECONDS = 0.02;
export const MAX_PERIOD_SECONDS = 180;
/** Native Motion World baseline. evidence: GoIO_LiveMotion.cpp:279 */
export const DEFAULT_PERIOD_SECONDS = 0.04;

// ── Inbound packet header (first byte) ───────────────────────────────────────
// evidence: GSkipComm.h:49-60, 613-624
export const HDR_TYPE_MASK = 0xc0;
export const HDR_TYPE_MEASUREMENT = 0x00;
export const HDR_TYPE_CMD_RESP = 0x40;
export const HDR_TYPE_INIT_RESP = 0x80;
export const HDR_TYPE_IDLE = 0xc0;
export const HDR_ERROR_FLAG = 0x20;
export const HDR_PAYLOAD_LEN_MASK = 0x07;

// ── GET_MEASUREMENT_STATUS flags ─────────────────────────────────────────────
// evidence: GSkipCommExt.h:172-178, 238-246
export const STATUS_REALTIME_ENABLED = 0x80;
export const STATUS_NONREALTIME_ENABLED = 0x40;
export const STATUS_TRIGGERED = 0x20;
export const STATUS_REALTIME_DATA = 0x10;
export const STATUS_BATTERY_MASK = 0x0c;

// ── Calibration ──────────────────────────────────────────────────────────────
// evidence: GCyclopsDevice.h:75-76 (raw*1e-6), GCyclopsDevice.cpp:158-198
//   (synthetic DDS: linear a=0 b=1 units "(m)"; page 1 b=3.2808399 units "(ft)")
//   raw int32 is in microns -> metres = raw * 1e-6.
export const MICRONS_TO_METERS = 1e-6;
export const METERS_TO_FEET = 3.2808399;

export const PACKET_BYTES = 8;

export class ProtocolError extends Error {
  override readonly name = "ProtocolError";
}

// ─────────────────────────────────────────────────────────────────────────────
// Encoders (host -> device). All return an 8-byte Uint8Array.
// ─────────────────────────────────────────────────────────────────────────────

function packet(cmd: number, params: readonly number[] = []): Uint8Array {
  const buf = new Uint8Array(PACKET_BYTES);
  buf[0] = cmd & 0xff;
  for (let i = 0; i < params.length && i < PACKET_BYTES - 1; i++) {
    buf[i + 1] = params[i]! & 0xff;
  }
  return buf;
}

export function encodeInit(): Uint8Array {
  // Cyclops INIT params: hostType, forcePowerOnDefaults(=0).
  return packet(CMD_INIT, [SKIP_HOST_TYPE_COMPUTER, 0]);
}

export function encodeGetStatus(): Uint8Array {
  return packet(CMD_GET_STATUS);
}

export function encodeGetMeasurementStatus(): Uint8Array {
  return packet(CMD_GET_MEASUREMENT_STATUS);
}

export function encodeStop(): Uint8Array {
  return packet(CMD_STOP_MEASUREMENTS);
}

/** Clamp to the legal Cyclops range and round to the nearest 1 ms tick. */
export function periodToTicks(periodSeconds: number): number {
  if (!Number.isFinite(periodSeconds) || periodSeconds < 0) {
    throw new ProtocolError(`invalid period ${periodSeconds}`);
  }
  const clamped = Math.min(
    MAX_PERIOD_SECONDS,
    Math.max(MIN_PERIOD_SECONDS, periodSeconds),
  );
  return Math.round(clamped / MEASUREMENT_TICK_SECONDS);
}

export function encodeSetPeriod(periodSeconds: number): Uint8Array {
  const ticks = periodToTicks(periodSeconds);
  return packet(CMD_SET_MEASUREMENT_PERIOD, [
    ticks & 0xff,
    (ticks >>> 8) & 0xff,
    (ticks >>> 16) & 0xff,
    (ticks >>> 24) & 0xff,
  ]);
}

export interface StartOptions {
  readonly trigger: "immediate" | "button";
  readonly measType?: "distance" | "velocity" | "accel";
}

export function encodeStart(opts: StartOptions): Uint8Array {
  const trigger =
    opts.trigger === "button" ? TRIGGER_TYPE_BUTTON : TRIGGER_TYPE_IMMEDIATE;
  const measType =
    opts.measType === "velocity"
      ? MEAS_TYPE_VELOCITY
      : opts.measType === "accel"
        ? MEAS_TYPE_ACCEL
        : MEAS_TYPE_DISTANCE;
  // params: triggerType, countLo(0), countHi(0)=realtime, realTimeMeasType, flags(0), filterType(0)
  return packet(CMD_START_MEASUREMENTS, [trigger, 0, 0, measType, 0, FILTER_NONE]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Decoders (device -> host)
// ─────────────────────────────────────────────────────────────────────────────

export type ReportClass =
  | { readonly kind: "measurement" }
  | {
      readonly kind: "cmd_response";
      readonly cmd: number;
      readonly error: boolean;
      readonly payloadLength: number;
    }
  | { readonly kind: "init_response"; readonly error: boolean }
  | { readonly kind: "idle" }
  | { readonly kind: "unknown" };

export function classifyReport(bytes: Uint8Array): ReportClass {
  if (bytes.length < PACKET_BYTES) return { kind: "unknown" };
  const header = bytes[0]!;
  switch (header & HDR_TYPE_MASK) {
    case HDR_TYPE_MEASUREMENT:
      return { kind: "measurement" };
    case HDR_TYPE_CMD_RESP:
      return {
        kind: "cmd_response",
        cmd: bytes[1]!,
        error: (header & HDR_ERROR_FLAG) !== 0,
        payloadLength: header & HDR_PAYLOAD_LEN_MASK,
      };
    case HDR_TYPE_INIT_RESP:
      return { kind: "init_response", error: (header & HDR_ERROR_FLAG) !== 0 };
    case HDR_TYPE_IDLE:
      return { kind: "idle" };
    default:
      return { kind: "unknown" };
  }
}

export interface Measurement {
  /** 1-byte rolling counter — use for drop detection. */
  readonly rollingCounter: number;
  readonly rawMicrons: number;
  readonly positionMeters: number;
  readonly measurementType: number;
}

/**
 * Decode a Cyclops real-time measurement packet (GCyclopsMeasurementPacket,
 * GSkipComm.h:95-105): [nInPacket=1, counter, m0..m3 (int32 LE microns), type, reserved].
 */
export function decodeMeasurement(bytes: Uint8Array): Measurement {
  if (bytes.length < PACKET_BYTES) {
    throw new ProtocolError(`measurement packet too short: ${bytes.length}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rawMicrons = view.getInt32(2, /* littleEndian */ true);
  return {
    rollingCounter: bytes[1]!,
    rawMicrons,
    positionMeters: rawMicrons * MICRONS_TO_METERS,
    measurementType: bytes[6]!,
  };
}

export function metersToFeet(meters: number): number {
  return meters * METERS_TO_FEET;
}

export type BatteryState = "good" | "low_while_sampling" | "low_always" | "missing";

export interface MeasurementStatus {
  readonly realtimeEnabled: boolean;
  readonly nonRealtimeEnabled: boolean;
  readonly triggered: boolean;
  readonly realtimeData: boolean;
  readonly batteryState: BatteryState;
  readonly triggerType: number;
  readonly measurementCount: number;
  readonly dataRunSignature: number;
  readonly filterType: number;
}

const BATTERY_STATES: readonly BatteryState[] = [
  "good", // 0x00
  "low_while_sampling", // 0x04
  "low_always", // 0x08
  "missing", // 0x0c
];

/**
 * Decode the GET_MEASUREMENT_STATUS payload — the 6 bytes AFTER the
 * {header, cmd} pair: [flags, triggerType, countLo, countHi, runSig, filter].
 * evidence: GCyclopsCommExt.h:180-188
 */
export function decodeMeasurementStatus(payload: Uint8Array): MeasurementStatus {
  if (payload.length < 6) {
    throw new ProtocolError(`measurement-status payload too short: ${payload.length}`);
  }
  const flags = payload[0]!;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    realtimeEnabled: (flags & STATUS_REALTIME_ENABLED) !== 0,
    nonRealtimeEnabled: (flags & STATUS_NONREALTIME_ENABLED) !== 0,
    triggered: (flags & STATUS_TRIGGERED) !== 0,
    realtimeData: (flags & STATUS_REALTIME_DATA) !== 0,
    batteryState: BATTERY_STATES[(flags & STATUS_BATTERY_MASK) >> 2]!,
    triggerType: payload[1]!,
    measurementCount: view.getInt16(2, true),
    dataRunSignature: payload[4]!,
    filterType: payload[5]!,
  };
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
}
