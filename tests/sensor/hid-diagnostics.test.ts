import { describe, expect, it } from "vitest";
import type { HidDeviceLike } from "../../src/sensor/hid.js";
import { describeDevice, formatDeviceReport } from "../../src/sensor/hid-diagnostics.js";

function fakeDevice(overrides: Partial<HidDeviceLike> = {}): HidDeviceLike {
  return {
    productName: "Go!Motion",
    vendorId: 0x08f7,
    productId: 0x0004,
    opened: true,
    collections: [
      {
        usagePage: 0xff00,
        usage: 0x01,
        inputReports: [{ reportId: 0, items: [{ reportCount: 8, reportSize: 8 }] }],
        outputReports: [{ reportId: 0, items: [{ reportCount: 8, reportSize: 8 }] }],
        featureReports: [],
      },
    ],
    open: async () => {},
    close: async () => {},
    sendReport: async () => {},
    sendFeatureReport: async () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    ...overrides,
  };
}

describe("describeDevice / formatDeviceReport", () => {
  it("summarises the structured report", () => {
    const r = describeDevice(fakeDevice());
    expect(r.vendorId).toBe(0x08f7);
    expect(r.productId).toBe(0x0004);
    expect(r.collectionCount).toBe(1);
    expect(r.hasAnyOutputReport).toBe(true);
    expect(r.collections[0]!.inputReports[0]).toMatchObject({
      reportId: 0,
      byteLength: 8,
    });
  });

  it("flags a device with NO output report (predicted WebHID blocker)", () => {
    const r = describeDevice(
      fakeDevice({
        collections: [
          {
            usagePage: 0xff00,
            usage: 0x01,
            inputReports: [{ reportId: 0, items: [{ reportCount: 8, reportSize: 8 }] }],
            outputReports: [],
            featureReports: [{ reportId: 0, items: [{ reportCount: 8, reportSize: 8 }] }],
          },
        ],
      }),
    );
    expect(r.hasAnyOutputReport).toBe(false);
    const text = formatDeviceReport(r);
    expect(text).toContain("outputReport present : false");
    expect(text).toContain("outputReports: (none)");
    expect(text).toContain("featureRepts : id 0 (8 bytes)");
  });

  it("produces copy-friendly text with hex ids", () => {
    const text = formatDeviceReport(describeDevice(fakeDevice()));
    expect(text).toContain("vendorId    : 0x08F7 (2295)");
    expect(text).toContain("productId   : 0x0004 (4)");
    expect(text).toContain("productName : Go!Motion");
  });
});
