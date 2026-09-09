/**
 * A minimal recording stand-in for CanvasRenderingContext2D — no real canvas
 * dependency. Every method call and property assignment is logged; method
 * calls return undefined except createRadialGradient/createLinearGradient,
 * which return a working (no-op) CanvasGradient stub so effect code that
 * chains `.addColorStop(...)` on the result doesn't throw.
 */
export interface CtxCall {
  readonly type: "call";
  readonly method: string;
  readonly args: readonly unknown[];
}
export interface CtxSet {
  readonly type: "set";
  readonly prop: string;
  readonly value: unknown;
}
export type CtxEvent = CtxCall | CtxSet;

export interface RecordingContext {
  readonly ctx: CanvasRenderingContext2D;
  readonly log: CtxEvent[];
}

// A single shared no-op so every gradient stub's addColorStop is the SAME
// function reference — otherwise two structurally-identical stubs (e.g. from
// two deterministic replays with the same seed) would fail a deep-equal log
// comparison purely because each got its own freshly-created closure.
const noopAddColorStop = (): void => {};
function makeGradientStub(): CanvasGradient {
  return { addColorStop: noopAddColorStop } as unknown as CanvasGradient;
}

export function createRecordingContext(): RecordingContext {
  const log: CtxEvent[] = [];
  const state: Record<string, unknown> = {};

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      if (Object.prototype.hasOwnProperty.call(state, prop)) return state[prop];
      if (prop === "createRadialGradient" || prop === "createLinearGradient") {
        return (...args: unknown[]) => {
          log.push({ type: "call", method: prop, args });
          return makeGradientStub();
        };
      }
      return (...args: unknown[]) => {
        log.push({ type: "call", method: prop, args });
        return undefined;
      };
    },
    set(_target, prop, value) {
      if (typeof prop === "string") {
        state[prop] = value;
        log.push({ type: "set", prop, value });
      }
      return true;
    },
  };

  const ctx = new Proxy({}, handler) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

/** Method-call events for one method name, in order. */
export function callsOf(log: readonly CtxEvent[], method: string): CtxCall[] {
  return log.filter((e): e is CtxCall => e.type === "call" && e.method === method);
}

/** True if a fillRect(0, 0, width, height) call happened anywhere in the log. */
export function paintedFullCanvasBackground(log: readonly CtxEvent[], width: number, height: number): boolean {
  return callsOf(log, "fillRect").some((c) => c.args[0] === 0 && c.args[1] === 0 && c.args[2] === width && c.args[3] === height);
}
