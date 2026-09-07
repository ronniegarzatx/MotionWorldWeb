/**
 * A tiny capability report for the developer diagnostics view — especially
 * useful when the app is opened as the portable single file (`file://`), where
 * WebHID may or may not be available depending on the browser/platform.
 */
export interface EnvSource {
  readonly protocol: string;
  readonly secureContext: boolean;
  readonly hasHid: boolean;
}

export interface EnvironmentReport {
  readonly protocol: string;
  readonly secureContext: boolean;
  readonly webhidAvailable: boolean;
  readonly isFileUrl: boolean;
  readonly summary: string;
}

export function readEnv(
  loc: { protocol: string } = location,
  win: { isSecureContext: boolean } = window,
  nav: unknown = navigator,
): EnvSource {
  return {
    protocol: loc.protocol,
    secureContext: win.isSecureContext === true,
    hasHid: typeof nav === "object" && nav !== null && "hid" in nav,
  };
}

export function describeEnvironment(src: EnvSource): EnvironmentReport {
  const isFileUrl = src.protocol === "file:";
  let summary: string;
  if (src.hasHid && src.secureContext) {
    summary = "WebHID is available — Connect Sensor should work.";
  } else if (!src.hasHid) {
    summary =
      "WebHID API not present in this browser. The app still runs; sensor features are unavailable. Use Chrome or Edge.";
  } else {
    summary =
      "WebHID present but this is not a secure context, so Connect Sensor will likely fail.";
  }
  if (isFileUrl) {
    summary +=
      " Opened as a local file (file://) — hardware access from file:// is browser/platform-dependent and must be physically verified.";
  }
  return {
    protocol: src.protocol,
    secureContext: src.secureContext,
    webhidAvailable: src.hasHid && src.secureContext,
    isFileUrl,
    summary,
  };
}

export function formatEnvironmentReport(r: EnvironmentReport): string {
  return [
    `origin / protocol : ${r.protocol}`,
    `secure context    : ${r.secureContext ? "yes" : "no"}`,
    `WebHID API        : ${r.webhidAvailable ? "available" : "unavailable"}`,
    ``,
    r.summary,
  ].join("\n");
}
