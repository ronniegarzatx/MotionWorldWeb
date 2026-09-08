// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcquisitionController } from "../../src/acquisition/acquisition-controller.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import { MemoryRunStore } from "../../src/store/memory-run-store.js";
import { serializeRun } from "../../src/model/stored-run.js";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import { mountSnapshotLabView } from "../../src/ui/snapshot/snapshot-lab-view.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterEach(() => vi.useRealTimers());

const btn = (host: HTMLElement, label: string): HTMLButtonElement =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement;

// a clean linear walk 1.0 -> 3.0 m over 4 s
const linearWalk = (id: string) =>
  makeMotionRun({
    id,
    samplerHz: 25,
    source: "sensor",
    deviceLabel: null,
    stopReason: "ui",
    samples: Array.from({ length: 101 }, (_, i) => makeMotionSample(i * 0.04, 1.0 + i * 0.04 * 0.5)),
  });

async function withRun(run: ReturnType<typeof linearWalk>) {
  const host = document.createElement("div");
  document.body.append(host);
  const adapter = new FakeSensorAdapter({ sampleHz: 25 });
  const controller = new AcquisitionController(adapter, { samplerHz: 25 });
  vi.spyOn(controller, "lastCompletedRun").mockReturnValue(run);
  const runStore = new MemoryRunStore();
  const navigate = vi.fn();
  const teardown = mountSnapshotLabView(host, { controller, runStore, navigate });
  await flush();
  return { host, controller, runStore, navigate, teardown };
}
const withCurrentRun = () => withRun(linearWalk("cur"));

