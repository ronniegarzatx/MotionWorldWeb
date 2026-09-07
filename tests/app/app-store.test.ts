import { describe, expect, it, vi } from "vitest";
import { AppStore } from "../../src/app/app-store.js";

describe("AppStore", () => {
  it("holds the route and notifies on change", () => {
    const store = new AppStore({ route: "home" });
    const seen = vi.fn();
    store.subscribe(seen);
    store.setRoute("live");
    expect(store.get().route).toBe("live");
    expect(seen).toHaveBeenCalledWith({ route: "live" });
  });

  it("does not notify on a same-value set", () => {
    const store = new AppStore({ route: "home" });
    const seen = vi.fn();
    store.subscribe(seen);
    store.setRoute("home");
    expect(seen).not.toHaveBeenCalled();
  });
});
