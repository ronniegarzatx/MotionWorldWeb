import type {
  HidConnectionEventLike,
  HidDeviceLike,
  HidInputReportEventLike,
  HidLike,
} from "../../src/sensor/hid.js";

/**
 * A scriptable in-memory HID device that speaks just enough of the Skip/Cyclops
 * protocol for adapter tests: it auto-answers INIT / STATUS / default commands
 * and lets the test push measurement packets and flip the TRIGGERED bit.
 */
export class FakeHidDevice implements HidDeviceLike {
  productName = "Go!Motion";
  vendorId = 0x08f7;
  productId = 0x0004;
  opened = false;
  collections: HidDeviceLike["collections"] = [
    {
      usagePage: 0xff00,
      usage: 0x01,
      inputReports: [{ reportId: 0, items: [{ reportCount: 8, reportSize: 8 }] }],
      outputReports: [{ reportId: 0, items: [{ reportCount: 8, reportSize: 8 }] }],
      featureReports: [],
    },
  ];

  readonly sentReports: Uint8Array[] = [];
  readonly sentFeatureReports: Uint8Array[] = [];

  triggered = false;
  dataRunSignature = 0;
  failSendReport = false;
  failSendFeatureReport = false;
  autoRespond = true;

  private listeners = new Set<(e: HidInputReportEventLike) => void>();

  async open(): Promise<void> {
    this.opened = true;
  }
  async close(): Promise<void> {
    this.opened = false;
  }

  async sendReport(_reportId: number, data: BufferSource): Promise<void> {
    if (this.failSendReport) throw new Error("sendReport not allowed");
    const bytes = toBytes(data);
    this.sentReports.push(bytes);
    if (this.autoRespond) this.autoAnswer(bytes);
  }

  async sendFeatureReport(_reportId: number, data: BufferSource): Promise<void> {
    if (this.failSendFeatureReport) throw new Error("sendFeatureReport not allowed");
    const bytes = toBytes(data);
    this.sentFeatureReports.push(bytes);
    if (this.autoRespond) this.autoAnswer(bytes);
  }

  addEventListener(_t: "inputreport", l: (e: HidInputReportEventLike) => void): void {
    this.listeners.add(l);
  }
  removeEventListener(_t: "inputreport", l: (e: HidInputReportEventLike) => void): void {
    this.listeners.delete(l);
  }

  /** Push a raw inbound report (measurement or hand-built response). */
  emitInput(bytes: Uint8Array, reportId = 0): void {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const event: HidInputReportEventLike = { device: this, reportId, data: view };
    for (const l of [...this.listeners]) l(event);
  }

  /** A Cyclops real-time distance measurement packet for `microns`. */
  emitMeasurement(microns: number, counter = 0): void {
    const b = new Uint8Array(8);
    b[0] = 0x01; // nMeasurementsInPacket, top bits 0 => measurement stream
    b[1] = counter & 0xff;
    new DataView(b.buffer).setInt32(2, microns, true);
    b[6] = 0; // distance
    this.emitInput(b);
  }

  private autoAnswer(cmd: Uint8Array): void {
    const id = cmd[0];
    if (id === 0x1a) {
      // INIT response: header 0x9A
      this.emitInput(Uint8Array.of(0x9a, 0x1a, 0x00, 0, 0, 0, 0, 0));
      return;
    }
    if (id === 0x30) {
      // GET_MEASUREMENT_STATUS: header 0x5F, cmd 0x30, then 6 payload bytes
      const flags = 0x80 | (this.triggered ? 0x20 : 0x00);
      this.emitInput(
        Uint8Array.of(0x5f, 0x30, flags, 0x01, 0x00, 0x00, this.dataRunSignature & 0xff, 0x00),
      );
      return;
    }
    if (id === 0x10) {
      // GET_STATUS: header + cmd + status + 4 BCD version bytes + reserved
      this.emitInput(Uint8Array.of(0x5e, 0x10, 0x00, 0x12, 0x01, 0x34, 0x02, 0x00));
      return;
    }
    if (id === 0x18 || id === 0x19 || id === 0x1b) {
      // default OK response: header 0x5A, cmd echo, status 0
      this.emitInput(Uint8Array.of(0x5a, id, 0x00, 0, 0, 0, 0, 0));
      return;
    }
  }
}

export class FakeHid implements HidLike {
  requestResult: FakeHidDevice[] | Error = [];
  grantedDevices: FakeHidDevice[] = [];
  private connectionListeners = new Set<(e: HidConnectionEventLike) => void>();

  async getDevices(): Promise<HidDeviceLike[]> {
    return this.grantedDevices;
  }
  async requestDevice(): Promise<HidDeviceLike[]> {
    if (this.requestResult instanceof Error) throw this.requestResult;
    return this.requestResult;
  }
  addEventListener(
    _t: "connect" | "disconnect",
    l: (e: HidConnectionEventLike) => void,
  ): void {
    this.connectionListeners.add(l);
  }
  removeEventListener(
    _t: "connect" | "disconnect",
    l: (e: HidConnectionEventLike) => void,
  ): void {
    this.connectionListeners.delete(l);
  }
  emitDisconnect(device: HidDeviceLike): void {
    for (const l of [...this.connectionListeners]) l({ device });
  }
}

function toBytes(data: BufferSource): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  const view = data as ArrayBufferView;
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
}

export const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));
