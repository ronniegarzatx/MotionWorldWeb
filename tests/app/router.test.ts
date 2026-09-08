import { describe, expect, it, vi } from "vitest";
import { createRouter, locationFromHash } from "../../src/app/router.js";
import type { Flags } from "../../src/app/flags.js";

const noFlags: Flags = { fake: false, debugSensor: false };
const debugFlags: Flags = { fake: false, debugSensor: true };

function fakeWindow(hash = "") {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const loc = { hash };
  return {
    location: loc,
    addEventListener: (t: string, l: (e: unknown) => void) => {
      (listeners[t] ??= []).push(l);
    },
    removeEventListener: (t: string, l: (e: unknown) => void) => {
      listeners[t] = (listeners[t] ?? []).filter((x) => x !== l);
    },
    fire(t: string) {
      for (const l of listeners[t] ?? []) l({});
    },
    setHash(h: string) {
      loc.hash = h;
      this.fire("hashchange");
    },
  };
}

describe("locationFromHash", () => {
  it("maps known hashes", () => {
    expect(locationFromHash("", noFlags)).toEqual({ route: "home" });
    expect(locationFromHash("#/", noFlags)).toEqual({ route: "home" });
    expect(locationFromHash("#/live", noFlags)).toEqual({ route: "live" });
    expect(locationFromHash("#/data", noFlags)).toEqual({ route: "data" });
    expect(locationFromHash("#/walk", noFlags)).toEqual({ route: "walk" });
    expect(locationFromHash("#/runs", noFlags)).toEqual({ route: "runs" });
  });

  it("#/run/<id> parses the id; bare #/run/ -> runs", () => {
    expect(locationFromHash("#/run/abc-123", noFlags)).toEqual({ route: "run", param: "abc-123" });
    expect(locationFromHash("#/run/a%20b", noFlags)).toEqual({ route: "run", param: "a b" });
    expect(locationFromHash("#/run/", noFlags)).toEqual({ route: "runs" });
  });

  it("#/snapshot and #/snapshot/<id>", () => {
    expect(locationFromHash("#/snapshot", noFlags)).toEqual({ route: "snapshot" });
    expect(locationFromHash("#/snapshot/saved-9", noFlags)).toEqual({ route: "snapshot", param: "saved-9" });
  });

  it("unknown hash -> home", () => {
    expect(locationFromHash("#/nope", noFlags)).toEqual({ route: "home" });
    expect(locationFromHash("#/speed", noFlags)).toEqual({ route: "home" });
  });

  it("#/diagnostics needs a debug or fake flag", () => {
    expect(locationFromHash("#/diagnostics", noFlags)).toEqual({ route: "home" });
    expect(locationFromHash("#/diagnostics", debugFlags)).toEqual({ route: "diagnostics" });
  });
});

describe("createRouter", () => {
  it("reports the initial location and calls onChange with it", () => {
    const win = fakeWindow("#/live");
    const r = createRouter(noFlags, win as never);
    const onChange = vi.fn();
    r.start(onChange);
    expect(r.location).toEqual({ route: "live" });
    expect(onChange).toHaveBeenCalledWith({ route: "live" });
  });

  it("reacts to hashchange incl. run ids", () => {
    const win = fakeWindow("");
    const r = createRouter(noFlags, win as never);
    const onChange = vi.fn();
    r.start(onChange);
    win.setHash("#/run/xyz");
    expect(r.location).toEqual({ route: "run", param: "xyz" });
    expect(onChange).toHaveBeenLastCalledWith({ route: "run", param: "xyz" });
  });

  it("navigate() sets the hash, including #/run/<id>", () => {
    const win = fakeWindow("");
    const r = createRouter(noFlags, win as never);
    r.start(vi.fn());
    r.navigate("runs");
    expect(win.location.hash).toBe("#/runs");
    r.navigate("run", "run 7");
    expect(win.location.hash).toBe("#/run/run%207");
  });

  it("stop() detaches", () => {
    const win = fakeWindow("");
    const r = createRouter(noFlags, win as never);
    const onChange = vi.fn();
    r.start(onChange);
    r.stop();
    win.setHash("#/data");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
