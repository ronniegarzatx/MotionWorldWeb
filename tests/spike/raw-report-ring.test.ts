import { describe, expect, it } from "vitest";
import { RawReportRing } from "../../src/spike/raw-report-ring.js";

describe("RawReportRing", () => {
  it("stores hex + length, newest first", () => {
    const ring = new RawReportRing(10);
    ring.push({ reportId: 0, bytes: Uint8Array.of(0x00, 0x05, 0x8b), tMs: 1 });
    ring.push({ reportId: 0, bytes: Uint8Array.of(0xff), tMs: 2 });
    const snap = ring.snapshot();
    expect(snap[0]).toMatchObject({ hex: "ff", lengthBytes: 1, tMs: 2 });
    expect(snap[1]).toMatchObject({ hex: "00 05 8b", lengthBytes: 3 });
  });

  it("is memory-bounded", () => {
    const ring = new RawReportRing(200);
    for (let i = 0; i < 10_000; i++) {
      ring.push({ reportId: 0, bytes: Uint8Array.of(i & 0xff), tMs: i });
    }
    expect(ring.size).toBe(200);
    expect(ring.snapshot().length).toBe(200);
  });

  it("paused makes push a no-op", () => {
    const ring = new RawReportRing();
    ring.paused = true;
    ring.push({ reportId: 0, bytes: Uint8Array.of(1), tMs: 1 });
    expect(ring.size).toBe(0);
  });

  it("clear empties", () => {
    const ring = new RawReportRing();
    ring.push({ reportId: 0, bytes: Uint8Array.of(1), tMs: 1 });
    ring.clear();
    expect(ring.size).toBe(0);
  });
});
