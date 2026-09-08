import type { AcquisitionController } from "../../acquisition/acquisition-controller.js";
import type { Route } from "../../app/router.js";
import type { RunStore } from "../../store/run-store.js";
import { deserializeRun } from "../../model/stored-run.js";
import type { MotionRun } from "../../model/motion-run.js";
import { classroomDomain } from "../../model/classroom-snapshot.js";
import {
  FAMILY_LABEL,
  MODEL_FAMILIES,
  isFitFailure,
  predict,
  type ModelFamily,
} from "../../model/model-fit.js";
import {
  classroomExpression,
  preciseExpression,
} from "../../model/classroom-equation.js";
import {
  changeWindow,
  makeSnapshot,
  runFit,
  runSuggest,
  selectWindow,
  setFamily,
  setPointCount,
  setWindowRange,
  startWorkspace,
  useAll,
  type SnapshotWorkspace,
} from "../../model/snapshot-workspace.js";
import { mountChart, type ChartHandle } from "../chart/time-series-chart.js";
import { button, el } from "../components/dom.js";
import { mountEquationDisplay } from "./equation-display.js";
import { mountShowLargeOverlay } from "./show-large-overlay.js";
import { mountPointsDrawer, type PointsDrawerHandle } from "./points-drawer.js";

export interface SnapshotLabDeps {
  readonly controller: AcquisitionController;
  readonly runStore: RunStore;
  readonly navigate: (route: Route, param?: string) => void;
  readonly runId?: string;
}

