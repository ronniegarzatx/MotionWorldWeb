import type { AcquisitionController } from "../../acquisition/acquisition-controller.js";
import type { Route } from "../../app/router.js";
import type { RunStore } from "../../store/run-store.js";
import { deserializeRun } from "../../model/stored-run.js";
import type { MotionRun } from "../../model/motion-run.js";
import { activeSamples, fullWindow, windowDurationSeconds } from "../../model/analysis-window.js";
import type { MotionDirection } from "../../model/rate-analysis.js";
import {
  initialViewport,
  reduceViewport,
  zoomedXDomain,
  zoomedYDomain,
  type SpeedViewport,
} from "../../model/speed-viewport.js";
import {
  SPEED_LIMIT_PRESETS_MPH,
  type SpeedLimitComparison,
} from "../../model/speed-limit.js";
import {
  setSpeedLimit,
  setSpeedWindow,
  startSpeedWorkspace,
  useAllSpeed,
  type SpeedWorkspace,
} from "../../model/speed-workspace.js";
import { mountChart, type ChartHandle, type ChartInput } from "../chart/time-series-chart.js";
import { createFrameScheduler } from "../raf.js";
import { button, el } from "../components/dom.js";
import { mountSpeedExplainerOverlay } from "./speed-explainer-overlay.js";

export interface SpeedLabDeps {
  readonly controller: AcquisitionController;
  readonly runStore: RunStore;
  readonly navigate: (route: Route, param?: string) => void;
  readonly runId?: string;
}

const DIRECTION_PHRASE: Record<MotionDirection, string> = {
  away: "Away from the sensor",
  toward: "Toward the sensor",
  stationary: "Not moving",
};

function limitLine(c: SpeedLimitComparison): string {
  if (c.standing === "at") return `right at the ${c.limitMph} mph limit`;
  return `${c.marginMph.toFixed(1)} mph ${c.standing} the ${c.limitMph} mph limit`;
}

