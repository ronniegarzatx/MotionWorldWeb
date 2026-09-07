/**
 * GoMotionWebHIDAdapter — THE ONLY production module that performs HID I/O and
 * the only place (besides its pure helpers) that knows CBR 2 / Go!Motion report
 * bytes. Implements the transport-agnostic SensorAdapter.
 *
 * Pairs with:
 *   - hid.ts               narrow WebHID surface
 *   - go-motion-protocol.ts pure encoders/decoders (byte-fixture tested)
 *   - hid-diagnostics.ts   pure descriptor inspection
 */
import { createEmitter } from "./emitter.js";
import { describeDevice, formatDeviceReport } from "./hid-diagnostics.js";
import { getHid, type HidDeviceLike, type HidInputReportEventLike, type HidLike } from "./hid.js";
import { makeMotionSample } from "../model/motion-sample.js";
import {
  DEFAULT_PERIOD_SECONDS,
  ProtocolError,
  classifyReport,
  decodeMeasurement,
  decodeMeasurementStatus,
  encodeGetMeasurementStatus,
  encodeGetStatus,
  encodeInit,
  encodeSetPeriod,
  encodeStart,
  encodeStop,
  toHex,
} from "./go-motion-protocol.js";
import type {
  MotionSample,
  RawReport,
  SensorAdapter,
  SensorError,
  SensorErrorCode,
  SensorStatus,
  TriggerEvent,
  Unsubscribe,
} from "./types.js";

const VERNIER_VID = 0x08f7;
const GO_MOTION_PID = 0x0004; // "Cyclops". evidence: GVernierUSB.h:38

export interface GoMotionWebHIDOptions {
  /** DEVELOPMENT ONLY: widen the chooser to identify an unknown device. */
  readonly broadChooser?: boolean;
  readonly periodSeconds?: number;
  readonly statusPollMs?: number;
  readonly commandTimeoutMs?: number;
  readonly lostAfterFailedPolls?: number;
  readonly now?: () => number;
  readonly setTimeoutFn?: typeof setTimeout;
  readonly clearTimeoutFn?: typeof clearTimeout;
  readonly setIntervalFn?: typeof setInterval;
  readonly clearIntervalFn?: typeof clearInterval;
  readonly onLog?: (message: string) => void;
  readonly onDeviceReport?: (text: string) => void;
}

