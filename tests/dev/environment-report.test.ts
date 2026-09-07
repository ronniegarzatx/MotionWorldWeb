import { describe, expect, it } from "vitest";
import {
  describeEnvironment,
  formatEnvironmentReport,
  readEnv,
} from "../../src/dev/environment-report.js";

describe("environment-report", () => {
  it("readEnv pulls protocol / secureContext / hid presence from injected sources", () => {
    const env = readEnv(
      { protocol: "file:" },
      { isSecureContext: true },
      { hid: {} },
    );
    expect(env).toEqual({ protocol: "file:", secureContext: true, hasHid: true });
  });

  it("file:// + secure + hid -> available", () => {
    const r = describeEnvironment({ protocol: "file:", secureContext: true, hasHid: true });
    expect(r.webhidAvailable).toBe(true);
    expect(r.isFileUrl).toBe(true);
    expect(r.summary).toMatch(/available/i);
    expect(r.summary).toMatch(/file:\/\/.*physically verified/i);
  });

  it("no hid -> unavailable but app still runs", () => {
    const r = describeEnvironment({ protocol: "https:", secureContext: true, hasHid: false });
    expect(r.webhidAvailable).toBe(false);
    expect(r.summary).toMatch(/app still runs/i);
  });

  it("hid present but insecure -> unavailable", () => {
    const r = describeEnvironment({ protocol: "http:", secureContext: false, hasHid: true });
    expect(r.webhidAvailable).toBe(false);
    expect(r.summary).toMatch(/not a secure context/i);
  });

  it("formatEnvironmentReport is copy-friendly", () => {
    const text = formatEnvironmentReport(
      describeEnvironment({ protocol: "file:", secureContext: false, hasHid: false }),
    );
    expect(text).toContain("origin / protocol : file:");
    expect(text).toContain("secure context    : no");
    expect(text).toContain("WebHID API        : unavailable");
  });
});
