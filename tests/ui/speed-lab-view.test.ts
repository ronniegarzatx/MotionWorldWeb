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

/** the x-axis numeric tick labels currently drawn on the chart */
const xTicks = (host: HTMLElement): number[] =>
  [...host.querySelectorAll(".tick-label")]
    .filter((t) => t.getAttribute("text-anchor") === "middle")
    .map((t) => Number(t.textContent))
    .filter((n) => Number.isFinite(n));

const byAria = (host: HTMLElement, label: string): HTMLButtonElement | null =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const limitBtn = (host: HTMLElement, mph: number): HTMLButtonElement =>
  byAria(host, `${mph} mph limit`)!;
const calcBtn = (host: HTMLElement): HTMLButtonElement =>
  byAria(host, "How was this speed calculated?")!;
const zoomBtn = (host: HTMLElement): HTMLButtonElement | null =>
  host.querySelector<HTMLButtonElement>(".speed-deck__zoom");
const intervalToggle = (host: HTMLElement): HTMLButtonElement =>
  host.querySelector<HTMLButtonElement>(".speed-deck__interval-toggle")!;

/** open the editor and trim the End inward by `steps` × 0.2 s (each click re-renders) */
const trimEnd = (host: HTMLElement, steps = 3): void => {
  if (intervalToggle(host).getAttribute("aria-expanded") !== "true") intervalToggle(host).click();
  for (let i = 0; i < steps; i++) {
    const end = [...host.querySelectorAll(".snapshot-step")].find((s) =>
      s.textContent?.startsWith("End"),
    )!;
    end.querySelector("button")!.click(); // the "−"
  }
};

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

  it("the projector-compact result reads YOUR SPEED + value on one row, direction below", async () => {
    const { host } = await withRun(linearWalk("cur"));
    const row = host.querySelector(".speed-result__row")!;
    expect(row).not.toBeNull();
    expect(row.querySelector(".speed-result__head")).not.toBeNull();
    expect(row.querySelector(".speed-result__value")).not.toBeNull();
    // direction is a sibling of the row, not nested inside it
    const direction = host.querySelector(".speed-result__direction")!;
    expect(row.contains(direction)).toBe(false);
  });

  it("all controls sit in one deck above the graph — nothing below it", async () => {
    const { host } = await withRun(linearWalk("cur"));
    const lab = host.querySelector(".speed-lab")!;
    const deck = host.querySelector(".speed-deck")!;
    const chart = host.querySelector(".chart-host")!;
    expect(follows(deck, chart)).toBe(true);
    // the graph is the LAST child of the lab — no toolbar band beneath it
    expect(lab.children[lab.children.length - 1]).toBe(chart);
    // the old below-graph chrome is gone
    expect(host.querySelector(".speed-controls")).toBeNull();
    expect(host.querySelector(".speed-limits")).toBeNull();
    expect(host.querySelector(".speed-lab__bottom")).toBeNull();
    // every deck control is inside the deck
    expect(deck.contains(limitBtn(host, 5))).toBe(true);
    expect(deck.contains(calcBtn(host))).toBe(true);
    expect(deck.contains(intervalToggle(host))).toBe(true);
  });

  it("has a compact segmented speed-limit control (2 | 5 | 10), keyboard-accessible", async () => {
    const { host } = await withRun(linearWalk("cur"));
    const seg = host.querySelector(".speed-deck__seg")!;
    const btns = [...seg.querySelectorAll("button")];
    expect(btns.map((b) => b.textContent)).toEqual(["2", "5", "10"]);
    for (const b of btns) {
      expect(b.getAttribute("aria-pressed")).toMatch(/true|false/);
      expect(b.getAttribute("aria-label")).toMatch(/mph limit/);
    }
    expect(limitBtn(host, 5).getAttribute("aria-pressed")).toBe("true");
  });

  it("the interval readout is collapsed by default; Start/End steppers are hidden", async () => {
    const { host } = await withRun(linearWalk("cur"));
    expect(host.querySelector(".speed-deck__interval-value")!.textContent).toMatch(
      /\d+\.\d{2}–\d+\.\d{2} s/,
    );
    expect(intervalToggle(host).getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelectorAll(".snapshot-step")).toHaveLength(0);
  });

  it("clicking the interval readout reveals the Start/End editor", async () => {
    const { host } = await withRun(linearWalk("cur"));
    intervalToggle(host).click();
    expect(intervalToggle(host).getAttribute("aria-expanded")).toBe("true");
    const steppers = [...host.querySelectorAll(".snapshot-step")].map((s) => s.textContent);
    expect(steppers.some((t) => t?.startsWith("Start"))).toBe(true);
    expect(steppers.some((t) => t?.startsWith("End"))).toBe(true);
    // collapses again on a second click
    intervalToggle(host).click();
    expect(host.querySelectorAll(".snapshot-step")).toHaveLength(0);
  });

  it("graph drag handles keep working whether or not the editor is open", async () => {
    const { host } = await withRun(kinkedWalk("cur"));
    intervalToggle(host).click(); // editor open
    const before = host.querySelector(".speed-result__value")!.textContent;
    const ch = host.querySelector(".chart-host") as HTMLElement;
    const hit = host.querySelector(".sel-handle-hit-end") as SVGElement;
    hit.dispatchEvent(pointer("pointerdown", { pointerId: 1, clientX: 700 }));
    ch.dispatchEvent(pointer("pointermove", { pointerId: 1, clientX: 430 }));
    ch.dispatchEvent(pointer("pointerup", { pointerId: 1, clientX: 430 }));
    await flush();
    expect(host.querySelector(".speed-result__value")!.textContent).not.toBe(before);
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

  it("speed-limit segment: 5 selected by default; picking 2 moves the selection", async () => {
    const { host } = await withRun(linearWalk("cur")); // ~1.12 mph
    expect(limitBtn(host, 5).getAttribute("aria-pressed")).toBe("true");
    limitBtn(host, 2).click();
    expect(limitBtn(host, 2).getAttribute("aria-pressed")).toBe("true");
    expect(limitBtn(host, 5).getAttribute("aria-pressed")).toBe("false");
    // the chosen limit surfaces in the calculation modal
    calcBtn(host).click();
    expect(host.textContent).toMatch(/2 mph limit/);
  });

  it("the Δ button has an accessible calculation label and opens the existing modal", async () => {
    const { host } = await withRun(linearWalk("cur"));
    const calc = calcBtn(host);
    expect(calc.textContent).toBe("Δ");
    expect(calc.getAttribute("aria-label")).toBe("How was this speed calculated?");
    calc.click();
    const modal = host.querySelector(".show-large")!;
    expect(modal).not.toBeNull();
    expect(modal.textContent).toMatch(/best[- ]fit/i); // OLS explanation
    expect(modal.textContent).toMatch(/r² = /); // r²
    expect(modal.textContent).toMatch(/\bsamples\b/); // sample count
    expect(modal.textContent).toMatch(/m\/s/); // signed velocity
    expect(modal.textContent).toMatch(/mph limit/); // speed-limit comparison
    const hero = modal.querySelector(".speed-explain__hero")!;
    const ols = modal.querySelector(".speed-explain__ols")!;
    expect(follows(hero, ols)).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(host.querySelector(".show-large")).toBeNull();
  });

  // ── contextual Use All / Zoom ──────────────────────────────────────────
  it("Use All and Zoom are hidden while the window is the whole run", async () => {
    const { host } = await withRun(linearWalk("cur"));
    expect(zoomBtn(host)).toBeNull();
    intervalToggle(host).click(); // open the editor
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Use all")).toBe(false);
  });

  it("Use All appears once the window is trimmed, and restores the full run", async () => {
    const { host } = await withRun(linearWalk("cur"));
    trimEnd(host, 3); // window -> [0, 3.4]
    const useAll = [...host.querySelectorAll("button")].find((b) => b.textContent === "Use all")!;
    expect(useAll).toBeTruthy();
    useAll.click();
    expect(host.querySelector(".speed-deck__interval-value")!.textContent).toMatch(/0\.00–4\.00 s/);
    // Use All / Zoom recede again
    expect(zoomBtn(host)).toBeNull();
  });

  it("Zoom appears when trimmed; toggles to Full run; changes only the viewport", async () => {
    const { host } = await withRun(linearWalk("cur"));
    const fullMax = Math.max(...xTicks(host));
    trimEnd(host, 3); // window [0, 3.4], viewport still full
    const zoom = zoomBtn(host)!;
    expect(zoom.textContent).toBe("Zoom");

    zoom.click();
    expect(zoomBtn(host)!.textContent).toBe("Full run");
    const zoomTicks = xTicks(host);
    expect(Math.max(...zoomTicks)).toBeLessThanOrEqual(3.45); // viewport == window end
    // the window readout is unchanged by zooming
    expect(host.querySelector(".speed-deck__interval-value")!.textContent).toMatch(/0\.00–3\.40 s/);

    zoomBtn(host)!.click(); // Full run
    expect(zoomBtn(host)!.textContent).toBe("Zoom");
    expect(Math.max(...xTicks(host))).toBe(fullMax);
  });

  it("the OLS result is identical before zoom, while zoomed, and after Full run", async () => {
    const { host } = await withRun(kinkedWalk("cur"));
    trimEnd(host, 4); // trim so Zoom is available; window [0, 3.2]
    const snap = () => ({
      value: host.querySelector(".speed-result__value")!.textContent,
      dir: host.querySelector(".speed-result__direction")!.textContent,
      readout: host.querySelector(".speed-deck__interval-value")!.textContent,
    });
    const before = snap();
    zoomBtn(host)!.click();
    expect(snap()).toEqual(before);
    expect(host.querySelector(".model-curve")).not.toBeNull(); // OLS line still drawn
    zoomBtn(host)!.click();
    expect(snap()).toEqual(before);
  });

  it("editing the window while zoomed moves the viewport with it", async () => {
    const { host } = await withRun(linearWalk("cur"));
    trimEnd(host, 3); // [0, 3.4]
    zoomBtn(host)!.click(); // -> zoomed
    const beforeMax = Math.max(...xTicks(host));
    trimEnd(host, 4); // [0, ~2.6] — editor is still open
    expect(zoomBtn(host)!.textContent).toBe("Full run"); // still zoomed
    expect(Math.max(...xTicks(host))).toBeLessThan(beforeMax); // viewport followed
  });

  it("Use all while zoomed returns the viewport to the full run", async () => {
    const { host } = await withRun(linearWalk("cur"));
    trimEnd(host, 3);
    zoomBtn(host)!.click(); // zoom
    expect(zoomBtn(host)!.textContent).toBe("Full run");
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Use all")!.click();
    expect(zoomBtn(host)).toBeNull(); // window is full again -> nothing to zoom
    expect(Math.max(...xTicks(host))).toBeGreaterThan(4);
  });

  it("a new completed run resets the viewport to full run", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const adapter = new FakeSensorAdapter({ sampleHz: 25 });
    const controller = new AcquisitionController(adapter, { samplerHz: 25 });
    vi.spyOn(controller, "lastCompletedRun").mockReturnValue(linearWalk("first"));
    let runCompleteCb: ((r: ReturnType<typeof linearWalk>) => void) | undefined;
    const realSub = controller.subscribeRunComplete.bind(controller);
    vi.spyOn(controller, "subscribeRunComplete").mockImplementation((cb) => {
      runCompleteCb = cb as typeof runCompleteCb;
      return realSub(cb);
    });
    mountSpeedLabView(host, { controller, runStore: new MemoryRunStore(), navigate: vi.fn() });
    await flush();
    trimEnd(host, 3);
    zoomBtn(host)!.click();
    expect(zoomBtn(host)!.textContent).toBe("Full run");

    runCompleteCb!(linearWalk("second"));
    await flush();
    expect(zoomBtn(host)).toBeNull(); // fresh run -> full window, full viewport
  });

  it("zoom works for a saved run with no sensor, without writing back", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const adapter = new FakeSensorAdapter();
    const controller = new AcquisitionController(adapter);
    vi.spyOn(controller, "lastCompletedRun").mockReturnValue(null);
    const runStore = new MemoryRunStore();
    await runStore.save(serializeRun(linearWalk("saved-z"), 1_000));
    const saveSpy = vi.spyOn(runStore, "save");
    mountSpeedLabView(host, { controller, runStore, navigate: vi.fn(), runId: "saved-z" });
    await flush();
    trimEnd(host, 3);
    zoomBtn(host)!.click();
    expect(zoomBtn(host)!.textContent).toBe("Full run");
    expect(host.querySelector(".model-curve")).not.toBeNull();
    expect(saveSpy).not.toHaveBeenCalled();
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
