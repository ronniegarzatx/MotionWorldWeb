import { describe, expect, it } from "vitest";
import { MemoryRunStore } from "../../src/store/memory-run-store.js";
import { serializeRun } from "../../src/model/stored-run.js";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";

const storedRun = (id: string, savedAt: number, stopReason: Parameters<typeof makeMotionRun>[0]["stopReason"] = "ui") =>
  serializeRun(
    makeMotionRun({
      id,
      samplerHz: 25,
      source: "fake",
      deviceLabel: null,
      stopReason,
      samples: [makeMotionSample(0, 1), makeMotionSample(0.04, 1.1)],
    }),
    savedAt,
  );

describe("MemoryRunStore", () => {
  it("save / get / delete / clear round-trip", async () => {
    const s = new MemoryRunStore();
    expect(s.kind).toBe("memory");
    await s.save(storedRun("a", 100));
    expect((await s.get("a"))?.id).toBe("a");
    expect(await s.get("missing")).toBeNull();
    await s.delete("a");
    expect(await s.get("a")).toBeNull();

    await s.save(storedRun("b", 1));
    await s.clear();
    expect(await s.listSummaries()).toEqual([]);
  });

  it("overwrites by id", async () => {
    const s = new MemoryRunStore();
    await s.save(storedRun("x", 1));
    await s.save({ ...storedRun("x", 2), sampleCount: 999 });
    expect((await s.get("x"))?.sampleCount).toBe(999);
    expect(await s.listSummaries()).toHaveLength(1);
  });

  it("listSummaries is newest-first and carries no samples", async () => {
    const s = new MemoryRunStore();
    await s.save(storedRun("old", 100));
    await s.save(storedRun("new", 300));
    await s.save(storedRun("mid", 200, "device_lost"));
    const list = await s.listSummaries();
    expect(list.map((r) => r.id)).toEqual(["new", "mid", "old"]);
    expect(list.find((r) => r.id === "mid")!.interrupted).toBe(true);
    expect("samples" in list[0]!).toBe(false);
  });
});
