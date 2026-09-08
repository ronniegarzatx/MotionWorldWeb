// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { MemoryRunStore } from "../../src/store/memory-run-store.js";
import { mountRunDetailView } from "../../src/ui/runs/run-detail-view.js";
import { serializeRun } from "../../src/model/stored-run.js";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

async function withRun(id: string, stopReason: Parameters<typeof makeMotionRun>[0]["stopReason"] = "ui", debug = false) {
  const store = new MemoryRunStore();
  await store.save(
    serializeRun(
      makeMotionRun({
        id,
        samplerHz: 25,
        source: "sensor",
        deviceLabel: "Go! Motion",
        stopReason,
        samples: [
          makeMotionSample(0, 1.0),
          makeMotionSample(0.04, 1.2),
          makeMotionSample(0.08, 1.5),
          makeMotionSample(0.12, 1.8),
        ],
      }),
      1_700_000_000_000,
    ),
  );
  const host = document.createElement("div");
  document.body.append(host);
  const navigate = vi.fn();
  const teardown = mountRunDetailView(host, { store, runId: id, navigate, debug });
  await flush();
  return { host, navigate, teardown };
}

describe("run-detail-view", () => {
  it("renders a position-vs-time graph, stats, and the analysis window — no sensor", async () => {
    const { host } = await withRun("r1");
    expect(host.querySelector(".run-detail .trace")!.getAttribute("d")!.match(/[ML]/g)).toHaveLength(4);
    const stats = [...host.querySelectorAll(".stat__label")].map((s) => s.textContent);
    expect(stats).toEqual(["Saved", "Duration", "Samples"]);
    expect(host.querySelector(".run-detail__window")!.textContent).toMatch(/Analysis window: 0\.00–0\.12 s .*full run/);
    expect(host.querySelector(".run-detail__head")!.textContent).toContain("complete");
  });

  it("flags an interrupted run", async () => {
    const { host } = await withRun("r2", "device_lost");
    expect(host.querySelector(".run-row__chip")!.textContent).toMatch(/sensor disconnected/i);
  });

  it("Back navigates to the runs list", async () => {
    const { host, navigate } = await withRun("r3");
    [...host.querySelectorAll("button")].find((b) => b.textContent === "← Runs")!.click();
    expect(navigate).toHaveBeenCalledWith("runs");
  });

  it("Open in Snapshot routes to #/snapshot/<id>", async () => {
    const { host, navigate } = await withRun("r3b");
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Open in Snapshot")!.click();
    expect(navigate).toHaveBeenCalledWith("snapshot", "r3b");
  });

  it("Open in Speed Lab routes to #/speed/<id>", async () => {
    const { host, navigate } = await withRun("r3c");
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Open in Speed Lab")!.click();
    expect(navigate).toHaveBeenCalledWith("speed", "r3c");
  });

  it("Open in Sequence Lab routes to #/sequence/<id>", async () => {
    const { host, navigate } = await withRun("r3d");
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Open in Sequence Lab")!.click();
    expect(navigate).toHaveBeenCalledWith("sequence", "r3d");
  });

  it("missing run -> a friendly message, not a crash", async () => {
    const store = new MemoryRunStore();
    const host = document.createElement("div");
    document.body.append(host);
    mountRunDetailView(host, { store, runId: "ghost", navigate: vi.fn() });
    await flush();
    expect(host.textContent).toMatch(/no longer saved/i);
  });

  it("debug mode shows an AnalysisWindow start/end demo", async () => {
    const { host } = await withRun("r4", "ui", true);
    const nudge = [...host.querySelectorAll("button")].find((b) => b.textContent === "start +0.5")!;
    nudge.click();
    expect(host.querySelector(".run-detail__window")!.textContent).not.toMatch(/full run/);
  });
});
