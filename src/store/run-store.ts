import type { StoredRun, StoredRunSummary } from "../model/stored-run.js";

export type { StoredRun, StoredRunSummary };

/**
 * The persistence boundary. Views and labs depend on THIS interface only — never
 * on IndexedDB directly. Implementations: IndexedDbRunStore (durable) and
 * MemoryRunStore (test double + graceful fallback when browser persistence is
 * unavailable, e.g. some `file://` contexts).
 */
export interface RunStore {
  readonly kind: "indexeddb" | "memory";
  /** Insert or overwrite by run id. */
  save(run: StoredRun): Promise<void>;
  get(id: string): Promise<StoredRun | null>;
  /** Summaries only (no samples), newest first by savedAtEpochMs. */
  listSummaries(): Promise<readonly StoredRunSummary[]>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}
