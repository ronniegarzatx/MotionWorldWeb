/**
 * Pure HID descriptor diagnostics (spec §10). Turns a HIDDevice's metadata into
 * a structured object and copy-friendly text — never a raw object dump.
 *
 * This is the most valuable artifact if the first physical connection sees the
 * sensor but sampling does not work.
 */
import type { HidDeviceLike, HidReportInfoLike } from "./hid.js";

export interface ReportSummary {
  readonly reportId: number;
  readonly byteLength: number | null;
  readonly itemSummary: string;
}

export interface CollectionSummary {
  readonly usagePage: number | null;
  readonly usage: number | null;
  readonly inputReports: readonly ReportSummary[];
  readonly outputReports: readonly ReportSummary[];
  readonly featureReports: readonly ReportSummary[];
}

export interface DeviceReport {
  readonly productName: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly opened: boolean;
  readonly collectionCount: number;
  readonly collections: readonly CollectionSummary[];
  /** True when no collection declares an output report — the predicted blocker. */
  readonly hasAnyOutputReport: boolean;
}

function hex(n: number, width = 2): string {
  return `0x${n.toString(16).toUpperCase().padStart(width, "0")}`;
}

function summariseReports(
  reports: readonly HidReportInfoLike[] | undefined,
): ReportSummary[] {
  if (!reports) return [];
  return reports.map((r) => {
    let bits = 0;
    const parts: string[] = [];
    for (const item of r.items ?? []) {
      const count = item.reportCount ?? 0;
      const size = item.reportSize ?? 0;
      bits += count * size;
      if (count && size) parts.push(`${count}x${size}bit`);
    }
    return {
      reportId: r.reportId ?? 0,
      byteLength: bits > 0 ? Math.ceil(bits / 8) : null,
      itemSummary: parts.length ? parts.join(", ") : "(no item metadata)",
    };
  });
}

export function describeDevice(device: HidDeviceLike): DeviceReport {
  const collections: CollectionSummary[] = device.collections.map((c) => ({
    usagePage: c.usagePage ?? null,
    usage: c.usage ?? null,
    inputReports: summariseReports(c.inputReports),
    outputReports: summariseReports(c.outputReports),
    featureReports: summariseReports(c.featureReports),
  }));

  return {
    productName: device.productName || "(no productName)",
    vendorId: device.vendorId,
    productId: device.productId,
    opened: device.opened,
    collectionCount: collections.length,
    collections,
    hasAnyOutputReport: collections.some((c) => c.outputReports.length > 0),
  };
}

function formatReportLine(label: string, reports: readonly ReportSummary[]): string {
  if (reports.length === 0) return `      ${label}: (none)`;
  const parts = reports.map(
    (r) =>
      `id ${r.reportId}` +
      (r.byteLength !== null ? ` (${r.byteLength} bytes)` : "") +
      ` [${r.itemSummary}]`,
  );
  return `      ${label}: ${parts.join("  |  ")}`;
}

export function formatDeviceReport(report: DeviceReport): string {
  const lines: string[] = [
    `productName : ${report.productName}`,
    `vendorId    : ${hex(report.vendorId, 4)} (${report.vendorId})`,
    `productId   : ${hex(report.productId, 4)} (${report.productId})`,
    `opened      : ${report.opened}`,
    `collections : ${report.collectionCount}`,
    `outputReport present : ${report.hasAnyOutputReport}`,
  ];
  report.collections.forEach((c, i) => {
    lines.push(
      `  [${i}] usagePage ${c.usagePage !== null ? hex(c.usagePage, 4) : "?"}` +
        ` usage ${c.usage !== null ? hex(c.usage) : "?"}`,
    );
    lines.push(formatReportLine("inputReports ", c.inputReports));
    lines.push(formatReportLine("outputReports", c.outputReports));
    lines.push(formatReportLine("featureRepts ", c.featureReports));
  });
  return lines.join("\n");
}
