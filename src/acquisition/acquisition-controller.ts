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
  /** adapter is opening / reopening a device (connect or silent reconnect). */
  readonly connecting: boolean;
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
  private lastRun: MotionRun | null = null;
  private adapterConnecting = false;
  private readonly unsubs: Unsubscribe[] = [];
  private readonly samplerHz: number;
  private readonly log: (m: string) => void;

  constructor(
    private readonly adapter: SensorAdapter,
    opts: AcquisitionControllerOptions = {},
  ) {
    // 25 Hz = the native Motion World / Go!Motion baseline (0.040 s period).
    this.samplerHz = opts.samplerHz ?? 25;
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

  /** Frozen snapshot of the samples collected so far in the active run (empty when not measuring). */
  currentRunSamples(): readonly MotionSample[] {
    return Object.freeze(this.buffer.slice());
  }

  /** The most recent completed run, or null. */
  lastCompletedRun(): MotionRun | null {
    return this.lastRun;
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

  /**
   * Stop an in-progress run because the teacher navigated away from a tool. The
   * connection stays open and the sensor stays armed; the partial run is frozen
   * and kept. No-op if not measuring.
   */
  async stopForNavigation(): Promise<void> {
    if (this.snap.state !== "MEASURING") return;
    this.apply({ type: "stop", reason: "navigation" });
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
    const connecting = s === "connecting" || s === "reconnecting";
    const flagChanged = connecting !== this.adapterConnecting;
    this.adapterConnecting = connecting;

    const emitted = this.applyForStatus(s);

    // The "connecting" flag drives the bar's "Connecting…" copy on its own — make
    // sure a flag flip is visible even when no machine transition emitted.
    if (flagChanged && !emitted) {
      this.uiStates.emit(this.deriveUiState());
    }
  }

  private applyForStatus(s: SensorStatus): boolean {
    switch (s) {
      case "system_ready":
        if (this.snap.state === "SENSOR_READY") return this.apply({ type: "disarm" });
        if (this.snap.state === "MEASURING") return this.apply({ type: "stop" });
        return this.apply({ type: "connected" });
      case "sensor_ready":
        return this.apply({ type: "arm" });
      case "measuring":
        return this.apply({ type: "trigger", kind: "start" });
      case "device_lost":
        return this.apply({ type: "lost" });
      case "error":
        return this.apply({
          type: "error",
          code: this.adapter.lastError?.code ?? "unknown",
          message: this.adapter.lastError?.message ?? "unknown error",
        });
      case "no_device":
        return this.apply({ type: "disconnected" });
      case "connecting":
      case "reconnecting":
        return false;
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

  /** Returns true if a uiState change was emitted. */
  private apply(event: AcquisitionEvent): boolean {
    const prev = this.snap;
    const next = reduce(prev, event);
    if (next === prev) return false;

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
    return true;
  }

  private finishRun(): void {
    const run = makeMotionRun({
      samples: this.buffer,
      samplerHz: this.samplerHz,
      source: this.adapter.kind === "fake" ? "fake" : "sensor",
      deviceLabel: this.adapter.deviceLabel,
    });
    this.buffer = [];
    this.lastRun = run;
    this.runsOut.emit(run);
  }

  private deriveUiState(): AcquisitionUiState {
    const flags = deriveUiFlags(this.snap.state);
    return {
      state: this.snap.state,
      connecting: this.adapterConnecting,
      deviceLabel: this.adapter.deviceLabel,
      lastStopReason: this.snap.lastStopReason,
      lastError: this.snap.error,
      ...flags,
    };
  }
}