/** interpolate a "M x y L x y ..." path's y at a given x */
function pathYAt(d: string, x: number): number {
  const pts = [...d.matchAll(/[ML] ([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    if (x >= Math.min(x0, x1) && x <= Math.max(x0, x1)) {
      const f = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      return y0 + f * (y1 - y0);
    }
  }
  return pts.at(-1)![1];
}

describe("snapshot-lab-view — no run", () => {
  it("empty state with two navigation actions", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const adapter = new FakeSensorAdapter();
    const controller = new AcquisitionController(adapter);
    const navigate = vi.fn();
    mountSnapshotLabView(host, { controller, runStore: new MemoryRunStore(), navigate });
    await flush();
    expect(host.querySelector(".snapshot-empty__head")!.textContent).toBe("NO RUN TO SNAPSHOT");
    btn(host, "Go to Live Lab").click();
    btn(host, "Open Saved Runs").click();
    expect(navigate).toHaveBeenNthCalledWith(1, "live");
    expect(navigate).toHaveBeenNthCalledWith(2, "runs");
  });
});

describe("snapshot-lab-view — workspace", () => {
  it("starts in Raw Run with Time/Position axes and a Select Window button", async () => {
    const { host } = await withCurrentRun();
    expect(host.querySelector(".snapshot-mode__name")!.textContent).toBe("Raw Run");
    const titles = [...host.querySelectorAll(".axis-title")].map((t) => t.textContent);
    expect(titles).toContain("Time (s)");
    expect(titles).toContain("Position (m)");
    expect(btn(host, "Select Window")).toBeTruthy();
  });

  it("Select Window -> selection band + Use All / Make Snapshot", async () => {
    const { host } = await withCurrentRun();
    btn(host, "Select Window").click();
    expect(host.querySelector(".selection-band")).not.toBeNull();
    expect(host.textContent).toMatch(/Selected: 0\.00 s → 4\.00 s/);
    expect(btn(host, "Use All")).toBeTruthy();
    expect(btn(host, "Make Snapshot")).toBeTruthy();
  });

  it("Make Snapshot -> Classroom axes, 5 markers, dense motion trace, legend, POINTS (5) collapsed", async () => {
    const { host } = await withCurrentRun();
    btn(host, "Select Window").click();
    btn(host, "Make Snapshot").click();
    expect(host.querySelector(".snapshot-mode__name")!.textContent).toBe("Classroom Snapshot");
    const titles = [...host.querySelectorAll(".axis-title")].map((t) => t.textContent);
    expect(titles).toContain("Classroom x");
    expect(titles).toContain("Classroom y");
    expect(host.querySelectorAll(".marker")).toHaveLength(5);
    // dense motion trace behind the points
    const trace = host.querySelector(".motion-trace");
    expect(trace).not.toBeNull();
    expect(trace!.getAttribute("d")!.match(/[ML]/g)!.length).toBeGreaterThan(20);
    // legend (no model yet)
    expect([...host.querySelectorAll(".snapshot-legend__item")].map((n) => n.textContent)).toEqual([
      "Motion",
      "Points",
    ]);
    expect(host.querySelector(".snapshot-points__header")!.textContent).toContain("POINTS (5)");
    expect((host.querySelector(".snapshot-points__table") as HTMLElement).hidden).toBe(true);
  });

  it("legend gains Model once a fit exists; the model curve stays separate", async () => {
    const { host } = await withCurrentRun();
    btn(host, "Select Window").click();
    btn(host, "Make Snapshot").click();
    btn(host, "Suggest").click();
    expect([...host.querySelectorAll(".snapshot-legend__item")].map((n) => n.textContent)).toEqual([
      "Motion",
      "Points",
      "Model",
    ]);
    expect(host.querySelector(".motion-trace")).not.toBeNull();
    expect(host.querySelector(".model-curve")).not.toBeNull();
  });

  it("point-count stepper rebuilds the markers", async () => {
    const { host } = await withCurrentRun();
    btn(host, "Select Window").click();
    btn(host, "Make Snapshot").click();
    btn(host, "+").click();
    btn(host, "+").click();
    expect(host.querySelectorAll(".marker")).toHaveLength(7);
  });

  it("choosing Linear shows classroom + precise equations, r², and a model curve", async () => {
    const { host } = await withCurrentRun();
    btn(host, "Select Window").click();
    btn(host, "Make Snapshot").click();
    const select = host.querySelector("select") as HTMLSelectElement;
    select.value = "linear";
    select.dispatchEvent(new Event("change"));

    expect(host.querySelector(".eq-classroom")!.textContent).toMatch(/f\(x\) ≈/);
    expect(host.querySelector(".eq-precise")!.textContent).toMatch(/f\(x\) = /);
    expect(host.querySelector(".eq-r2")!.textContent).toMatch(/r² = /);
    expect(host.querySelector(".model-curve")).not.toBeNull();
  });

  it("Change Window makes the equation / r² / model curve disappear until refit", async () => {
    const { host } = await withCurrentRun();
    btn(host, "Select Window").click();
    btn(host, "Make Snapshot").click();
    const select = host.querySelector("select") as HTMLSelectElement;
    select.value = "linear";
    select.dispatchEvent(new Event("change"));
    expect(host.querySelector(".eq-classroom")).not.toBeNull();

    btn(host, "Change Window").click();
    expect(host.querySelector(".eq-classroom")).toBeNull();
    expect(host.querySelector(".model-curve")).toBeNull();
  });

  it("Suggest picks Linear for a straight walk and Show Large opens the overlay", async () => {
    const { host } = await withCurrentRun();
    btn(host, "Select Window").click();
    btn(host, "Make Snapshot").click();
    btn(host, "Suggest").click();
    expect((host.querySelector("select") as HTMLSelectElement).value).toBe("linear");
    btn(host, "Show Large").click();
    expect(host.querySelector(".show-large__eq")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(host.querySelector(".show-large")).toBeNull();
  });

  it("graph markers sit on the dense motion trace (precise), while the POINTS table stays rounded", async () => {
    // a walk whose representative-time positions are OFF the 0.5 grid, so a
    // rounded marker would visibly miss the trace
    const offGrid = makeMotionRun({
      id: "off",
      samplerHz: 25,
      source: "sensor",
      deviceLabel: null,
      stopReason: "ui",
      samples: Array.from({ length: 101 }, (_, i) =>
        makeMotionSample(i * 0.04, 0.37 + i * 0.04 * 0.11),
      ),
    });
    const { host } = await withRun(offGrid);
    btn(host, "Select Window").click();
    btn(host, "Make Snapshot").click();

    const traceD = host.querySelector(".motion-trace")!.getAttribute("d")!;
    const markers = [...host.querySelectorAll(".marker")] as SVGCircleElement[];
    expect(markers).toHaveLength(5);
    for (const m of markers) {
      const cx = Number(m.getAttribute("cx"));
      const cy = Number(m.getAttribute("cy"));
      // the marker lies on the trace polyline at its own x (same pixel space)
      expect(Math.abs(cy - pathYAt(traceD, cx))).toBeLessThan(0.6);
    }

    // POINTS table shows rounded classroom coordinates + the caption
    host.querySelector<HTMLButtonElement>(".snapshot-points__header")!.click();
    const ys = [...host.querySelectorAll(".snapshot-points__table td")]
      .filter((_, i) => i % 2 === 1)
      .map((td) => td.textContent);
    expect(ys.every((v) => /\.0$|\.5$/.test(v!))).toBe(true);
    expect(host.querySelector(".snapshot-points__caption")!.textContent).toMatch(/rounded to the nearest 0\.5/);
  });

  it("loads a saved run with no controller run; never mutates it", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const adapter = new FakeSensorAdapter();
    const controller = new AcquisitionController(adapter);
    vi.spyOn(controller, "lastCompletedRun").mockReturnValue(null);
    const runStore = new MemoryRunStore();
    const stored = serializeRun(linearWalk("saved-7"), 1_000);
    await runStore.save(stored);
    const snapshotBefore = JSON.stringify(stored);

    mountSnapshotLabView(host, { controller, runStore, navigate: vi.fn(), runId: "saved-7" });
    await flush();
    expect(host.querySelector(".snapshot-mode__name")!.textContent).toBe("Raw Run");
    btn(host, "Select Window").click();
    btn(host, "Make Snapshot").click();
    btn(host, "Suggest").click();
    expect(JSON.stringify(await runStore.get("saved-7"))).toBe(snapshotBefore);
  });
});
