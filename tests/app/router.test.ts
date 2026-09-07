import { describe, expect, it, vi } from "vitest";
import { createRouter, routeFromHash } from "../../src/app/router.js";
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

describe("routeFromHash", () => {
  it("maps known hashes", () => {
    expect(routeFromHash("", noFlags)).toBe("home");
    expect(routeFromHash("#/", noFlags)).toBe("home");
    expect(routeFromHash("#/live", noFlags)).toBe("live");
    expect(routeFromHash("#/data", noFlags)).toBe("data");
    expect(routeFromHash("#/walk", noFlags)).toBe("walk");
  });

  it("unknown hash -> home", () => {
    expect(routeFromHash("#/nope", noFlags)).toBe("home");
    expect(routeFromHash("#/snapshot", noFlags)).toBe("home");
  });

  it("#/diagnostics needs a debug or fake flag", () => {
    expect(routeFromHash("#/diagnostics", noFlags)).toBe("home");
    expect(routeFromHash("#/diagnostics", debugFlags)).toBe("diagnostics");
    expect(routeFromHash("#/diagnostics", { fake: true, debugSensor: false })).toBe("diagnostics");
  });
});

describe("createRouter", () => {
  it("reports the initial route and calls onChange with it", () => {
    const win = fakeWindow("#/live");
    const r = createRouter(noFlags, win as never);
    const onChange = vi.fn();
    r.start(onChange);
    expect(r.route).toBe("live");
    expect(onChange).toHaveBeenCalledWith("live");
  });

  it("reacts to hashchange", () => {
    const win = fakeWindow("");
    const r = createRouter(noFlags, win as never);
    const onChange = vi.fn();
    r.start(onChange);
    win.setHash("#/data");
    expect(r.route).toBe("data");
    expect(onChange).toHaveBeenLastCalledWith("data");
  });

  it("navigate() sets the hash", () => {
    const win = fakeWindow("");
    const r = createRouter(noFlags, win as never);
    r.start(vi.fn());
    r.navigate("live");
    expect(win.location.hash).toBe("#/live");
  });

  it("stop() detaches", () => {
    const win = fakeWindow("");
    const r = createRouter(noFlags, win as never);
    const onChange = vi.fn();
    r.start(onChange);
    r.stop();
    win.setHash("#/data");
    expect(onChange).toHaveBeenCalledTimes(1); // only the initial call
  });
});
