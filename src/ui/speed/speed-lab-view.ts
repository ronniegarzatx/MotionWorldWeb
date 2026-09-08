import type { AcquisitionController } from "../../acquisition/acquisition-controller.js";
import type { Route } from "../../app/router.js";
import type { RunStore } from "../../store/run-store.js";
import { deserializeRun } from "../../model/stored-run.js";
import type { MotionRun } from "../../model/motion-run.js";
import { windowDurationSeconds } from "../../model/analysis-window.js";
import type { MotionDirection } from "../../model/rate-analysis.js";
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
import { mountChart, type ChartHandle } from "../chart/time-series-chart.js";
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
    let overlayTeardown: (() => void) | null = null;

    const chartHost = el("div", { className: "chart-host" });
    const controls = el("div", { className: "speed-controls" });
    const resultSlot = el("div", { className: "speed-result" });
    const limitsSlot = el("div", { className: "speed-limits" });

    host.replaceChildren(
      el(
        "div",
        { className: "speed-lab" },
        el(
          "div",
          { className: "snapshot-mode" },
          el("span", { className: "walk-head__title", textContent: "Speed Lab" }),
          el("span", {
            className: "snapshot-mode__copy",
            textContent: "Position vs. time. Drag the shaded band to choose the interval to measure.",
          }),
        ),
        chartHost,
        controls,
        resultSlot,
        limitsSlot,
      ),
    );

    const chart: ChartHandle = mountChart(chartHost);

    const set = (next: SpeedWorkspace): void => {
      ws = next;
      render();
    };

    function drawChart(): void {
      const samples = run.samples;
      const w = ws.window;
      const a = ws.analysis;
      chart.update({
        series: {
          t: samples.map((s) => s.timestampSeconds),
          x: samples.map((s) => s.positionMeters),
        },
        xLabel: "Time (s)",
        yLabel: "Position (m)",
        xDomain: "auto-grow",
        yDomain: "auto",
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

    function renderControls(): void {
      controls.replaceChildren(
        button({ label: "Use all", onClick: () => set(useAllSpeed(ws)) }),
        stepper("Start", ws.window.startSeconds, (v) =>
          set(setSpeedWindow(ws, v, ws.window.endSeconds)),
        ),
        stepper("End", ws.window.endSeconds, (v) =>
          set(setSpeedWindow(ws, ws.window.startSeconds, v)),
        ),
      );
    }

    function renderResult(): void {
      resultSlot.replaceChildren(el("p", { className: "speed-result__head", textContent: "YOUR SPEED" }));
      const a = ws.analysis;
      if (!a.ok) {
        resultSlot.append(el("p", { className: "speed-result__reason", textContent: a.reason }));
        return;
      }
      const sign = a.slopeMetersPerSecond >= 0 ? "+" : "−";
      resultSlot.append(
        el("p", { className: "speed-result__value", textContent: `${a.speedMilesPerHour.toFixed(1)} mph` }),
        el("p", { className: "speed-result__direction", textContent: DIRECTION_PHRASE[a.direction] }),
        ...(ws.comparison
          ? [el("p", { className: "speed-result__limit", textContent: limitLine(ws.comparison) })]
          : []),
        el("p", {
          className: "speed-result__velocity",
          textContent: `Velocity: ${sign}${Math.abs(a.speedMetersPerSecond).toFixed(2)} m/s`,
        }),
        el("p", {
          className: "speed-result__provenance",
          textContent:
            `best-fit r² = ${Math.max(0, a.rSquared).toFixed(2)} · ` +
            `${a.sampleCount} samples over ${windowDurationSeconds(ws.window).toFixed(2)} s`,
        }),
        button({
          label: "How was this speed calculated?",
          onClick: () => {
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
              onClose: () => {
                overlayTeardown?.();
                overlayTeardown = null;
              },
            });
          },
        }),
      );
    }

    function renderLimits(): void {
      limitsSlot.replaceChildren(el("span", { className: "speed-limits__label", textContent: "SPEED LIMIT" }));
      for (const mph of SPEED_LIMIT_PRESETS_MPH) {
        const b = button({ label: `${mph} mph`, onClick: () => set(setSpeedLimit(ws, mph)) });
        b.setAttribute("aria-pressed", String(mph === ws.limitMph));
        if (mph === ws.limitMph) b.classList.add("btn--primary");
        limitsSlot.append(b);
      }
    }

    function render(): void {
      renderControls();
      renderResult();
      renderLimits();
      drawChart();
    }

    render();

    return () => {
      overlayTeardown?.();
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