export function mountSpeedLabView(host: HTMLElement, deps: SpeedLabDeps): () => void {
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
      if (disposed) return;
      if (ui.state === "MEASURING") showScreen(() => renderCollecting());
    }),
    deps.controller.subscribeRunComplete((run) => {
      if (disposed) return;
      showScreen(() => renderWorkspace(run));
    }),
  );

  start();

  // ── empty ────────────────────────────────────────────────────────────────
  function renderEmpty(): () => void {
    host.replaceChildren(
      el(
        "div",
        { className: "speed-empty" },
        el("p", { className: "speed-empty__head", textContent: "NO RUN TO MEASURE" }),
        el("p", {
          className: "snapshot-mode__copy",
          textContent: "Collect a run with the sensor, or open one from your saved runs.",
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
        { className: "speed-lab speed-lab--collecting" },
        el("span", { className: "walk-head__title", textContent: "Speed Lab" }),
        el("p", {
          className: "speed-collecting",
          textContent: "Collecting… the speed result appears when you press Stop.",
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
    let ws: SpeedWorkspace = startSpeedWorkspace(run);
    // the graph viewport is a THIRD concept, separate from the run and the
    // AnalysisWindow — a fresh workspace always starts on the full run.
    let viewport: SpeedViewport = initialViewport();
    let intervalOpen = false;
    let overlayTeardown: (() => void) | null = null;
    let removeOutsideClose: (() => void) | null = null;

    const fullBounds = fullWindow(run);
    const windowIsFull = (): boolean =>
      Math.abs(ws.window.startSeconds - fullBounds.startSeconds) < 1e-9 &&
      Math.abs(ws.window.endSeconds - fullBounds.endSeconds) < 1e-9;

    const chartHost = el("div", { className: "chart-host" });
    const deck = el("div", { className: "speed-deck" });
    const resultSlot = el("div", { className: "speed-result" });

    host.replaceChildren(
      el(
        "div",
        { className: "speed-lab" },
        el(
          "div",
          { className: "speed-lab__head" },
          el(
            "div",
            { className: "speed-lab__intro" },
            el("span", { className: "walk-head__title", textContent: "Speed Lab" }),
            el("span", {
              className: "snapshot-mode__copy",
              textContent: "Position vs. time — drag the shaded band to choose the interval to measure.",
            }),
          ),
          resultSlot,
        ),
        deck,
        chartHost,
      ),
    );

    const chart: ChartHandle = mountChart(chartHost);

    const set = (next: SpeedWorkspace): void => {
      ws = next;
      render();
    };

    function closeInterval(): void {
      intervalOpen = false;
      removeOutsideClose?.();
      removeOutsideClose = null;
    }
    function toggleInterval(): void {
      if (intervalOpen) {
        closeInterval();
      } else {
        intervalOpen = true;
        const onDown = (e: Event): void => {
          const wrap = deck.querySelector(".speed-deck__interval");
          if (wrap && !wrap.contains(e.target as Node)) {
            closeInterval();
            render();
          }
        };
        document.addEventListener("mousedown", onDown);
        removeOutsideClose = () => document.removeEventListener("mousedown", onDown);
      }
      render();
    }

    function drawChart(): void {
      const samples = run.samples;
      const w = ws.window;
      const a = ws.analysis;
      const zoomed = viewport.mode === "window";

      let xDomain: ChartInput["xDomain"] = "auto-grow";
      let yDomain: ChartInput["yDomain"] = "auto";
      if (zoomed) {
        xDomain = zoomedXDomain(w);
        const ys = activeSamples(w, run).map((s) => s.positionMeters);
        if (a.ok) {
          ys.push(
            a.slopeMetersPerSecond * w.startSeconds + a.interceptMeters,
            a.slopeMetersPerSecond * w.endSeconds + a.interceptMeters,
          );
        }
        yDomain = zoomedYDomain(ys);
      }

      chart.update({
        series: {
          t: samples.map((s) => s.timestampSeconds),
          x: samples.map((s) => s.positionMeters),
        },
        xLabel: "Time (s)",
        yLabel: "Position (m)",
        xDomain,
        yDomain,
        selection: {
          startT: w.startSeconds,
          endT: w.endSeconds,
          editable: true,
          onChange: (r) => set(setSpeedWindow(ws, r.startT, r.endT)),
        },
        ...(a.ok
          ? {
              functionOverlay: (t: number) =>
                t >= w.startSeconds && t <= w.endSeconds
                  ? a.slopeMetersPerSecond * t + a.interceptMeters
                  : NaN,
            }
          : {}),
      });
    }

    /**
     * The compact top control deck. Everything is quiet by default; a control
     * only appears when it can do something useful (Use All / Zoom are hidden
     * when the window is already the whole run), and the precise Start/End
     * editor stays folded behind the interval readout.
     */
    function renderDeck(): void {
      deck.replaceChildren();

      // A. speed-limit segmented control
      const seg = el("div", { className: "speed-deck__seg" });
      seg.setAttribute("role", "group");
      seg.setAttribute("aria-label", "Speed limit");
      seg.append(el("span", { className: "speed-deck__seg-label", textContent: "LIMIT" }));
      for (const mph of SPEED_LIMIT_PRESETS_MPH) {
        const b = el("button", { className: "speed-seg__btn", textContent: String(mph) });
        b.setAttribute("aria-label", `${mph} mph limit`);
        b.setAttribute("aria-pressed", String(mph === ws.limitMph));
        b.addEventListener("click", () => set(setSpeedLimit(ws, mph)));
        seg.append(b);
      }
      deck.append(seg);

      // B / C. interval readout — folds open into the precise editor
      const intervalWrap = el("div", { className: "speed-deck__interval" });
      const toggle = el("button", { className: "speed-deck__interval-toggle" });
      toggle.setAttribute("aria-expanded", String(intervalOpen));
      toggle.setAttribute("aria-label", "Edit the measured interval");
      toggle.append(
        el("span", { className: "speed-deck__interval-label", textContent: "WINDOW" }),
        el("span", {
          className: "speed-deck__interval-value",
          textContent: `${ws.window.startSeconds.toFixed(2)}–${ws.window.endSeconds.toFixed(2)} s`,
        }),
        el("span", { className: "speed-deck__chev", textContent: intervalOpen ? "▾" : "▸" }),
      );
      toggle.addEventListener("click", toggleInterval);
      intervalWrap.append(toggle);

      if (intervalOpen) {
        const editor = el(
          "div",
          { className: "speed-deck__editor" },
          stepper("Start", ws.window.startSeconds, (v) =>
            set(setSpeedWindow(ws, v, ws.window.endSeconds)),
          ),
          stepper("End", ws.window.endSeconds, (v) =>
            set(setSpeedWindow(ws, ws.window.startSeconds, v)),
          ),
        );
        if (!windowIsFull()) {
          editor.append(
            button({
              label: "Use all",
              onClick: () => {
                closeInterval();
                // window == full run afterwards → least-surprising viewport is "full"
                viewport = reduceViewport(viewport, { type: "use-all" });
                set(useAllSpeed(ws));
              },
            }),
          );
        }
        intervalWrap.append(editor);
      }
      deck.append(intervalWrap);

      // D. viewport toggle — contextual (nothing to zoom to at full run)
      if (viewport.mode === "window") {
        const b = el("button", { className: "speed-deck__zoom", textContent: "Full run" });
        b.setAttribute("aria-pressed", "true");
        b.setAttribute("aria-label", "Show the full run");
        b.addEventListener("click", () => {
          viewport = reduceViewport(viewport, { type: "full-run" });
          render();
        });
        deck.append(b);
      } else if (!windowIsFull()) {
        const b = el("button", { className: "speed-deck__zoom", textContent: "Zoom" });
        b.setAttribute("aria-pressed", "false");
        b.setAttribute("aria-label", "Zoom the graph to the selected window");
        b.addEventListener("click", () => {
          viewport = reduceViewport(viewport, { type: "zoom-to-window" });
          render();
        });
        deck.append(b);
      }

      // E. compact "how was this calculated?" trigger
      if (ws.analysis.ok) {
        const calc = el("button", { className: "speed-deck__calc", textContent: "Δ" });
        calc.setAttribute("aria-label", "How was this speed calculated?");
        calc.setAttribute("title", "How was this speed calculated?");
        calc.addEventListener("click", openExplainer);
        deck.append(calc);
      }
    }

    function renderResult(): void {
      const a = ws.analysis;
      if (!a.ok) {
        resultSlot.replaceChildren(
          el("p", { className: "speed-result__head", textContent: "YOUR SPEED" }),
          el("p", { className: "speed-result__reason", textContent: a.reason }),
        );
        return;
      }
      resultSlot.replaceChildren(
        el(
          "div",
          { className: "speed-result__row" },
          el("span", { className: "speed-result__head", textContent: "YOUR SPEED" }),
          el("span", { className: "speed-result__value", textContent: `${a.speedMilesPerHour.toFixed(1)} mph` }),
        ),
        el("p", { className: "speed-result__direction", textContent: DIRECTION_PHRASE[a.direction] }),
      );
    }

    function openExplainer(): void {
      const a = ws.analysis;
      if (!a.ok) return;
      overlayTeardown?.();
      overlayTeardown = mountSpeedExplainerOverlay(host, {
        endpoint: ws.endpoint,
        ols: {
          slopeMetersPerSecond: a.slopeMetersPerSecond,
          interceptMeters: a.interceptMeters,
          rSquared: a.rSquared,
          sampleCount: a.sampleCount,
        },
        speedMetersPerSecond: a.speedMetersPerSecond,
        speedMilesPerHour: a.speedMilesPerHour,
        direction: a.direction,
        limitLine: ws.comparison ? limitLine(ws.comparison) : null,
        intervalSeconds: windowDurationSeconds(ws.window),
        onClose: () => {
          overlayTeardown?.();
          overlayTeardown = null;
        },
      });
    }

    function render(): void {
      renderDeck();
      renderResult();
      drawChart();
    }

    render();

    return () => {
      overlayTeardown?.();
      removeOutsideClose?.();
      chart.destroy();
      host.replaceChildren();
    };
  }

  function stepper(label: string, value: number, onSet: (v: number) => void): HTMLElement {
    return el(
      "span",
      { className: "snapshot-step" },
      el("span", { className: "stat__label", textContent: label }),
      button({ label: "−", onClick: () => onSet(value - 0.2) }),
      el("span", { className: "snapshot-selected", textContent: `${value.toFixed(2)} s` }),
      button({ label: "+", onClick: () => onSet(value + 0.2) }),
    );
  }

  return () => {
    disposed = true;
    teardownScreen?.();
    for (const c of cleanup) c();
    host.replaceChildren();
  };
}
