import type { Route } from "../../app/router.js";
import type { RunStore } from "../../store/run-store.js";
import { deserializeRun, type StoredRun } from "../../model/stored-run.js";
import {
  fullWindow,
  windowDurationSeconds,
  withEnd,
  withStart,
  type AnalysisWindow,
} from "../../model/analysis-window.js";
import type { MotionRun } from "../../model/motion-run.js";
import { mountChart, type ChartHandle } from "../chart/time-series-chart.js";
import { button, el, stat } from "../components/dom.js";
import { formatDuration, formatSavedAt, interruptedLabel } from "./format.js";

export interface RunDetailDeps {
  readonly store: RunStore;
  readonly runId: string;
  readonly navigate: (route: Route, param?: string) => void;
  /** show a small AnalysisWindow start/end demo (developer only) */
  readonly debug?: boolean;
}

export function mountRunDetailView(host: HTMLElement, deps: RunDetailDeps): () => void {
  let disposed = false;
  let chart: ChartHandle | null = null;

  const root = el("div", { className: "run-detail" });
  host.append(root);

  const back = button({ label: "← Runs", variant: "ghost", onClick: () => deps.navigate("runs") });

  void deps.store.get(deps.runId).then((stored) => {
    if (disposed) return;
    if (!stored) {
      root.append(back, el("p", { textContent: "That run is no longer saved." }));
      return;
    }
    render(stored);
  });

  function render(stored: StoredRun): void {
    const run: MotionRun = deserializeRun(stored);
    let win: AnalysisWindow = fullWindow(run);

    const chartHost = el("div", { className: "chart-host" });
    const windowText = el("div", { className: "run-detail__window" });

    const interrupted = interruptedLabel(stored.stopReason);
    root.append(
      back,
      el(
        "div",
        { className: "run-detail__head" },
        el("h1", { textContent: "Saved run" }),
        interrupted
          ? el("span", { className: "run-row__chip", textContent: interrupted })
          : el("span", { className: "run-row__tag", textContent: "complete" }),
      ),
      chartHost,
      el(
        "div",
        { className: "stat-strip" },
        stat("Saved", formatSavedAt(stored.savedAtEpochMs)),
        stat("Duration", formatDuration(stored.durationSeconds)),
        stat("Samples", String(stored.sampleCount)),
      ),
      windowText,
    );

    chart = mountChart(chartHost);
    drawChart(run);

    const renderWindow = (): void => {
      windowText.textContent =
        `Analysis window: ${win.startSeconds.toFixed(2)}–${win.endSeconds.toFixed(2)} s ` +
        `(${windowDurationSeconds(win).toFixed(2)} s` +
        (win.startSeconds === fullWindow(run).startSeconds &&
        win.endSeconds === fullWindow(run).endSeconds
          ? ", full run)"
          : ")");
    };
    renderWindow();

    if (deps.debug) {
      const nudge = (fn: () => void) => () => {
        fn();
        renderWindow();
        drawChart(run, win);
      };
      root.append(
        el(
          "div",
          { className: "run-detail__debug" },
          el("span", { className: "diag", textContent: "AnalysisWindow (dev):" }),
          button({ label: "start +0.5", onClick: nudge(() => (win = withStart(win, run, win.startSeconds + 0.5))) }),
          button({ label: "start −0.5", onClick: nudge(() => (win = withStart(win, run, win.startSeconds - 0.5))) }),
          button({ label: "end +0.5", onClick: nudge(() => (win = withEnd(win, run, win.endSeconds + 0.5))) }),
          button({ label: "end −0.5", onClick: nudge(() => (win = withEnd(win, run, win.endSeconds - 0.5))) }),
          button({ label: "full", onClick: nudge(() => (win = fullWindow(run))) }),
        ),
      );
    }
  }

  function drawChart(run: MotionRun, win?: AnalysisWindow): void {
    chart?.update({
      series: {
        t: run.samples.map((s) => s.timestampSeconds),
        x: run.samples.map((s) => s.positionMeters),
      },
      xLabel: "Time (s)",
      yLabel: "Position (m)",
      xDomain: "auto-grow",
      yDomain: "auto",
      ...(win ? { selection: { startT: win.startSeconds, endT: win.endSeconds } } : {}),
    });
  }

  return () => {
    disposed = true;
    chart?.destroy();
    root.remove();
  };
}
