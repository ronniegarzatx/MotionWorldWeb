import type {
  AcquisitionController,
  AcquisitionUiState,
} from "../../acquisition/acquisition-controller.js";
import type { MotionRun } from "../../model/motion-run.js";
import type { MotionSample } from "../../sensor/types.js";
import { mountChart, type ChartHandle } from "../chart/time-series-chart.js";
import { createFrameScheduler, type FrameScheduler } from "../raf.js";
import { el, stat } from "../components/dom.js";

export interface LiveLabDeps {
  readonly controller: AcquisitionController;
  /** test seam — a synchronous flusher stands in for requestAnimationFrame. */
  readonly scheduler?: FrameScheduler;
}

export function mountLiveLabView(host: HTMLElement, deps: LiveLabDeps): () => void {
  const { controller } = deps;
  const scheduler = deps.scheduler ?? createFrameScheduler();

  const chartHost = el("div", { className: "chart-host" });
  const elapsedStat = stat("Elapsed", "0.00 s");
  const positionStat = stat("Position", "—");
  const countStat = stat("Samples", "0");
  const strip = el("div", { className: "stat-strip" }, elapsedStat, positionStat, countStat);

  host.append(el("div", { className: "live-lab" }, chartHost, strip));

  const chart: ChartHandle = mountChart(chartHost);

  // t[] / x[] for the currently displayed trace (live buffer or a frozen run).
  let t: number[] = [];
  let x: number[] = [];
  let frozen = false;

  const setStrip = (): void => {
    const n = t.length;
    countStat.querySelector(".stat__value")!.textContent = String(n);
    if (n === 0) {
      elapsedStat.querySelector(".stat__value")!.textContent = "0.00 s";
      positionStat.querySelector(".stat__value")!.textContent = "—";
      return;
    }
    elapsedStat.querySelector(".stat__value")!.textContent = `${(t[n - 1]! - t[0]!).toFixed(2)} s`;
    positionStat.querySelector(".stat__value")!.textContent = `${x[n - 1]!.toFixed(3)} m`;
  };

  const draw = (): void => {
    chart.update({
      series: { t, x },
      xLabel: "Time (s)",
      yLabel: "Position (m)",
      xDomain: "auto-grow",
      yDomain: "auto",
    });
    setStrip();
  };

  const loadSamples = (samples: readonly MotionSample[]): void => {
    t = samples.map((s) => s.timestampSeconds);
    x = samples.map((s) => s.positionMeters);
  };

  // ── restore on mount ────────────────────────────────────────────────────
  if (controller.uiState.state === "MEASURING") {
    loadSamples(controller.currentRunSamples());
    frozen = false;
  } else {
    const last = controller.lastCompletedRun();
    if (last) {
      loadSamples(last.samples);
      frozen = true;
    }
  }
  draw();

  // ── live wiring ─────────────────────────────────────────────────────────
  const unsubs = [
    controller.subscribeUiState((ui: AcquisitionUiState) => {
      if (ui.state === "MEASURING" && frozen) {
        // a fresh run is starting — clear the frozen trace
        t = [];
        x = [];
        frozen = false;
        scheduler.schedule(draw);
      }
    }),
    controller.subscribeSample((s: MotionSample) => {
      if (frozen) return;
      t.push(s.timestampSeconds);
      x.push(s.positionMeters);
      scheduler.schedule(draw);
    }),
    controller.subscribeRunComplete((run: MotionRun) => {
      loadSamples(run.samples);
      frozen = true;
      scheduler.schedule(draw);
    }),
  ];

  return () => {
    for (const u of unsubs) u();
    scheduler.cancel();
    chart.destroy();
    host.replaceChildren();
  };
}
