import { summarizeStored, type StoredRun, type StoredRunSummary } from "../model/stored-run.js";
import type { RunStore } from "./run-store.js";

/**
 * The ONLY module that touches IndexedDB. Native API, no library.
 *
 *   database : "motion-world", version 1
 *   store    : "runs", in-line key "id"
 *
 * Classroom scale — `getAll()` + sort by savedAtEpochMs desc is fine; no
 * secondary index. The per-record `schemaVersion` (in StoredRun) is separate
 * from the IDB version and leaves room for a future record migration.
 */
const DB_NAME = "motion-world";
const DB_VERSION = 1;
const STORE = "runs";

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function openDb(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = idb.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error("could not open IndexedDB"));
    open.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}

class IndexedDbRunStore implements RunStore {
  readonly kind = "indexeddb" as const;
  constructor(private readonly db: IDBDatabase) {}

  private tx(mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(STORE, mode).objectStore(STORE);
  }

  async save(run: StoredRun): Promise<void> {
    await req(this.tx("readwrite").put(run));
  }

  async get(id: string): Promise<StoredRun | null> {
    return (await req<StoredRun | undefined>(this.tx("readonly").get(id))) ?? null;
  }

  async listSummaries(): Promise<readonly StoredRunSummary[]> {
    const all = await req<StoredRun[]>(this.tx("readonly").getAll());
    return all.sort((a, b) => b.savedAtEpochMs - a.savedAtEpochMs).map(summarizeStored);
  }

  async delete(id: string): Promise<void> {
    await req(this.tx("readwrite").delete(id));
  }

  async clear(): Promise<void> {
    await req(this.tx("readwrite").clear());
  }
}

/**
 * Resolves an IndexedDbRunStore, or rejects if IndexedDB is unavailable / the
 * open fails. `createRunStore()` turns a rejection into a MemoryRunStore.
 */
export async function openRunStore(
  idb: IDBFactory | null | undefined = typeof indexedDB !== "undefined" ? indexedDB : null,
): Promise<RunStore> {
  if (!idb) throw new Error("IndexedDB is not available in this context");
  const db = await openDb(idb);
  return new IndexedDbRunStore(db);
}
