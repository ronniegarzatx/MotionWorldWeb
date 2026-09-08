// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcquisitionController } from "../../src/acquisition/acquisition-controller.js";
import { FakeSensorAdapter } from "../../src/sensor/fake-sensor-adapter.js";
import { MemoryRunStore } from "../../src/store/memory-run-store.js";
import { serializeRun } from "../../src/model/stored-run.js";
import { makeMotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import { mountSpeedLabView } from "../../src/ui/speed/speed-lab-view.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

const btn = (host: HTMLElement, label: string): HTMLButtonElement =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement;

function pointer(type: string, init: { pointerId: number; clientX: number }): Event {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.clientX });
  Object.defineProperty(e, "pointerId", { value: init.pointerId });
  return e;
}

// linear walk: 1.0 -> 3.0 m over 4 s  (slope 0.5 m/s ≈ 1.12 mph, away)
const linearWalk = (id: string) =>
  makeMotionRun({
    id,
    samplerHz: 25,
    source: "sensor",
    deviceLabel: null,
    stopReason: "ui",
    samples: Array.from({ length: 101 }, (_, i) => makeMotionSample(i * 0.04, 1.0 + i * 0.04 * 0.5)),
  });

// steep for the first 2 s, nearly flat after — the window matters
const kinkedWalk = (id: string) =>
  makeMotionRun({
    id,
    samplerHz: 25,
    source: "sensor",
    deviceLabel: null,
    stopReason: "ui",
    samples: Array.from({ length: 101 }, (_, i) => {
      const t = i * 0.04;
      return makeMotionSample(t, t < 2 ? 1 + t * 1.5 : 1 + 3 + (t - 2) * 0.05);
    }),
  });

async function withRun(run: ReturnType<typeof linearWalk>) {
  const host = document.createElement("div");
  document.body.append(host);
  const adapter = new FakeSensorAdapter({ sampleHz: 25 });
  const controller = new AcquisitionController(adapter, { samplerHz: 25 });
  vi.spyOn(controller, "lastCompletedRun").mockReturnValue(run);
  const runStore = new MemoryRunStore();
  const navigate = vi.fn();
  const teardown = mountSpeedLabView(host, { controller, runStore, navigate });
  await flush();
  return { host, controller, runStore, navigate, teardown };
}

describe("speed-lab-view — no run", () => {
  it("empty state offers connect + saved runs", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const adapter = new FakeSensorAdapter();
    const controller = new AcquisitionController(adapter);
    vi.spyOn(controller, "lastCompletedRun").mockReturnValue(null);
    const connect = vi.spyOn(controller, "connect").mockResolvedValue(undefined);
    const navigate = vi.fn();
    mountSpeedLabView(host, { controller, runStore: new MemoryRunStore(), navigate });
    await flush();
    expect(host.querySelector(".speed-empty__head")).not.toBeNull();
    btn(host, "Open saved runs").click();
    expect(navigate).toHaveBeenCalledWith("runs");
    btn(host, "Connect sensor").click();
    expect(connect).toHaveBeenCalled();
  });
});

