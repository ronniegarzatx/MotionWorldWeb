/**
 * Pure acquisition state machine (spec §5, §6). No adapter references, no I/O.
 *
 *   NO_DEVICE --connect--> SYSTEM_READY --arm--> SENSOR_READY --start|trigger--> MEASURING
 *      ^                        ^                    ^   ^                            |
 *      |                        | <--disarm----------+   +-- stop | trigger.stop <---+
 *      +--------- lost ---------+------------ lost -------------------- lost ---------+
 *
 * A single input never both arms and starts: SENSOR_READY -> MEASURING happens
 * only on a trigger (physical button OR the on-screen Start, which raise the
 * same event).
 */

export type AcquisitionState =
  | "NO_DEVICE"
  | "SYSTEM_READY"
  | "SENSOR_READY"
  | "MEASURING"
  | "DEVICE_LOST"
  | "ERROR";

import type { StopReason } from "../model/stop-reason.js";
export type { StopReason };

export interface AcquisitionSnapshot {
  readonly state: AcquisitionState;
  readonly lastStopReason: StopReason;
  readonly error: { readonly code: string; readonly message: string } | null;
}

export type AcquisitionEvent =
  | { readonly type: "connected" }
  | { readonly type: "reconnected" }
  | { readonly type: "arm" }
  | { readonly type: "disarm" }
  | { readonly type: "start" } // UI Start intent
  | { readonly type: "stop"; readonly reason?: StopReason } // UI Stop / navigation
  | { readonly type: "trigger"; readonly kind: "start" | "stop" }
  | { readonly type: "lost" }
  | { readonly type: "error"; readonly code: string; readonly message: string }
  | { readonly type: "disconnected" };

export const INITIAL: AcquisitionSnapshot = Object.freeze({
  state: "NO_DEVICE",
  lastStopReason: null,
  error: null,
});

export function reduce(
  snap: AcquisitionSnapshot,
  event: AcquisitionEvent,
): AcquisitionSnapshot {
  const { state } = snap;

  // `lost` and `error` and `disconnected` are accepted from anywhere.
  if (event.type === "lost") {
    if (state === "NO_DEVICE" || state === "ERROR") return snap;
    return {
      state: "DEVICE_LOST",
      lastStopReason: state === "MEASURING" ? "device_lost" : snap.lastStopReason,
      error: null,
    };
  }
  if (event.type === "error") {
    return {
      state: "ERROR",
      lastStopReason: state === "MEASURING" ? "error" : snap.lastStopReason,
      error: { code: event.code, message: event.message },
    };
  }
  if (event.type === "disconnected") {
    return INITIAL;
  }

  switch (state) {
    case "NO_DEVICE":
      if (event.type === "connected" || event.type === "reconnected") {
        return { ...snap, state: "SYSTEM_READY", error: null };
      }
      return snap;

    case "DEVICE_LOST":
    case "ERROR":
      if (event.type === "connected" || event.type === "reconnected") {
        return { state: "SYSTEM_READY", lastStopReason: snap.lastStopReason, error: null };
      }
      return snap;

    case "SYSTEM_READY":
      if (event.type === "arm") return { ...snap, state: "SENSOR_READY" };
      return snap;

    case "SENSOR_READY":
      if (event.type === "disarm") return { ...snap, state: "SYSTEM_READY" };
      if (event.type === "start" || (event.type === "trigger" && event.kind === "start")) {
        return { ...snap, state: "MEASURING", lastStopReason: null };
      }
      return snap;

    case "MEASURING":
      if (event.type === "stop") {
        return { ...snap, state: "SENSOR_READY", lastStopReason: event.reason ?? "ui" };
      }
      if (event.type === "trigger" && event.kind === "stop") {
        return { ...snap, state: "SENSOR_READY", lastStopReason: "trigger" };
      }
      return snap;

    default:
      return snap;
  }
}

export interface AcquisitionUiFlags {
  readonly canConnect: boolean;
  readonly canReconnect: boolean;
  readonly canArm: boolean;
  readonly canDisarm: boolean;
  readonly canStart: boolean;
  readonly canStop: boolean;
  readonly connected: boolean;
}

export function deriveUiFlags(state: AcquisitionState): AcquisitionUiFlags {
  const connected =
    state === "SYSTEM_READY" || state === "SENSOR_READY" || state === "MEASURING";
  return {
    connected,
    canConnect: state === "NO_DEVICE" || state === "DEVICE_LOST" || state === "ERROR",
    canReconnect: state === "NO_DEVICE" || state === "DEVICE_LOST" || state === "ERROR",
    canArm: state === "SYSTEM_READY",
    canDisarm: state === "SENSOR_READY",
    canStart: state === "SENSOR_READY",
    canStop: state === "MEASURING",
  };
}
