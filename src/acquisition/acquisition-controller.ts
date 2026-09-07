import {
  type AcquisitionEvent,
  type AcquisitionSnapshot,
  type AcquisitionState,
  type StopReason,
  INITIAL,
  deriveUiFlags,
  reduce,
} from "./acquisition-state.js";
import { createEmitter } from "../sensor/emitter.js";
import { makeMotionRun, type MotionRun } from "../model/motion-run.js";
import { DEFAULT_PERIOD_SECONDS } from "../sensor/go-motion-protocol.js";
import type {
  MotionSample,
  SensorAdapter,
  SensorStatus,
  TriggerEvent,
  Unsubscribe,
} from "../sensor/types.js";

export interface AcquisitionUiState {
  readonly state: AcquisitionState;
  readonly connected: boolean;
  readonly deviceLabel: string | null;
  readonly canConnect: boolean;
  readonly canReconnect: boolean;
  readonly canArm: boolean;
  readonly canDisarm: boolean;
  readonly canStart: boolean;
  readonly canStop: boolean;
  readonly lastStopReason: StopReason;
  readonly lastError: { readonly code: string; readonly message: string } | null;
}

export interface AcquisitionControllerOptions {
  readonly samplerHz?: number;
  readonly log?: (message: string) => void;
}

/**
 * Owns the ONE SensorAdapter for the app's lifetime (spec §4.2). Subscribes to
 * it, drives the pure acquisition state machine, and is the sole authority for
 * acquisition. The UI issues intents here and never touches the adapter or HID.
 */
export class AcquisitionController {
  private snap: AcquisitionSnapshot = INITIAL;
  private readonly uiStates = createEmitter<AcquisitionUiState>();
  private readonly samplesOut = createEmitter<MotionSample>();
  private readonly runsOut = createEmitter<MotionRun>();

  private buffer: MotionSample[] = [];
  private readonly unsubs: Unsubscribe[] = [];
  private readonly samplerHz: number;
  private readonly log: (m: string) => void;

  constructor(
    private readonly adapter: SensorAdapter,
    opts: AcquisitionControllerOptions = {},
  ) {
    this.samplerHz = opts.samplerHz ?? Math.round(1 / DEFAULT_PERIOD_SECONDS);
    this.log = opts.log ?? (() => {});

    this.unsubs.push(
      this.adapter.subscribeStatus((s) => this.onAdapterStatus(s)),
      this.adapter.subscribeTrigger((t) => this.onAdapterTrigger(t)),
      this.adapter.subscribeSamples((sample) => this.onSample(sample)),
    );
  }

  get uiState(): AcquisitionUiState {
    return this.deriveUiState();
  }

  subscribeUiState(listener: (s: AcquisitionUiState) => void): Unsubscribe {
    return this.uiStates.subscribe(listener);
  }
  subscribeSample(listener: (s: MotionSample) => void): Unsubscribe {
    return this.samplesOut.subscribe(listener);
  }
  subscribeRunComplete(listener: (r: MotionRun) => void): Unsubscribe {
    return this.runsOut.subscribe(listener);
  }

  // ── intents (guarded) ─────────────────────────────────────────────────────
  async connect(): Promise<void> {
    if (!this.uiState.canConnect) return this.rejectIntent("connect");
    await this.adapter.connect();
  }
  async reconnect(): Promise<boolean> {
    if (!this.uiState.canReconnect) {
      this.rejectIntent("reconnect");
      return false;
    }
    return this.adapter.reconnect();
  }
  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
  }
  async arm(): Promise<void> {
    if (!this.uiState.canArm) return this.rejectIntent("arm");
    await this.adapter.setReady(true);
  }
  async disarm(): Promise<void> {
    if (!this.uiState.canDisarm) return this.rejectIntent("disarm");
    await this.adapter.setReady(false);
  }
  async start(): Promise<void> {
    if (!this.uiState.canStart) return this.rejectIntent("start");
    await this.adapter.start();
  }
  async stop(): Promise<void> {
    if (!this.uiState.canStop) return this.rejectIntent("stop");
    await this.adapter.stop();
  }

  dispose(): void {
    for (const u of this.unsubs.splice(0)) u();
  }

  private rejectIntent(name: string): void {
    this.log(`intent "${name}" ignored in state ${this.snap.state}`);
  }

  // ── adapter reactions ─────────────────────────────────────────────────────
  private onAdapterStatus(s: SensorStatus): void {
    switch (s) {
      case "system_ready":
        if (this.snap.state === "SENSOR_READY") this.apply({ type: "disarm" });
        else if (this.snap.state === "MEASURING") this.apply({ type: "stop" });
        else this.apply({ type: "connected" });
        break;
      case "sensor_ready":
        this.apply({ type: "arm" });
        break;
      case "measuring":
        this.apply({ type: "trigger", kind: "start" });
        break;
      case "device_lost":
        this.apply({ type: "lost" });
        break;
      case "error":
        this.apply({
          type: "error",
          code: this.adapter.lastError?.code ?? "unknown",
          message: this.adapter.lastError?.message ?? "unknown error",
        });
        break;
      case "no_device":
        this.apply({ type: "disconnected" });
        break;
      case "connecting":
      case "reconnecting":
        break;
    }
  }

  private onAdapterTrigger(t: TriggerEvent): void {
    this.apply({ type: "trigger", kind: t.kind });
  }

  private onSample(sample: MotionSample): void {
    if (this.snap.state !== "MEASURING") return;
    this.buffer.push(sample);
    this.samplesOut.emit(sample);
  }

  private apply(event: AcquisitionEvent): void {
    const prev = this.snap;
    const next = reduce(prev, event);
    if (next === prev) return;

    const wasMeasuring = prev.state === "MEASURING";
    const nowMeasuring = next.state === "MEASURING";
    this.snap = next;

    if (!wasMeasuring && nowMeasuring) {
      this.buffer = [];
    }
    if (wasMeasuring && !nowMeasuring) {
      this.finishRun();
    }

    this.uiStates.emit(this.deriveUiState());
  }

  private finishRun(): void {
    const run = makeMotionRun({
      samples: this.buffer,
      samplerHz: this.samplerHz,
      source: this.adapter.kind === "fake" ? "fake" : "sensor",
      deviceLabel: this.adapter.deviceLabel,
    });
    this.buffer = [];
    this.runsOut.emit(run);
  }

  private deriveUiState(): AcquisitionUiState {
    const flags = deriveUiFlags(this.snap.state);
    return {
      state: this.snap.state,
      deviceLabel: this.adapter.deviceLabel,
      lastStopReason: this.snap.lastStopReason,
      lastError: this.snap.error,
      ...flags,
    };
  }
}