const follows = (a: Element, b: Element): boolean =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("speed-lab-view — a run", () => {
  it("main screen shows only YOUR SPEED, the mph value and the direction", async () => {
    const { host } = await withRun(linearWalk("cur"));
    expect(host.querySelector(".speed-result__head")!.textContent).toMatch(/YOUR SPEED/i);
    expect(host.querySelector(".speed-result__value")!.textContent).toMatch(/mph/);
    expect(host.querySelector(".speed-result__direction")!.textContent).toMatch(/Away from (the )?sensor/i);
    // the supporting detail has moved into the modal — not on the main screen
    expect(host.querySelector(".speed-result__velocity")).toBeNull();
    expect(host.querySelector(".speed-result__provenance")).toBeNull();
    expect(host.querySelector(".speed-result__limit")).toBeNull();
    expect(host.textContent).not.toMatch(/Velocity:/);
    expect(host.textContent).not.toMatch(/r² = /);
    expect(host.textContent).not.toMatch(/\bsamples\b/);
    expect(host.textContent).not.toMatch(/mph limit/);
    expect(host.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("puts the speed result above the graph, then interval controls, then the bottom row", async () => {
    const { host } = await withRun(linearWalk("cur"));
    const result = host.querySelector(".speed-result")!;
    const chart = host.querySelector(".chart-host")!;
    const controls = host.querySelector(".speed-controls")!;
    const limits = host.querySelector(".speed-limits")!;
    const calc = btn(host, "How was this speed calculated?");
    expect(follows(result, chart)).toBe(true);
    expect(follows(chart, controls)).toBe(true);
    expect(follows(controls, limits)).toBe(true);
    // speed-limit presets and the calculation button share the bottom row
    expect(host.querySelector(".speed-lab__bottom")!.contains(limits)).toBe(true);
    expect(host.querySelector(".speed-lab__bottom")!.contains(calc)).toBe(true);
  });

  it("keeps the speed-limit presets and the calculation button visible on the main screen", async () => {
    const { host } = await withRun(linearWalk("cur"));
    for (const mph of [2, 5, 10]) expect(btn(host, `${mph} mph`)).toBeTruthy();
    expect(btn(host, "How was this speed calculated?")).toBeTruthy();
  });

  it("draws one best-fit line, confined to the selection band", async () => {
    const { host } = await withRun(linearWalk("cur"));
    const curves = host.querySelectorAll(".model-curve");
    expect(curves).toHaveLength(1);
    const nums = (host.querySelector(".model-curve")!.getAttribute("d")!.match(/-?\d+\.\d+/g) ?? []).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const band = host.querySelector(".selection-band")!;
    const bx = Number(band.getAttribute("x"));
    const bw = Number(band.getAttribute("width"));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(bx - 1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(bx + bw + 1);
  });

  it("speed-limit presets: 5 selected by default; picking 2 mph moves the selection", async () => {
    const { host } = await withRun(linearWalk("cur")); // ~1.12 mph
    expect(btn(host, "5 mph").getAttribute("aria-pressed")).toBe("true");
    btn(host, "2 mph").click();
    expect(btn(host, "2 mph").getAttribute("aria-pressed")).toBe("true");
    expect(btn(host, "5 mph").getAttribute("aria-pressed")).toBe("false");
    // the chosen limit surfaces in the calculation modal
    btn(host, "How was this speed calculated?").click();
    expect(host.textContent).toMatch(/2 mph limit/);
  });

  it("editing the selection recomputes the headline speed", async () => {
    const { host } = await withRun(kinkedWalk("cur"));
    const before = host.querySelector(".speed-result__value")!.textContent;
    const ch = host.querySelector(".chart-host") as HTMLElement;
    const hit = host.querySelector(".sel-handle-hit-end") as SVGElement;
    hit.dispatchEvent(pointer("pointerdown", { pointerId: 1, clientX: 700 }));
    ch.dispatchEvent(pointer("pointermove", { pointerId: 1, clientX: 420 }));
    ch.dispatchEvent(pointer("pointerup", { pointerId: 1, clientX: 420 }));
    await flush();
    expect(host.querySelector(".speed-result__value")!.textContent).not.toBe(before);
  });

  it("opens the calculation overlay with all the moved supporting detail, then closes", async () => {
    const { host } = await withRun(linearWalk("cur"));
    btn(host, "How was this speed calculated?").click();
    const modal = host.querySelector(".show-large")!;
    expect(modal).not.toBeNull();
    expect(modal.textContent).toMatch(/best[- ]fit/i); // OLS explanation
    expect(modal.textContent).toMatch(/r² = /); // r²
    expect(modal.textContent).toMatch(/\bsamples\b/); // sample count
    expect(modal.textContent).toMatch(/m\/s/); // signed velocity
    expect(modal.textContent).toMatch(/mph limit/); // speed-limit comparison
    expect(modal.querySelector(".speed-explain__hero")).not.toBeNull();
    // slope formula (hero) comes before the OLS explanation
    const hero = modal.querySelector(".speed-explain__hero")!;
    const ols = modal.querySelector(".speed-explain__ols")!;
    expect(follows(hero, ols)).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(host.querySelector(".show-large")).toBeNull();
  });

  it("the calculation modal handles a too-short interval (endpoint slope omitted)", async () => {
    // a run where the full window works but a pinched interval can't do two points
    const { host } = await withRun(linearWalk("cur"));
    btn(host, "How was this speed calculated?").click();
    // baseline: two-point section present for the full window
    expect(host.querySelector(".speed-explain__twopoint")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });

  it("a saved run renders offline and is never written back", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const adapter = new FakeSensorAdapter();
    const controller = new AcquisitionController(adapter);
    vi.spyOn(controller, "lastCompletedRun").mockReturnValue(null);
    const runStore = new MemoryRunStore();
    const stored = serializeRun(linearWalk("saved-9"), 1_000);
    await runStore.save(stored);
    const before = JSON.stringify(stored);
    const saveSpy = vi.spyOn(runStore, "save");

    mountSpeedLabView(host, { controller, runStore, navigate: vi.fn(), runId: "saved-9" });
    await flush();
    expect(host.querySelector(".speed-result__value")).not.toBeNull();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(await runStore.get("saved-9"))).toBe(before);
  });

  it("a degenerate window shows a plain reason, not NaN", async () => {
    const flat = makeMotionRun({
      id: "flat",
      samplerHz: 25,
      source: "sensor",
      deviceLabel: null,
      stopReason: "ui",
      samples: [makeMotionSample(0, 1), makeMotionSample(0, 1)],
    });
    const { host } = await withRun(flat);
    expect(host.textContent).not.toMatch(/NaN|Infinity/);
    expect(host.querySelector(".speed-result__reason")).not.toBeNull();
  });
});
