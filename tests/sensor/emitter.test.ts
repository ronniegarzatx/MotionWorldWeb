import { describe, expect, it, vi } from "vitest";
import { createEmitter } from "../../src/sensor/emitter.js";

describe("createEmitter", () => {
  it("delivers values to subscribers and stops after unsubscribe", () => {
    const e = createEmitter<number>();
    const a = vi.fn();
    const off = e.subscribe(a);
    e.emit(1);
    off();
    e.emit(2);
    expect(a.mock.calls).toEqual([[1]]);
  });

  it("double-unsubscribe is a no-op", () => {
    const e = createEmitter<number>();
    const off = e.subscribe(vi.fn());
    off();
    expect(() => off()).not.toThrow();
    expect(e.size).toBe(0);
  });

  it("a listener subscribed during emit is not called this round", () => {
    const e = createEmitter<number>();
    const late = vi.fn();
    e.subscribe(() => e.subscribe(late));
    e.emit(1);
    expect(late).not.toHaveBeenCalled();
    e.emit(2);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("a listener removed during emit does not fire", () => {
    const e = createEmitter<number>();
    const b = vi.fn();
    let offB = () => {};
    e.subscribe(() => offB());
    offB = e.subscribe(b);
    e.emit(1);
    expect(b).not.toHaveBeenCalled();
  });
});
