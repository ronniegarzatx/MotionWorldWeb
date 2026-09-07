import type { MotionSample } from "../model/motion-sample.js";

export type { MotionSample };

/**
 * Transport-agnostic sensor status. Used by every SensorAdapter implementation
 * (real WebHID and Fake). The AcquisitionController maps these onto its own
 * richer AcquisitionState machine.
 */
export type SensorStatus =
  | "no_device" // nothing granted / not opened
  | "connecting" // requestDevice / open / init in flight
  | "reconnecting" // getDevices() grant found, reopen in flight
  | "system_ready" // opened + init ok, device identified, not armed
  | "sensor_ready" // period set + armed, waiting for a trigger
  | "measuring" // streaming samples
  | "device_lost" // was connected, now gone
  | "error"; // see lastError

export interface TriggerEvent {
  readonly kind: "start" | "stop";
  readonly source: "button" | "ui" | "immediate";
  /** performance.now() (ms) at detection — diagnostic only. */
  readonly tMs: number;
}

export type SensorErrorCode =
  | "unsupported_api"
  | "permission_denied"
  | "no_device_selected"
  | "open_failed"
  | "protocol_init_failed"
  | "send_report_unsupported"
  | "device_disconnected"
  | "policy_blocked"
  | "unknown";

export interface SensorError {
  readonly code: SensorErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

/** One raw inbound HID report, captured for the diagnostic ring (spec §11). */
export interface RawReport {
  readonly reportId: number;
  readonly lengthBytes: number;
  readonly hex: string;
  /** performance.now() (ms) at arrival. */
  readonly tMs: number;
  readonly direction: "in" | "out";
}

export type Unsubscribe = () => void;

export interface SensorAdapter {
  readonly kind: string;
  readonly status: SensorStatus;
  readonly deviceLabel: string | null;
  readonly lastError: SensorError | null;

  /** User-gesture entry point: requestDevice + open + protocol init. */
  connect(): Promise<void>;
  /** Silent path via getDevices(); resolves false when nothing to reconnect. */
  reconnect(): Promise<boolean>;
  disconnect(): Promise<void>;

  /** true: configure + arm (-> sensor_ready). false: disarm (-> system_ready). */
  setReady(ready: boolean): Promise<void>;
  /** UI Start: begin measuring immediately. */
  start(): Promise<void>;
  /** UI Stop: end measuring, re-arm for the physical button. */
  stop(): Promise<void>;

  subscribeSamples(listener: (s: MotionSample) => void): Unsubscribe;
  subscribeTrigger(listener: (e: TriggerEvent) => void): Unsubscribe;
  subscribeStatus(listener: (s: SensorStatus) => void): Unsubscribe;
  subscribeRawReport(listener: (r: RawReport) => void): Unsubscribe;
}
