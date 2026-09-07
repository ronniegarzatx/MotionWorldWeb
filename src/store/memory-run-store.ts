import { summarizeStored, type StoredRun, type StoredRunSummary } from "../model/stored-run.js";
import type { RunStore } from "./run-store.js";

/**
 * In-memory RunStore. Used as a test double and as the graceful fallback when
 * IndexedDB is unavailable (the app still works for the session; the Runs view
 * shows a "temporary storage" notice).
 */
export class MemoryRunStore implements RunStore {
  readonly kind = "memory" as const;
  private readonly runs = new Map<string, StoredRun>();

  async save(run: StoredRun): Promise<void> {
    this.runs.set(run.id, run);
  }

  async get(id: string): Promise<StoredRun | null> {
    return this.runs.get(id) ?? null;
  }

  async listSummaries(): Promise<readonly StoredRunSummary[]> {
    return [...this.runs.values()]
      .sort((a, b) => b.savedAtEpochMs - a.savedAtEpochMs)
      .map(summarizeStored);
  }

  async delete(id: string): Promise<void> {
    this.runs.delete(id);
  }

  async clear(): Promise<void> {
    this.runs.clear();
  }
}
