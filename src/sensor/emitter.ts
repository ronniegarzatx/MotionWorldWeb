import type { Unsubscribe } from "./types.js";

/**
 * Minimal typed event emitter. Snapshot-on-emit so a listener that subscribes or
 * unsubscribes during dispatch does not affect the round in progress
 * (subscribed-during-emit is skipped; unsubscribed-during-emit is respected only
 * if it had not yet been called).
 */
export interface Emitter<T> {
  subscribe(listener: (value: T) => void): Unsubscribe;
  emit(value: T): void;
  clear(): void;
  readonly size: number;
}

export function createEmitter<T>(): Emitter<T> {
  const listeners = new Set<(value: T) => void>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
      };
    },
    emit(value) {
      for (const listener of [...listeners]) {
        if (listeners.has(listener)) listener(value);
      }
    },
    clear() {
      listeners.clear();
    },
    get size() {
      return listeners.size;
    },
  };
}
