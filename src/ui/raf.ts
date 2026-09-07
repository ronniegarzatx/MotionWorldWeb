/**
 * A coalescing scheduler: many `schedule()` calls in one frame run the callback
 * once on the next animation frame.
 *
 * `requestAnimationFrame` is a WebIDL method bound to `Window` — calling it with
 * any other receiver throws `TypeError: Illegal invocation` in real Chromium
 * (the exact trap that broke Milestone Zero's timers). Bind to `globalThis`.
 */
export interface FrameScheduler {
  schedule(fn: () => void): void;
  cancel(): void;
}

type Raf = (cb: FrameRequestCallback) => number;
type Caf = (handle: number) => void;

export function createFrameScheduler(
  raf: Raf = globalThis.requestAnimationFrame
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : (cb) => globalThis.setTimeout(() => cb(0), 16) as unknown as number,
  caf: Caf = globalThis.cancelAnimationFrame
    ? globalThis.cancelAnimationFrame.bind(globalThis)
    : (h) => globalThis.clearTimeout(h),
): FrameScheduler {
  let handle: number | null = null;
  let pending: (() => void) | null = null;

  return {
    schedule(fn) {
      pending = fn;
      if (handle === null) {
        handle = raf(() => {
          handle = null;
          const run = pending;
          pending = null;
          run?.();
        });
      }
    },
    cancel() {
      if (handle !== null) {
        caf(handle);
        handle = null;
      }
      pending = null;
    },
  };
}
