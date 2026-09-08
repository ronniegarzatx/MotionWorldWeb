import type { AcquisitionController } from "../../acquisition/acquisition-controller.js";
import type { Route } from "../../app/router.js";
import type { RunStore } from "../../store/run-store.js";
import { deserializeRun } from "../../model/stored-run.js";
import type { MotionRun } from "../../model/motion-run.js";
import { SEQUENCE_SENSITIVITIES, type Sensitivity } from "../../model/cycle-analysis.js";
import {
  rangeIsFull,
  setMode,
  setPendulumMeasure,
  setRangeEnd,
  setRangeStart,
  setSensitivity,
  startSequenceWorkspace,
  useAllRange,
  type SequenceWorkspace,
} from "../../model/sequence-workspace.js";
import { mountChart, type ChartHandle, type ChartInput } from "../chart/time-series-chart.js";
import { createFrameScheduler } from "../raf.js";
import { button, el } from "../components/dom.js";

export interface SequenceLabDeps {
  readonly controller: AcquisitionController;
  readonly runStore: RunStore;
  readonly navigate: (route: Route, param?: string) => void;
  readonly runId?: string;
}

const SENS_LABEL: Record<Sensitivity, string> = { low: "Low", standard: "Standard", high: "High" };

export function mountSequenceLabView(host: HTMLElement, deps: SequenceLabDeps): () => void {
  let disposed = false;
  const cleanup: (() => void)[] = [];

  const resolveRun = async (): Promise<MotionRun | null> => {
    if (deps.runId) {
      const stored = await deps.runStore.get(deps.runId);
      return stored ? deserializeRun(stored) : null;
    }
    return deps.controller.lastCompletedRun();
  };

  let teardownScreen: (() => void) | null = null;
  const showScreen = (mount: () => () => void): void => {
    teardownScreen?.();
    teardownScreen = mount();
  };

  const start = (): void => {
    if (deps.controller.uiState.state === "MEASURING") {
      showScreen(() => renderCollecting());
      return;
    }
    void resolveRun().then((run) => {
      if (disposed) return;
      showScreen(() => (run ? renderWorkspace(run) : renderEmpty()));
    });
  };

  cleanup.push(
    deps.controller.subscribeUiState((ui) => {
      if (!disposed && ui.state === "MEASURING") showScreen(() => renderCollecting());
    }),
    deps.controller.subscribeRunComplete((run) => {
      if (!disposed) showScreen(() => renderWorkspace(run));
    }),
  );

  start();

  // ── empty ────────────────────────────────────────────────────────────────
  function renderEmpty(): () => void {
    host.replaceChildren(
      el(
        "div",
        { className: "speed-empty" },
        el("p", { className: "speed-empty__head", textContent: "NO RUN TO SEQUENCE" }),
        el("p", {
          className: "snapshot-mode__copy",
          textContent: "Collect a bounce or a pendulum swing, or open a saved run.",
        }),
        el(
          "div",
          { className: "row" },
          button({
            label: "Connect sensor",
            variant: "primary",
            onClick: () => void deps.controller.connect().catch(() => {}),
          }),
          button({ label: "Open saved runs", onClick: () => deps.navigate("runs") }),
        ),
      ),
    );
    return () => host.replaceChildren();
  }

  // ── collecting ───────────────────────────────────────────────────────────
  function renderCollecting(): () => void {
    const chartHost = el("div", { className: "chart-host" });
    host.replaceChildren(
      el(
        "div",
        { className: "sequence-lab sequence-lab--collecting" },
        el("span", { className: "walk-head__title", textContent: "Sequence Lab" }),
        el("p", {
          className: "speed-collecting",
          textContent: "Collecting… the sequence appears when you press Stop.",
        }),
        chartHost,
      ),
    );
    const chart = mountChart(chartHost);
    const scheduler = createFrameScheduler();
    const draw = (): void => {
      const s = deps.controller.currentRunSamples();
      chart.update({
        series: { t: s.map((x) => x.timestampSeconds), x: s.map((x) => x.positionMeters) },
        xLabel: "Time (s)",
        yLabel: "Position (m)",
        xDomain: "auto-grow",
        yDomain: "auto",
      });
    };
    draw();
    const unsub = deps.controller.subscribeSample(() => scheduler.schedule(draw));
    return () => {
      unsub();
      scheduler.cancel();
      chart.destroy();
      host.replaceChildren();
    };
  }

  // ── workspace ────────────────────────────────────────────────────────────
  function renderWorkspace(run: MotionRun): () => void {
    let ws: SequenceWorkspace = startSequenceWorkspace(run);
    let rangeOpen = false;
    let removeOutside: (() => void) | null = null;

    const deck = el("div", { className: "speed-deck seq-deck" });
    const resultSlot = el("div", { className: "sequence-result speed-result" });
    const rawHost = el("div", { className: "chart-host" });
    const termsHost = el("div", { className: "chart-host sequence-terms-chart" });
    const graphs = el(
      "div",
      { className: "sequence-graphs" },
      el(
        "div",
        { className: "sequence-graph" },
        el("span", { className: "sequence-graph__title", textContent: "RAW MOTION" }),
        rawHost,
      ),
      el(
        "div",
        { className: "sequence-graph sequence-graph--terms" },
        el("span", { className: "sequence-graph__title sequence-graph__title--terms" }),
        termsHost,
      ),
    );

    host.replaceChildren(
      el(
        "div",
        { className: "sequence-lab" },
        el(
          "div",
          { className: "speed-lab__head" },
          el(
            "div",
            { className: "speed-lab__intro" },
            el("span", { className: "walk-head__title", textContent: "Sequence Lab" }),
            el("span", {
              className: "snapshot-mode__copy",
              textContent: "Real repeating motion → a sequence you can inspect by index n.",
            }),
          ),
          resultSlot,
        ),
        deck,
        graphs,
      ),
    );

    const rawChart: ChartHandle = mountChart(rawHost);
    const termsChart: ChartHandle = mountChart(termsHost);

    const set = (next: SequenceWorkspace): void => {
      ws = next;
      render();
    };

    function closeRange(): void {
      rangeOpen = false;
      removeOutside?.();
      removeOutside = null;
    }
    function toggleRange(): void {
      if (rangeOpen) {
        closeRange();
      } else {
        rangeOpen = true;
        const onDown = (e: Event): void => {
          const wrap = deck.querySelector(".speed-deck__interval");
          if (wrap && !wrap.contains(e.target as Node)) {
            closeRange();
            render();
          }
        };
        document.addEventListener("mousedown", onDown);
        removeOutside = () => document.removeEventListener("mousedown", onDown);
      }
      render();
    }

    function segButton(
      label: string,
      ariaLabel: string,
      pressed: boolean,
      onClick: () => void,
    ): HTMLButtonElement {
      const b = el("button", { className: "speed-seg__btn", textContent: label });
      b.setAttribute("aria-label", ariaLabel);
      b.setAttribute("aria-pressed", String(pressed));
      b.addEventListener("click", onClick);
      return b;
    }

    function segment(labelText: string, ...buttons: HTMLButtonElement[]): HTMLElement {
      const seg = el("div", { className: "speed-deck__seg" });
      seg.setAttribute("role", "group");
      seg.setAttribute("aria-label", labelText);
      seg.append(el("span", { className: "speed-deck__seg-label", textContent: labelText }), ...buttons);
      return seg;
    }

    function intStepper(label: string, value: number, onSet: (v: number) => void): HTMLElement {
      return el(
        "span",
        { className: "snapshot-step" },
        el("span", { className: "stat__label", textContent: label }),
        button({ label: "−", onClick: () => onSet(value - 1) }),
        el("span", { className: "snapshot-selected", textContent: String(value) }),
        button({ label: "+", onClick: () => onSet(value + 1) }),
      );
    }

    function renderDeck(): void {
      deck.replaceChildren();

      deck.append(
        segment(
          "MODE",
          segButton("Bounce", "Bounce mode", ws.mode === "bounce", () => set(setMode(ws, "bounce"))),
          segButton("Pendulum", "Pendulum mode", ws.mode === "pendulum", () => set(setMode(ws, "pendulum"))),
        ),
      );

      if (ws.mode === "pendulum") {
        deck.append(
          segment(
            "MEASURE",
            segButton(
              "Amplitude",
              "Amplitude measure",
              ws.pendulumMeasure === "amplitude",
              () => set(setPendulumMeasure(ws, "amplitude")),
            ),
            segButton(
              "Period",
              "Period measure",
              ws.pendulumMeasure === "period",
              () => set(setPendulumMeasure(ws, "period")),
            ),
          ),
        );
      }

      deck.append(
        segment(
          "SENS",
          ...SEQUENCE_SENSITIVITIES.map((s) =>
            segButton(SENS_LABEL[s], `${SENS_LABEL[s]} sensitivity`, ws.sensitivity === s, () =>
              set(setSensitivity(ws, s)),
            ),
          ),
        ),
      );

      // term-range readout — only meaningful when there is a series
      if (ws.analysis.ok && ws.analysis.fullTermCount > 0) {
        const rangeWord =
          ws.mode === "bounce" ? "BOUNCES" : ws.pendulumMeasure === "period" ? "PERIODS" : "TERMS";
        const wrap = el("div", { className: "speed-deck__interval" });
        const toggle = el("button", { className: "speed-deck__interval-toggle" });
        toggle.setAttribute("aria-expanded", String(rangeOpen));
        toggle.setAttribute("aria-label", "Trim the analysed terms");
        toggle.append(
          el("span", { className: "speed-deck__interval-label", textContent: rangeWord }),
          el("span", {
            className: "speed-deck__interval-value",
            textContent: `${ws.range.start}–${ws.range.end}`,
          }),
          el("span", { className: "speed-deck__chev", textContent: rangeOpen ? "▾" : "▸" }),
        );
        toggle.addEventListener("click", toggleRange);
        wrap.append(toggle);

        if (rangeOpen) {
          const editor = el(
            "div",
            { className: "speed-deck__editor" },
            intStepper("Start", ws.range.start, (v) => set(setRangeStart(ws, v))),
            intStepper("End", ws.range.end, (v) => set(setRangeEnd(ws, v))),
          );
          if (!rangeIsFull(ws)) {
            editor.append(
              button({
                label: "Use all",
                onClick: () => {
                  closeRange();
                  set(useAllRange(ws));
                },
              }),
            );
          }
          wrap.append(editor);
        }
        deck.append(wrap);
      }
    }

    function renderResult(): void {
      const a = ws.analysis;
      resultSlot.replaceChildren(
        el("p", { className: "sequence-result__label speed-result__head", textContent: a.headline.label }),
      );
      if (!a.ok) {
        resultSlot.append(
          el("p", { className: "sequence-result__reason speed-result__reason", textContent: a.reason ?? "" }),
        );
        return;
      }
      resultSlot.append(
        el("p", { className: "sequence-result__value speed-result__value", textContent: a.headline.value }),
      );
      if (a.status) {
        resultSlot.append(el("p", { className: "sequence-result__status", textContent: a.status }));
      }
      if (a.formula) {
        resultSlot.append(el("p", { className: "sequence-result__formula", textContent: a.formula }));
      }
    }

    function drawRaw(): void {
      const a = ws.analysis;
      const t0 = run.samples[0]?.timestampSeconds ?? 0;
      const tN = run.samples.at(-1)?.timestampSeconds ?? 0;
      const input: ChartInput = {
        series: {
          t: run.samples.map((s) => s.timestampSeconds),
          x: run.samples.map((s) => s.positionMeters),
        },
        xLabel: "Time (s)",
        yLabel: "Position (m)",
        xDomain: "auto-grow",
        yDomain: "auto",
        markerRadius: 5,
      };
      const mk = (kind: (typeof a.rawMarkers)[number]["kind"] | "any") =>
        a.rawMarkers
          .filter((m) => kind === "any" || m.kind === kind)
          .map((m) => ({ t: m.timeSeconds, x: m.positionMeters, muted: !m.included }));

      if (ws.mode === "pendulum") {
        rawChart.update({
          ...input,
          markers: mk("max"),
          markersAlt: mk("min"),
          ...(a.referenceMeters !== null
            ? { target: { t: [t0, tN], x: [a.referenceMeters, a.referenceMeters] } }
            : {}),
        });
      } else {
        rawChart.update({
          ...input,
          markers: mk("any"),
          ...(a.referenceMeters !== null
            ? { target: { t: [t0, tN], x: [a.referenceMeters, a.referenceMeters] } }
            : {}),
        });
      }
    }

    function drawTerms(): void {
      const a = ws.analysis;
      const included = a.terms.filter((tm) => tm.included);
      termsChart.update({
        series: { t: included.map((tm) => tm.n), x: included.map((tm) => tm.value) },
        xLabel: "n",
        yLabel: a.yLabel,
        xDomain: [0.5, Math.max(1.5, a.fullTermCount + 0.5)],
        yDomain: "auto",
        markerRadius: 7,
        markers: a.terms.map((tm) => ({ t: tm.n, x: tm.value, muted: !tm.included })),
      });
    }

    function render(): void {
      renderDeck();
      renderResult();
      const single = !ws.analysis.ok;
      graphs.classList.toggle("sequence-graphs--single", single);
      (graphs.querySelector(".sequence-graph__title--terms") as HTMLElement).textContent =
        ws.mode === "bounce"
          ? "BOUNCE HEIGHT SEQUENCE"
          : ws.pendulumMeasure === "period"
            ? "PERIOD SEQUENCE"
            : "TURNING-POINT AMPLITUDE";
      drawRaw();
      if (!single) drawTerms();
    }

    render();

    return () => {
      removeOutside?.();
      rawChart.destroy();
      termsChart.destroy();
      host.replaceChildren();
    };
  }

  return () => {
    disposed = true;
    teardownScreen?.();
    for (const c of cleanup) c();
    host.replaceChildren();
  };
}
