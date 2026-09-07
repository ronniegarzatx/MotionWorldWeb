import { MemoryRunStore } from "./memory-run-store.js";
import { openRunStore } from "./indexeddb-run-store.js";
import type { RunStore } from "./run-store.js";

/**
 * The app's one entry point for run persistence. Tries durable IndexedDB; on any
 * failure (API absent, `file://` quirk, private-mode block) falls back to an
 * in-memory store so the app still works for the session.
 */
export async function createRunStore(
  onFallback?: (reason: unknown) => void,
): Promise<RunStore> {
  try {
    return await openRunStore();
  } catch (reason) {
    onFallback?.(reason);
    return new MemoryRunStore();
  }
}
