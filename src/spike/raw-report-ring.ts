import type { RawReport } from "../sensor/types.js";
import { toHex } from "../sensor/go-motion-protocol.js";

export interface RawReportInput {
  readonly reportId: number;
  readonly bytes: Uint8Array;
  readonly tMs: number;
  readonly direction?: "in" | "out";
}

/**
 * Bounded ring of recent HID reports for the diagnostic inspector (spec §11).
 * Developer diagnostics only — not a V1 product feature. Memory is capped;
 * PAUSE makes push a no-op.
 */
export class RawReportRing {
  private buf: RawReport[] = [];
  paused = false;

  constructor(private readonly max = 200) {}

  push(input: RawReportInput): void {
    if (this.paused) return;
    this.buf.push({
      reportId: input.reportId,
      lengthBytes: input.bytes.length,
      hex: toHex(input.bytes),
      tMs: input.tMs,
      direction: input.direction ?? "in",
    });
    if (this.buf.length > this.max) {
      this.buf.splice(0, this.buf.length - this.max);
    }
  }

  clear(): void {
    this.buf = [];
  }

  /** Newest first. */
  snapshot(): readonly RawReport[] {
    return this.buf.slice().reverse();
  }

  get size(): number {
    return this.buf.length;
  }

  get capacity(): number {
    return this.max;
  }
}
