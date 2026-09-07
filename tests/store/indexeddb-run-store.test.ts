import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";
import { openRunStore } from "../../src/store/indexeddb-run-store.js";
import { createRunStore } from "../../src/store/create-run-store.js";
import { serializeRun } from "../../src/model/stored-run.js";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";

// isolate each test with a fresh in-memory IndexedDB
afterEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

const storedRun = (id: string, savedAt: number, stopReason: Parameters<typeof makeMotionRun>[0]["stopReason"] = "ui") =>
  serializeRun(
    makeMotionRun({
      id,
      samplerHz: 25,
      source: "sensor",
      deviceLabel: "Go! Motion",
      stopReason,
      samples: [makeMotionSample(0, 1.0), makeMotionSample(0.04, 1.1), makeMotionSample(0.08, 1.2)],
    }),
    savedAt,
  );

describe("IndexedDbRunStore", () => {
  it("creates the schema on a fresh DB and supports the full CRUD contract", async () => {
    const store = await openRunStore();
    expect(store.kind).toBe("indexeddb");

    await store.save(storedRun("a", 100));
    await store.save(storedRun("b", 300));
    await store.save(storedRun("c", 200, "navigation"));

    expect((await store.get("a"))?.id).toBe("a");
    expect(await store.get("nope")).toBeNull();

    const list = await store.listSummaries();
    expect(list.map((r) => r.id)).toEqual(["b", "c", "a"]); // newest-first
    expect(list.find((r) => r.id === "c")!.interrupted).toBe(true);

    await store.delete("b");
    expect((await store.listSummaries()).map((r) => r.id)).toEqual(["c", "a"]);

    await store.clear();
    expect(await store.listSummaries()).toEqual([]);
  });

  it("persists across a close + reopen of the database", async () => {
    const first = await openRunStore();
    await first.save(storedRun("keep-me", 42));

    const second = await openRunStore(); // reopen same named DB
    const got = await second.get("keep-me");
    expect(got?.id).toBe("keep-me");
    expect(got?.samples).toHaveLength(3);
  });

  it("preserves exact sample values through storage", async () => {
    const store = await openRunStore();
    const run = serializeRun(
      makeMotionRun({
        id: "precise",
        samplerHz: 25,
        source: "sensor",
        deviceLabel: null,
        samples: [makeMotionSample(0.123456789, -0.0655361234)],
      }),
    );
    await store.save(run);
    expect((await store.get("precise"))?.samples[0]).toEqual({ t: 0.123456789, x: -0.0655361234 });
  });
});

describe("openRunStore / createRunStore failure mapping", () => {
  it("openRunStore rejects when IndexedDB is absent", async () => {
    await expect(openRunStore(null)).rejects.toThrow(/not available/i);
  });

  it("createRunStore falls back to MemoryRunStore and reports the reason", async () => {
    const saved = globalThis.indexedDB;
    // @ts-expect-error simulate a missing API
    delete globalThis.indexedDB;
    let reason: unknown;
    const store = await createRunStore((r) => (reason = r));
    expect(store.kind).toBe("memory");
    expect(reason).toBeInstanceOf(Error);
    globalThis.indexedDB = saved;
  });
});
