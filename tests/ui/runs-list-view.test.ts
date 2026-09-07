// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { MemoryRunStore } from "../../src/store/memory-run-store.js";
import { mountRunsListView } from "../../src/ui/runs/runs-list-view.js";
import { serializeRun } from "../../src/model/stored-run.js";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import type { RunStore } from "../../src/store/run-store.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

function stored(id: string, savedAt: number, stopReason: Parameters<typeof makeMotionRun>[0]["stopReason"] = "ui") {
  return serializeRun(
    makeMotionRun({
      id,
      samplerHz: 25,
      source: "fake",
      deviceLabel: null,
      stopReason,
      samples: [makeMotionSample(0, 1), makeMotionSample(0.04, 1.1), makeMotionSample(0.08, 1.2)],
    }),
    savedAt,
  );
}

async function setup(store: RunStore = new MemoryRunStore()) {
  const host = document.createElement("div");
  document.body.append(host);
  const navigate = vi.fn();
  const teardown = mountRunsListView(host, { store, navigate });
  await flush();
  return { host, store, navigate, teardown };
}

describe("runs-list-view", () => {
  it("empty state", async () => {
    const { host } = await setup();
    expect(host.querySelector(".runs-empty__head")!.textContent).toBe("NO SAVED RUNS YET");
    expect(host.textContent).toContain("Completed collections will appear here automatically.");
    expect(host.querySelector(".run-row")).toBeNull();
  });

  it("lists runs newest-first with duration, samples, and an interrupted chip", async () => {
    const store = new MemoryRunStore();
    await store.save(stored("old", 100));
    await store.save(stored("new", 300, "device_lost"));
    const { host } = await setup(store);
    const rows = [...host.querySelectorAll(".run-row")];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("samples");
    expect(rows[0]!.querySelector(".run-row__chip")!.textContent).toMatch(/interrupted/i);
    // 'new' (interrupted) is first
    expect(rows[1]!.querySelector(".run-row__chip")).toBeNull();
  });

  it("View navigates to the run detail", async () => {
    const store = new MemoryRunStore();
    await store.save(stored("r1", 1));
    const { host, navigate } = await setup(store);
    [...host.querySelectorAll("button")].find((b) => b.textContent === "View")!.click();
    expect(navigate).toHaveBeenCalledWith("run", "r1");
  });

  it("Delete is a confirm step and updates the list in place", async () => {
    const store = new MemoryRunStore();
    await store.save(stored("r1", 1));
    await store.save(stored("r2", 2));
    const { host } = await setup(store);
    const del = [...host.querySelectorAll("button")].find((b) => b.textContent === "Delete")!;
    del.click();
    const confirm = [...host.querySelectorAll("button")].find((b) => b.textContent === "Confirm delete")!;
    confirm.click();
    await flush();
    expect(host.querySelectorAll(".run-row")).toHaveLength(1);
    expect(await store.listSummaries()).toHaveLength(1);
  });

  it("Clear All Runs is a two-step confirmation", async () => {
    const store = new MemoryRunStore();
    await store.save(stored("r1", 1));
    await store.save(stored("r2", 2));
    const { host } = await setup(store);
    const btn = (t: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === t);

    btn("Clear All Runs")!.click();
    expect(host.textContent).toMatch(/Really clear 2 runs\?/);
    expect(await store.listSummaries()).toHaveLength(2); // not cleared yet

    btn("Clear")!.click();
    await flush();
    expect(await store.listSummaries()).toHaveLength(0);
    expect(host.querySelector(".runs-empty__head")).not.toBeNull();
  });

  it("a memory store shows the temporary-storage banner", async () => {
    const { host } = await setup(new MemoryRunStore());
    expect(host.querySelector(".runs-banner")!.textContent).toMatch(/Temporary storage/i);
  });
});
