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

/**
 * The persistence boundary (M2 §B1): IndexedDB lives ONLY in src/store/.
 * Views/labs depend on the RunStore interface, never the IDB implementation.
 */
describe("persistence-boundary architecture guard", () => {
  it("nothing outside src/store/ mentions IndexedDB", () => {
    const offenders = files
      .filter((f) => !f.path.startsWith("store/"))
      .filter((f) => /\bindexedDB\b|IDBDatabase|IDBObjectStore|IDBFactory/.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("nothing outside src/store/ imports the IndexedDB implementation", () => {
    const offenders = files
      .filter((f) => !f.path.startsWith("store/"))
      .filter((f) => /from ["'][^"']*store\/(indexeddb-run-store|create-run-store)/.test(f.text))
      .map((f) => f.path);
    // app/app.ts legitimately imports create-run-store (the fallback factory)
    expect(offenders.filter((p) => p !== "app/app.ts")).toEqual([]);
  });
});

/**
 * Pure model modules (M3 §2–5, §12): the math is framework-free and testable in
 * isolation — no DOM, no `document`.
 */
describe("pure-model architecture guard", () => {
  const PURE = [
    "model/run-interpolation.ts",
    "model/classroom-snapshot.ts",
    "model/model-fit.ts",
    "model/suggest-model.ts",
    "model/classroom-equation.ts",
    "model/snapshot-workspace.ts",
    "model/analysis-window.ts",
    "model/rate-analysis.ts",
    "model/speed-limit.ts",
    "model/endpoint-slope.ts",
    "model/speed-workspace.ts",
  ];
  it("the model math never touches the DOM", () => {
    const offenders = files
      .filter((f) => PURE.includes(f.path))
      .filter((f) => /\bdocument\b|from ["'][^"']*\/ui\//.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
