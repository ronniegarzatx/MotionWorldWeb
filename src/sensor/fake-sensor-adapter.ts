import { createEmitter } from "./emitter.js";
import { makeMotionSample } from "../model/motion-sample.js";
import { DEFAULT_PERIOD_SECONDS } from "./go-motion-protocol.js";
import type {
  MotionSample,
  RawReport,
  SensorAdapter,
  SensorError,
  SensorStatus,
  TriggerEvent,
  Unsubscribe,
} from "./types.js";

export interface FakeSensorOptions {
  readonly sampleHz?: number;
  /** position (metres) as a function of acquisition-relative seconds. */
  readonly synthetic?: (tSeconds: number) => number;
  readonly deviceLabel?: string;
  readonly now?: () => number;
}

const defaultSynthetic = (t: number): number => 1.5 + 0.5 * Math.sin(2 * Math.PI * 0.2 * t);

/**
 * A SensorAdapter with no hardware. Drives the exact same contract, statuses and
 * events a real adapter would, for state-machine / controller / UI testing and
 * for developing on the Mac. It NEVER validates WebHID.
 */
export class FakeSensorAdapter implements SensorAdapter {
  readonly kind = "fake";

  private _status: SensorStatus = "no_device";
  private _error: SensorError | null = null;
  private readonly _label: string;

  private readonly samples = createEmitter<MotionSample>();
  private readonly triggers = createEmitter<TriggerEvent>();
  private readonly statuses = createEmitter<SensorStatus>();
  private readonly raws = createEmitter<RawReport>();

  private timer: ReturnType<typeof setInterval> | null = null;
  private tickIndex = 0;
  private readonly periodSeconds: number;
  private readonly synthetic: (t: number) => number;
  private readonly now: () => number;

  private pendingConnectError: SensorError | null = null;
  private cancelNextConnect = false;

  constructor(opts: FakeSensorOptions = {}) {
    this._label = opts.deviceLabel ?? "CBR 2 / Go!Motion (fake)";
    this.periodSeconds = opts.sampleHz ? 1 / opts.sampleHz : DEFAULT_PERIOD_SECONDS;
    this.synthetic = opts.synthetic ?? defaultSynthetic;
    this.now = opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  }

  get status(): SensorStatus {
    return this._status;
  }
  get deviceLabel(): string | null {
    return this._status === "no_device" ? null : this._label;
  }
  get lastError(): SensorError | null {
    return this._error;
  }

  private setStatus(s: SensorStatus): void {
    this._status = s;
    this.statuses.emit(s);
  }

  // ── test helpers ──────────────────────────────────────────────────────────
  failNextConnect(error: SensorError): void {
    this.pendingConnectError = error;
  }
  cancelNextConnectSelection(): void {
    this.cancelNextConnect = true;
  }
  emitDeviceLost(): void {
    this.stopTimer();
    this._error = null;
    this.setStatus("device_lost");
  }

  // ── SensorAdapter ─────────────────────────────────────────────────────────
  async connect(): Promise<void> {
    this.setStatus("connecting");
    if (this.cancelNextConnect) {
      this.cancelNextConnect = false;
      this._error = { code: "no_device_selected", message: "user cancelled the chooser" };
      this.setStatus("error");
      return;
    }
    if (this.pendingConnectError) {
      this._error = this.pendingConnectError;
      this.pendingConnectError = null;
      this.setStatus("error");
      return;
    }
    this._error = null;
    this.setStatus("system_ready");
  }

  async reconnect(): Promise<boolean> {
    if (this._status !== "no_device" && this._status !== "device_lost") return false;
    this.setStatus("reconnecting");
    this._error = null;
    this.setStatus("system_ready");
    return true;
  }

  async disconnect(): Promise<void> {
    this.stopTimer();
    this.samples.clear();
    this.triggers.clear();
    this.raws.clear();
    this.setStatus("no_device");
    this.statuses.clear();
  }

  async setReady(ready: boolean): Promise<void> {
    if (ready) {
      if (this._status === "system_ready") this.setStatus("sensor_ready");
    } else {
      this.stopTimer();
      if (this._status === "sensor_ready" || this._status === "measuring") {
        this.setStatus("system_ready");
      }
    }
  }

  async start(): Promise<void> {
    if (this._status !== "sensor_ready") return;
    this.tickIndex = 0;
    this.triggers.emit({ kind: "start", source: "immediate", tMs: this.now() });
    this.setStatus("measuring");
    this.timer = setInterval(() => this.tick(), this.periodSeconds * 1000);
  }

  async stop(): Promise<void> {
    if (this._status !== "measuring") return;
    this.stopTimer();
    this.triggers.emit({ kind: "stop", source: "ui", tMs: this.now() });
    this.setStatus("sensor_ready");
  }

  private tick(): void {
    const t = this.tickIndex * this.periodSeconds;
    const sample = makeMotionSample(t, this.synthetic(t));
    this.tickIndex += 1;
    this.samples.emit(sample);
    this.raws.emit({
      reportId: 0,
      lengthBytes: 8,
      hex: "fa ke 00 00 00 00 00 00",
      tMs: this.now(),
      direction: "in",
    });
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  subscribeSamples(listener: (s: MotionSample) => void): Unsubscribe {
    return this.samples.subscribe(listener);
  }
  subscribeTrigger(listener: (e: TriggerEvent) => void): Unsubscribe {
    return this.triggers.subscribe(listener);
  }
  subscribeStatus(listener: (s: SensorStatus) => void): Unsubscribe {
    return this.statuses.subscribe(listener);
  }
  subscribeRawReport(listener: (r: RawReport) => void): Unsubscribe {
    return this.raws.subscribe(listener);
  }
}