interface PendingCommand {
  readonly matches: (bytes: Uint8Array) => boolean;
  resolve: (bytes: Uint8Array) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class GoMotionWebHIDAdapter implements SensorAdapter {
  readonly kind = "go-motion-webhid";

  private readonly hid: HidLike;
  private device: HidDeviceLike | null = null;

  private _status: SensorStatus = "no_device";
  private _error: SensorError | null = null;

  private readonly samples = createEmitter<MotionSample>();
  private readonly triggers = createEmitter<TriggerEvent>();
  private readonly statuses = createEmitter<SensorStatus>();
  private readonly raws = createEmitter<RawReport>();

  private readonly periodSeconds: number;
  private readonly statusPollMs: number;
  private readonly commandTimeoutMs: number;
  private readonly lostAfterFailedPolls: number;
  private readonly now: () => number;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private readonly log: (m: string) => void;
  private readonly onDeviceReport: (text: string) => void;
  private readonly broadChooser: boolean;

  private pending: PendingCommand | null = null;
  private inFlightWrite: Promise<void> = Promise.resolve();
  private writeMethod: "report" | "feature" | null = null;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private consecutivePollFailures = 0;
  private lastTriggered = false;
  private tickIndex = 0;
  private pendingTriggerSource: TriggerEvent["source"] = "button";

  private readonly boundInputReport = (e: HidInputReportEventLike) => this.onInputReport(e);
  private readonly boundDisconnect = (e: { device: HidDeviceLike }) => {
    if (e.device === this.device) this.handleLost("hid disconnect event");
  };

  constructor(hid: HidLike | null = getHid(), opts: GoMotionWebHIDOptions = {}) {
    if (!hid) {
      // Constructing without WebHID is allowed; connect() reports the error.
      this.hid = {
        __stub: true,
        getDevices: async () => [],
        requestDevice: async () => {
          throw new DOMExceptionLike("WebHID unavailable", "NotSupportedError");
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as HidLike;
      this._error = { code: "unsupported_api", message: "WebHID is not available in this browser" };
    } else {
      this.hid = hid;
    }
    this.broadChooser = opts.broadChooser ?? false;
    this.periodSeconds = opts.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
    this.statusPollMs = opts.statusPollMs ?? 100;
    this.commandTimeoutMs = opts.commandTimeoutMs ?? 1500;
    this.lostAfterFailedPolls = opts.lostAfterFailedPolls ?? 10;
    this.now = opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    // Browser-native timer functions are WebIDL methods bound to Window: calling
    // them with any other receiver (e.g. as `this.setTimeoutFn(...)` where `this`
    // is the adapter) throws `TypeError: Illegal invocation` in real Chromium.
    // Bind the platform globals to `globalThis` so the receiver is always the
    // global. Node/jsdom don't enforce this, which is why unit tests missed it.
    this.setTimeoutFn = opts.setTimeoutFn ?? globalThis.setTimeout.bind(globalThis);
    this.clearTimeoutFn = opts.clearTimeoutFn ?? globalThis.clearTimeout.bind(globalThis);
    this.setIntervalFn = opts.setIntervalFn ?? globalThis.setInterval.bind(globalThis);
    this.clearIntervalFn = opts.clearIntervalFn ?? globalThis.clearInterval.bind(globalThis);
    this.log = opts.onLog ?? (() => {});
    this.onDeviceReport = opts.onDeviceReport ?? (() => {});

    this.hid.addEventListener("disconnect", this.boundDisconnect);
  }

  get status(): SensorStatus {
    return this._status;
  }
  get deviceLabel(): string | null {
    if (!this.device) return null;
    return this.device.productName || "CBR 2 / Go!Motion";
  }
  get lastError(): SensorError | null {
    return this._error;
  }

  private setStatus(s: SensorStatus): void {
    this._status = s;
    this.statuses.emit(s);
  }

  private fail(code: SensorErrorCode, message: string, cause?: unknown): void {
    this._error = cause === undefined ? { code, message } : { code, message, cause };
    this.log(`error [${code}] ${message}`);
    this.setStatus("error");
  }

  // ── connect / reconnect / disconnect ──────────────────────────────────────
  async connect(): Promise<void> {
    if (!hasRealHid(this.hid)) {
      this.fail("unsupported_api", "WebHID is not available in this browser");
      return;
    }
    this.setStatus("connecting");
    let devices: HidDeviceLike[];
    try {
      const filters = this.broadChooser
        ? [{ vendorId: VERNIER_VID }]
        : [{ vendorId: VERNIER_VID, productId: GO_MOTION_PID }];
      devices = await this.hid.requestDevice({ filters });
    } catch (err) {
      this.classifyRequestError(err);
      return;
    }
    const device = devices[0];
    if (!device) {
      this.fail("no_device_selected", "no device chosen in the browser picker");
      return;
    }
    await this.attachAndInit(device, "connect");
  }

  async reconnect(): Promise<boolean> {
    if (!hasRealHid(this.hid)) return false;
    let devices: HidDeviceLike[];
    try {
      devices = await this.hid.getDevices();
    } catch (err) {
      this.log(`getDevices() failed: ${String(err)}`);
      return false;
    }
    const device = devices.find(
      (d) => d.vendorId === VERNIER_VID && (this.broadChooser || d.productId === GO_MOTION_PID),
    );
    if (!device) return false;
    this.setStatus("reconnecting");
    await this.attachAndInit(device, "reconnect");
    return this._status !== "error";
  }

  private async attachAndInit(device: HidDeviceLike, via: string): Promise<void> {
    this.device = device;
    this.writeMethod = null;
    try {
      if (!device.opened) await device.open();
    } catch (err) {
      this.fail("open_failed", `could not open the device (${via}): ${String(err)}`, err);
      return;
    }
    device.addEventListener("inputreport", this.boundInputReport);

    const report = describeDevice(device);
    const text = formatDeviceReport(report);
    this.onDeviceReport(text);
    this.log(`device opened (${via}) — ${this.deviceLabel}`);
    if (!report.hasAnyOutputReport) {
      this.log("WARNING: device declares no output report — sendReport may be refused");
    }

    try {
      await this.sendCommand(encodeInit(), "init");
    } catch (err) {
      if (err instanceof SendUnsupportedError) {
        this.fail(
          "send_report_unsupported",
          "the browser could not send an output or feature report to this device",
          err,
        );
        return;
      }
      this.fail("protocol_init_failed", `INIT failed: ${String(err)}`, err);
      return;
    }

    // best-effort version read; not fatal
    try {
      const resp = await this.sendCommand(encodeGetStatus(), "cmd", 0x10);
      if (resp.length >= 7) {
        this.log(
          `firmware master v${bcd(resp[4]!)}.${bcd(resp[3]!)} slave v${bcd(resp[6]!)}.${bcd(resp[5]!)}`,
        );
      }
    } catch {
      /* ignore */
    }

    this._error = null;
    this.setStatus("system_ready");
  }

  async disconnect(): Promise<void> {
    this.stopPoll();
    if (this.device) {
      try {
        await this.rawWrite(encodeStop());
      } catch {
        /* ignore */
      }
      this.device.removeEventListener("inputreport", this.boundInputReport);
      try {
        await this.device.close();
      } catch {
        /* ignore */
      }
    }
    this.device = null;
    this.rejectPending(new Error("disconnected"));
    this.setStatus("no_device");
  }

  // ── arm / start / stop ───────────────────────────────────────────────────
  async setReady(ready: boolean): Promise<void> {
    if (!this.device) return;
    if (ready) {
      if (this._status !== "system_ready" && this._status !== "sensor_ready") return;
      await this.sendCommand(encodeSetPeriod(this.periodSeconds), "cmd", 0x1b);
      await this.sendCommand(encodeStart({ trigger: "button", measType: "distance" }), "cmd", 0x18);
      this.pendingTriggerSource = "button";
      this.lastTriggered = false;
      this.startPoll();
      this.setStatus("sensor_ready");
    } else {
      await this.safeStop();
      this.stopPoll();
      if (this._status === "sensor_ready" || this._status === "measuring") {
        this.setStatus("system_ready");
      }
    }
  }

  async start(): Promise<void> {
    if (!this.device || this._status !== "sensor_ready") return;
    await this.safeStop();
    await this.sendCommand(encodeStart({ trigger: "immediate", measType: "distance" }), "cmd", 0x18);
    this.pendingTriggerSource = "immediate";
    this.startPoll();
  }

  async stop(): Promise<void> {
    if (!this.device || this._status !== "measuring") return;
    await this.safeStop();
    // re-arm for the physical blue button, per the native state model
    await this.sendCommand(encodeStart({ trigger: "button", measType: "distance" }), "cmd", 0x18);
    this.pendingTriggerSource = "button";
  }

  private async safeStop(): Promise<void> {
    try {
      await this.sendCommand(encodeStop(), "cmd", 0x19);
    } catch (err) {
      this.log(`STOP failed (continuing): ${String(err)}`);
    }
  }

  // ── status polling ───────────────────────────────────────────────────────
  private startPoll(): void {
    if (this.pollTimer !== null) return;
    this.consecutivePollFailures = 0;
    this.pollTimer = this.setIntervalFn(() => {
      void this.pollOnce();
    }, this.statusPollMs);
  }

  private stopPoll(): void {
    if (this.pollTimer !== null) {
      this.clearIntervalFn(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollOnce(): Promise<void> {
    if (!this.device || this.pollTimer === null) return;
    let payload: Uint8Array;
    try {
      payload = await this.sendCommand(encodeGetMeasurementStatus(), "cmd", 0x30);
    } catch {
      this.consecutivePollFailures += 1;
      if (this.consecutivePollFailures >= this.lostAfterFailedPolls) {
        this.handleLost("status poll stalled");
      }
      return;
    }
    this.consecutivePollFailures = 0;
    let status;
    try {
      status = decodeMeasurementStatus(payload);
    } catch {
      return;
    }
    if (status.triggered && !this.lastTriggered) {
      this.tickIndex = 0;
      this.lastTriggered = true;
      this.triggers.emit({
        kind: "start",
        source: this.pendingTriggerSource,
        tMs: this.now(),
      });
      this.setStatus("measuring");
    } else if (!status.triggered && this.lastTriggered) {
      this.lastTriggered = false;
      this.triggers.emit({ kind: "stop", source: "button", tMs: this.now() });
      if (this._status === "measuring") this.setStatus("sensor_ready");
    }
  }

  private handleLost(reason: string): void {
    this.log(`device lost — ${reason}`);
    this.stopPoll();
    this.rejectPending(new Error("device lost"));
    if (this.device) {
      this.device.removeEventListener("inputreport", this.boundInputReport);
      this.device = null;
    }
    this.setStatus("device_lost");
  }

  // ── command / response plumbing ──────────────────────────────────────────
  private sendCommand(
    bytes: Uint8Array,
    kind: "init" | "cmd",
    cmdId?: number,
  ): Promise<Uint8Array> {
    // serialize writes so responses correlate unambiguously
    const run = this.inFlightWrite.then(() => this.sendCommandInner(bytes, kind, cmdId));
    this.inFlightWrite = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async sendCommandInner(
    bytes: Uint8Array,
    kind: "init" | "cmd",
    cmdId?: number,
  ): Promise<Uint8Array> {
    if (!this.device) throw new Error("adapter not connected");
    const responsePromise = new Promise<Uint8Array>((resolve, reject) => {
      const timer = this.setTimeoutFn(() => {
        if (this.pending) {
          this.pending = null;
          reject(new Error(`timeout waiting for response to ${toHex(bytes)}`));
        }
      }, this.commandTimeoutMs);
      this.pending = {
        matches: (resp) => {
          const c = classifyReport(resp);
          if (kind === "init") return c.kind === "init_response";
          return c.kind === "cmd_response" && (cmdId === undefined || c.cmd === cmdId);
        },
        resolve,
        reject,
        timer,
      };
    });

    try {
      await this.rawWrite(bytes);
    } catch (err) {
      // never leave the pending waiter (and its timeout) dangling
      responsePromise.catch(() => {});
      this.rejectPending(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
    return responsePromise;
  }

  private async rawWrite(bytes: Uint8Array): Promise<void> {
    if (!this.device) throw new Error("no device");
    const payload = bytes.slice();
    if (this.writeMethod === "feature") {
      await this.device.sendFeatureReport(0, payload);
      this.pushRaw(0, payload, "out");
      return;
    }
    try {
      await this.device.sendReport(0, payload);
      this.writeMethod = "report";
      this.pushRaw(0, payload, "out");
      return;
    } catch (reportErr) {
      try {
        await this.device.sendFeatureReport(0, payload);
        this.writeMethod = "feature";
        this.log("fell back to sendFeatureReport()");
        this.pushRaw(0, payload, "out");
        return;
      } catch (featureErr) {
        throw new SendUnsupportedError(
          `sendReport failed (${String(reportErr)}); sendFeatureReport failed (${String(featureErr)})`,
        );
      }
    }
  }

  private rejectPending(err: Error): void {
    if (this.pending) {
      this.clearTimeoutFn(this.pending.timer);
      const p = this.pending;
      this.pending = null;
      p.reject(err);
    }
  }

  private onInputReport(event: HidInputReportEventLike): void {
    const bytes = new Uint8Array(
      event.data.buffer,
      event.data.byteOffset,
      event.data.byteLength,
    ).slice();
    this.pushRaw(event.reportId, bytes, "in");

    const cls = classifyReport(bytes);
    if (cls.kind === "measurement") {
      this.handleMeasurement(bytes);
      return;
    }
    if (this.pending && this.pending.matches(bytes)) {
      this.clearTimeoutFn(this.pending.timer);
      const p = this.pending;
      this.pending = null;
      // cmd response payload = bytes after {header, cmd}; init payload after header
      const payload = cls.kind === "init_response" ? bytes.subarray(1) : bytes.subarray(2);
      p.resolve(payload);
    }
  }

  private handleMeasurement(bytes: Uint8Array): void {
    let m;
    try {
      m = decodeMeasurement(bytes);
    } catch (err) {
      if (err instanceof ProtocolError) {
        this.log(`bad measurement packet: ${toHex(bytes)}`);
        return;
      }
      throw err;
    }
    const sample = makeMotionSample(this.tickIndex * this.periodSeconds, m.positionMeters);
    this.tickIndex += 1;
    this.samples.emit(sample);
  }

  private pushRaw(reportId: number, bytes: Uint8Array, direction: "in" | "out"): void {
    this.raws.emit({
      reportId,
      lengthBytes: bytes.length,
      hex: toHex(bytes),
      tMs: this.now(),
      direction,
    });
  }

  private classifyRequestError(err: unknown): void {
    const name = (err as { name?: string })?.name ?? "";
    const message = (err as { message?: string })?.message ?? String(err);
    if (name === "NotFoundError") {
      this.fail("no_device_selected", "no device chosen in the browser picker", err);
    } else if (name === "SecurityError" || /policy|blocked|permission/i.test(message)) {
      this.fail(
        "policy_blocked",
        "WebHID access was blocked (browser or organisation policy)",
        err,
      );
    } else if (name === "NotSupportedError") {
      this.fail("unsupported_api", "WebHID is not available in this browser", err);
    } else {
      this.fail("unknown", `requestDevice failed: ${message}`, err);
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

class SendUnsupportedError extends Error {
  override readonly name = "SendUnsupportedError";
}

class DOMExceptionLike extends Error {
  constructor(
    message: string,
    override readonly name: string,
  ) {
    super(message);
  }
}

function bcd(byte: number): number {
  return (byte >> 4) * 10 + (byte & 0x0f);
}

function hasRealHid(hid: HidLike): boolean {
  // the internal stub used when WebHID is absent has a getDevices that returns []
  // synchronously-resolved and a requestDevice that throws NotSupportedError; the
  // real object comes from navigator.hid. We detect the stub by identity marker.
  return !(hid as { __stub?: boolean }).__stub;
}