export function mountSnapshotLabView(host: HTMLElement, deps: SnapshotLabDeps): () => void {
  let disposed = false;
  let cleanup: (() => void)[] = [];

  const resolveRun = async (): Promise<MotionRun | null> => {
    if (deps.runId) {
      const stored = await deps.runStore.get(deps.runId);
      return stored ? deserializeRun(stored) : null;
    }
    return deps.controller.lastCompletedRun();
  };

  void resolveRun().then((run) => {
    if (disposed) return;
    if (!run) {
      renderEmpty();
      return;
    }
    renderWorkspace(run);
  });

  function renderEmpty(): void {
    host.replaceChildren(
      el(
        "div",
        { className: "snapshot-empty" },
        el("p", { className: "snapshot-empty__head", textContent: "NO RUN TO SNAPSHOT" }),
        el("p", {
          className: "snapshot-mode__copy",
          textContent: "Collect a run in Live Lab, or open one from your saved runs.",
        }),
        el(
          "div",
          { className: "row" },
          button({ label: "Go to Live Lab", variant: "primary", onClick: () => deps.navigate("live") }),
          button({ label: "Open Saved Runs", onClick: () => deps.navigate("runs") }),
        ),
      ),
    );
  }

  function renderWorkspace(run: MotionRun): void {
    let ws: SnapshotWorkspace = startWorkspace(run);

    const modeName = el("span", { className: "snapshot-mode__name" });
    const modeCopy = el("span", { className: "snapshot-mode__copy" });
    const chartHost = el("div", { className: "chart-host" });
    const legendSlot = el("div", { className: "snapshot-legend" });
    const controls = el("div", { className: "snapshot-controls" });
    const modelRow = el("div", { className: "snapshot-model" });
    const equationSlot = el("div", { className: "snapshot-equation" });
    const pointsSlot = el("div", { className: "snapshot-points-slot" });

    host.replaceChildren(
      el(
        "div",
        { className: "snapshot-lab" },
        el(
          "div",
          { className: "snapshot-mode" },
          el("span", { className: "walk-head__title", textContent: "Snapshot Lab" }),
          modeName,
          modeCopy,
        ),
        chartHost,
        legendSlot,
        controls,
        modelRow,
        equationSlot,
        pointsSlot,
      ),
    );

    const chart: ChartHandle = mountChart(chartHost);
    let pointsDrawer: PointsDrawerHandle | null = null;
    let teardownEquation: (() => void) | null = null;
    let teardownShowLarge: (() => void) | null = null;
    cleanup.push(() => {
      chart.destroy();
      pointsDrawer?.destroy();
      teardownEquation?.();
      teardownShowLarge?.();
    });

    const set = (next: SnapshotWorkspace): void => {
      ws = next;
      render();
    };

    function drawChart(): void {
      if (ws.mode === "raw") {
        legendSlot.replaceChildren();
        chart.update({
          series: {
            t: ws.run.samples.map((s) => s.timestampSeconds),
            x: ws.run.samples.map((s) => s.positionMeters),
          },
          xLabel: "Time (s)",
          yLabel: "Position (m)",
          xDomain: "auto-grow",
          yDomain: "auto",
          ...(ws.window
            ? {
                selection: {
                  startT: ws.window.startSeconds,
                  endT: ws.window.endSeconds,
                  editable: true,
                  onChange: (r) => set(setWindowRange(ws, r.startT, r.endT)),
                },
              }
            : {}),
        });
        return;
      }
      const snap = ws.snapshot!;
      const d = classroomDomain(snap);
      const fit = ws.fit && !isFitFailure(ws.fit) ? ws.fit : null;
      chart.update({
        series: { t: [], x: [] },
        motionTrace: {
          x: snap.tracePoints.map((p) => p.x),
          y: snap.tracePoints.map((p) => p.y),
        },
        // the GRAPH markers use the precise/unrounded representative points so
        // they sit exactly on the dense motion trace; the POINTS table shows the
        // rounded classroom coordinates.
        markers: snap.fitPoints.map((p) => ({ t: p.x, x: p.y })),
        markerRadius: 6,
        xLabel: "Classroom x",
        yLabel: "Classroom y",
        xDomain: d.x,
        yDomain: d.y,
        ...(fit
          ? { functionOverlay: (x: number) => predict(fit.family, fit.coefficients, x) }
          : {}),
      });
      renderLegend(fit !== null);
    }

    function renderLegend(hasModel: boolean): void {
      legendSlot.replaceChildren(
        el("span", { className: "snapshot-legend__item snapshot-legend__motion", textContent: "Motion" }),
        el("span", { className: "snapshot-legend__item snapshot-legend__points", textContent: "Points" }),
        ...(hasModel
          ? [el("span", { className: "snapshot-legend__item snapshot-legend__model", textContent: "Model" })]
          : []),
        el("span", {
          className: "snapshot-legend__note",
          textContent: "Points on the graph are exact; the Points table rounds to the nearest 0.5.",
        }),
      );
    }

    function render(): void {
      modeName.textContent = ws.mode === "raw" ? "Raw Run" : "Classroom Snapshot";
      modeCopy.textContent =
        ws.mode === "raw"
          ? "Original position vs. time. Your measured data is never changed."
          : "Selected interval rescaled to classroom x/y coordinates for modeling.";

      // ── controls ──────────────────────────────────────────────
      controls.replaceChildren();
      if (ws.mode === "raw") {
        if (!ws.window) {
          controls.append(button({ label: "Select Window", variant: "primary", onClick: () => set(selectWindow(ws)) }));
        } else {
          const w = ws.window;
          controls.append(
            el("span", {
              className: "snapshot-selected",
              textContent: `Selected: ${w.startSeconds.toFixed(2)} s → ${w.endSeconds.toFixed(2)} s`,
            }),
            stepper("Start", w.startSeconds, (v) => set(setWindowRange(ws, v, w.endSeconds))),
            stepper("End", w.endSeconds, (v) => set(setWindowRange(ws, w.startSeconds, v))),
            button({ label: "Use All", onClick: () => set(useAll(ws)) }),
            button({ label: "Make Snapshot", variant: "primary", onClick: () => set(makeSnapshot(ws)) }),
          );
        }
      } else {
        controls.append(
          button({ label: "Change Window", onClick: () => set(changeWindow(ws)) }),
          countStepper(ws.pointCount, (n) => set(setPointCount(ws, n))),
        );
      }

      // ── model row + equation ──────────────────────────────────
      modelRow.replaceChildren();
      equationSlot.replaceChildren();
      teardownEquation?.();
      teardownEquation = null;

      if (ws.mode === "snapshot") {
        const select = el("select", { className: "btn" });
        select.append(el("option", { value: "", textContent: "Choose model…" }));
        for (const fam of MODEL_FAMILIES) {
          const o = el("option", { value: fam, textContent: FAMILY_LABEL[fam] });
          if (fam === ws.family) o.selected = true;
          select.append(o);
        }
        select.addEventListener("change", () => {
          const v = select.value as ModelFamily | "";
          set(v ? runFit(setFamily(ws, v)) : setFamily(ws, "constant"));
        });
        modelRow.append(
          el("span", { className: "snapshot-selected", textContent: "MODEL" }),
          select,
          button({ label: "Suggest", onClick: () => set(runSuggest(ws)) }),
        );

        if (ws.fit) {
          if (isFitFailure(ws.fit)) {
            equationSlot.append(
              el("p", { className: "snapshot-mode__copy", textContent: ws.fit.reason }),
            );
          } else {
            const fit = ws.fit;
            teardownEquation = mountEquationDisplay(equationSlot, {
              classroom: classroomExpression(fit.family, fit.coefficients),
              precise: preciseExpression(fit.family, fit.coefficients),
              rSquared: fit.rSquared,
              family: fit.family,
            });
            modelRow.append(
              button({
                label: "Show Large",
                onClick: () => {
                  teardownShowLarge?.();
                  teardownShowLarge = mountShowLargeOverlay(host, {
                    classroom: classroomExpression(fit.family, fit.coefficients),
                    precise: preciseExpression(fit.family, fit.coefficients),
                    rSquared: fit.rSquared,
                    family: fit.family,
                    onClose: () => {
                      teardownShowLarge?.();
                      teardownShowLarge = null;
                    },
                  });
                },
              }),
            );
          }
        }
      }

      // ── points drawer ─────────────────────────────────────────
      if (ws.mode === "snapshot" && ws.snapshot) {
        if (!pointsDrawer) {
          pointsSlot.replaceChildren();
          pointsDrawer = mountPointsDrawer(pointsSlot, ws.snapshot.points);
        } else {
          pointsDrawer.update(ws.snapshot.points);
        }
      } else if (pointsDrawer) {
        pointsDrawer.destroy();
        pointsDrawer = null;
        pointsSlot.replaceChildren();
      }

      drawChart();
    }

    render();
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

  function countStepper(count: number, onSet: (n: number) => void): HTMLElement {
    return el(
      "span",
      { className: "snapshot-step" },
      el("span", { className: "stat__label", textContent: "Points" }),
      button({ label: "−", onClick: () => onSet(count - 1) }),
      el("span", { className: "snapshot-selected", textContent: String(count) }),
      button({ label: "+", onClick: () => onSet(count + 1) }),
    );
  }

  return () => {
    disposed = true;
    for (const c of cleanup) c();
    cleanup = [];
    host.replaceChildren();
  };
}
