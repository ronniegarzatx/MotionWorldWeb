// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcquisitionController } from "../../src/acquisition/acquisition-controller.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import { MemoryRunStore } from "../../src/store/memory-run-store.js";
import { serializeRun } from "../../src/model/stored-run.js";
import { makeMotionRun, type MotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import { mountSequenceLabView } from "../../src/ui/sequence/sequence-lab-view.js";

const flush = () => new Promise((r) => setTimeout(r, 0));
const G = 9.8;

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

const btn = (host: HTMLElement, label: string): HTMLButtonElement =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement;
const seg = (host: HTMLElement, aria: string): HTMLButtonElement =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${aria}"]`)!;
const rangeToggle = (host: HTMLElement): HTMLButtonElement | null =>
  host.querySelector<HTMLButtonElement>(".speed-deck__interval-toggle");

function bounceRun(id: string, { h1 = 0.9, r = 0.72, ref = 0.15, bounces = 6, dt = 0.01 } = {}): MotionRun {
  const samples: { t: number; x: number }[] = [];
  let t = 0;
  for (let k = 0; k <= bounces; k++) {
    const apex = h1 * r ** k;
    const dur = 2 * Math.sqrt((2 * apex) / G);
    const steps = Math.max(4, Math.round(dur / dt));
    for (let s = 0; s < steps; s++) {
      const tau = (s / steps) * dur;
      samples.push({ t, x: ref + Math.max(0, apex - 0.5 * G * (tau - dur / 2) ** 2) });
      t += dt;
    }
  }
  for (let s = 0; s < 140; s++) {
    samples.push({ t, x: ref });
    t += dt;
  }
  return makeMotionRun({
    id,
    samplerHz: 100,
    source: "sensor",
    deviceLabel: null,
    stopReason: "ui",
    samples: samples.map((s) => makeMotionSample(s.t, s.x)),
  });
}

function pendulumRun(id: string, { A0 = 0.3, decay = 0.03, T = 1.4, midline = 0.5, n = 900, dt = 0.02 } = {}): MotionRun {
  return makeMotionRun({
    id,
    samplerHz: Math.round(1 / dt),
    source: "sensor",
    deviceLabel: null,
    stopReason: "ui",
    samples: Array.from({ length: n }, (_, i) => {
      const tt = i * dt;
      return makeMotionSample(tt, midline + A0 * Math.exp(-decay * tt) * Math.cos((2 * Math.PI * tt) / T));
    }),
  });
}

async function withRun(run: MotionRun | null, opts: { runId?: string; runStore?: MemoryRunStore } = {}) {
  const hostEl = document.createElement("div");
  document.body.append(hostEl);
  const adapter = new FakeSensorAdapter({ sampleHz: 50 });
  const controller = new AcquisitionController(adapter, { samplerHz: 50 });
  vi.spyOn(controller, "lastCompletedRun").mockReturnValue(run);
  const runStore = opts.runStore ?? new MemoryRunStore();
  const navigate = vi.fn();
  const teardown = mountSequenceLabView(hostEl, {
    controller,
    runStore,
    navigate,
    ...(opts.runId ? { runId: opts.runId } : {}),
  });
  await flush();
  return { host: hostEl, controller, runStore, navigate, teardown };
}

describe("sequence-lab-view — no run", () => {
  it("empty state offers connect + saved runs", async () => {
    const { host, navigate } = await withRun(null);
    expect(host.querySelector(".speed-empty__head")!.textContent).toMatch(/NO RUN/i);
    btn(host, "Open saved runs").click();
    expect(navigate).toHaveBeenCalledWith("runs");
  });
});

describe("sequence-lab-view — bounce (default)", () => {
  it("opens in Bounce mode with a dual graph and a COMMON RATIO headline", async () => {
    const { host } = await withRun(bounceRun("b"));
    expect(seg(host, "Bounce mode").getAttribute("aria-pressed")).toBe("true");
    expect(seg(host, "Pendulum mode").getAttribute("aria-pressed")).toBe("false");
    // no pendulum-only controls yet
    expect(host.querySelector('button[aria-label="Amplitude measure"]')).toBeNull();

    const titles = [...host.querySelectorAll(".sequence-graph__title")].map((t) => t.textContent);
    expect(titles).toContain("RAW MOTION");
    expect(titles).toContain("BOUNCE HEIGHT SEQUENCE");

    // raw graph: trace + bounce markers + dashed reference line
    const raw = host.querySelectorAll(".sequence-graph")[0]!;
    expect(raw.querySelector(".trace")!.getAttribute("d")).toMatch(/^M /);
    expect(raw.querySelectorAll(".marker").length).toBeGreaterThanOrEqual(4);
    expect(raw.querySelector(".target")).not.toBeNull();

    // sequence graph: n axis + discrete markers
    const terms = host.querySelectorAll(".sequence-graph")[1]!;
    expect([...terms.querySelectorAll(".axis-title")].map((t) => t.textContent)).toContain("n");
    expect(terms.querySelectorAll(".marker").length).toBeGreaterThanOrEqual(4);

    expect(host.querySelector(".sequence-result__label")!.textContent).toBe("COMMON RATIO");
    expect(host.querySelector(".sequence-result__value")!.textContent).toMatch(/r ≈ 0\.\d\d/);
    expect(host.querySelector(".sequence-result__status")!.textContent).toMatch(/RATIO/);
  });

  it("SENSITIVITY reruns detection on the same run without recollecting", async () => {
    const { host, controller } = await withRun(bounceRun("b", { bounces: 7 }));
    const calls = (controller.lastCompletedRun as ReturnType<typeof vi.fn>).mock.calls.length;
    const before = host.querySelectorAll(".sequence-graph")[0]!.querySelectorAll(".marker").length;
    seg(host, "High sensitivity").click();
    expect(seg(host, "High sensitivity").getAttribute("aria-pressed")).toBe("true");
    const after = host.querySelectorAll(".sequence-graph")[0]!.querySelectorAll(".marker").length;
    expect(after).toBeGreaterThanOrEqual(before); // reran; count did not drop
    // no new run pulled from the controller
    expect((controller.lastCompletedRun as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
  });

  it("term-range readout is collapsed by default, expands to steppers, Use all is contextual", async () => {
    const { host } = await withRun(bounceRun("b"));
    expect(rangeToggle(host)!.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelectorAll(".snapshot-step")).toHaveLength(0);
    expect(btn(host, "Use all")).toBeUndefined(); // full range → no Use all

    rangeToggle(host)!.click();
    expect(host.querySelectorAll(".snapshot-step").length).toBeGreaterThanOrEqual(2);
    // trim the end by one → excluded terms become muted, not deleted
    const endStep = [...host.querySelectorAll(".snapshot-step")].find((s) => s.textContent?.startsWith("End"))!;
    endStep.querySelector("button")!.click(); // "−"
    expect(btn(host, "Use all")).toBeTruthy();
    const termsGraph = host.querySelectorAll(".sequence-graph")[1]!;
    expect(termsGraph.querySelectorAll(".marker--muted").length).toBeGreaterThan(0);
    btn(host, "Use all").click();
    expect(host.querySelectorAll(".marker--muted")).toHaveLength(0);
  });
});

describe("sequence-lab-view — pendulum", () => {
  it("switching to Pendulum reveals AMPLITUDE | PERIOD and derives the sequences", async () => {
    const { host } = await withRun(pendulumRun("p"));
    seg(host, "Pendulum mode").click();
    expect(seg(host, "Amplitude measure")).toBeTruthy();
    expect(seg(host, "Amplitude measure").getAttribute("aria-pressed")).toBe("true");

    const titles = () => [...host.querySelectorAll(".sequence-graph__title")].map((t) => t.textContent);
    expect(titles()).toContain("TURNING-POINT AMPLITUDE");
    expect(host.querySelector(".sequence-result__label")!.textContent).toBe("AMPLITUDE RATIO");
    // pendulum raw graph carries a second (minima) marker set + a midline
    const raw = host.querySelectorAll(".sequence-graph")[0]!;
    expect(raw.querySelectorAll(".marker--alt").length).toBeGreaterThan(0);
    expect(raw.querySelector(".target")).not.toBeNull();

    seg(host, "Period measure").click();
    expect(titles()).toContain("PERIOD SEQUENCE");
    expect(host.querySelector(".sequence-result__label")!.textContent).toBe("AVERAGE PERIOD");
    expect(host.querySelector(".sequence-result__value")!.textContent).toMatch(/T ≈ 1\.\d\d s/);
    expect([...host.querySelectorAll(".axis-title")].map((t) => t.textContent)).toContain("Period (s)");
  });

  it("a too-short run shows an honest failure, mode + sensitivity still usable", async () => {
    const { host } = await withRun(pendulumRun("short", { n: 70 }));
    seg(host, "Pendulum mode").click();
    expect(host.querySelector(".sequence-result__reason")!.textContent).toMatch(/swings/i);
    expect(host.querySelector(".sequence-graphs--single")).not.toBeNull();
    // controls still respond
    seg(host, "High sensitivity").click();
    expect(seg(host, "High sensitivity").getAttribute("aria-pressed")).toBe("true");
    seg(host, "Bounce mode").click();
    expect(seg(host, "Bounce mode").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("sequence-lab-view — sources", () => {
  it("analyses a saved run with no sensor and never writes back", async () => {
    const store = new MemoryRunStore();
    const stored = serializeRun(bounceRun("saved-seq"), 1_000);
    await store.save(stored);
    const before = JSON.stringify(stored);
    const saveSpy = vi.spyOn(store, "save");
    const { host } = await withRun(null, { runId: "saved-seq", runStore: store });
    expect(host.querySelector(".sequence-result__value")).not.toBeNull();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(await store.get("saved-seq"))).toBe(before);
  });

  it("MEASURING on mount shows a collecting placeholder; a completed run then analyses", async () => {
    const hostEl = document.createElement("div");
    document.body.append(hostEl);
    const adapter = new FakeSensorAdapter({ sampleHz: 50 });
    const controller = new AcquisitionController(adapter, { samplerHz: 50 });
    vi.spyOn(controller, "uiState", "get").mockReturnValue({ ...controller.uiState, state: "MEASURING" });
    let runCompleteCb: ((r: MotionRun) => void) | undefined;
    const realSub = controller.subscribeRunComplete.bind(controller);
    vi.spyOn(controller, "subscribeRunComplete").mockImplementation((cb) => {
      runCompleteCb = cb as typeof runCompleteCb;
      return realSub(cb);
    });
    mountSequenceLabView(hostEl, { controller, runStore: new MemoryRunStore(), navigate: vi.fn() });
    await flush();
    expect(hostEl.querySelector(".speed-collecting")).not.toBeNull();
    runCompleteCb!(bounceRun("done"));
    await flush();
    expect(hostEl.querySelector(".sequence-result__value")).not.toBeNull();
  });

  it("teardown clears the host", async () => {
    const { host, teardown } = await withRun(bounceRun("b"));
    teardown();
    expect(host.children).toHaveLength(0);
  });
});
