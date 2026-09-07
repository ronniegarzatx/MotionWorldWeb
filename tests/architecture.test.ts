import { describe, expect, it } from "vitest";

// Load every source file as raw text (Vite/Vitest feature — no node:fs needed).
const modules = import.meta.glob("../src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const files = Object.entries(modules).map(([path, text]) => ({
  // "../src/ui/live/live-lab-view.ts" -> "ui/live/live-lab-view.ts"
  path: path.replace(/^\.\.\/src\//, ""),
  text: stripComments(text),
}));

/**
 * The sensor boundary (parent spec §4): HID report bytes and `navigator.hid`
 * live ONLY in src/sensor/. The one exception is the composition root
 * (src/app/app.ts), which must construct the adapter and probe capability.
 */
describe("sensor-boundary architecture guard", () => {
  it("has actually scanned the source tree", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it("nothing outside src/sensor/ mentions navigator.hid", () => {
    const offenders = files
      .filter((f) => !f.path.startsWith("sensor/"))
      .filter((f) => /navigator\.hid/.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("nothing outside src/sensor/ calls sendReport / sendFeatureReport", () => {
    const offenders = files
      .filter((f) => !f.path.startsWith("sensor/"))
      .filter((f) => /\.sendReport\(|\.sendFeatureReport\(/.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("only src/sensor/ and the composition root import sensor internals (hid / protocol codec / adapter)", () => {
    const allowed = new Set(["app/app.ts"]);
    const offenders = files
      .filter((f) => !f.path.startsWith("sensor/") && !allowed.has(f.path))
      .filter((f) =>
        /from ["'][^"']*sensor\/(hid|go-motion-protocol|go-motion-webhid)/.test(f.text),
      )
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
