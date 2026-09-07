import type { AcquisitionController } from "../../acquisition/acquisition-controller.js";
import {
  WALK_TARGETS,
  nextIndex,
  prevIndex,
  targetIndexById,
} from "../../model/walk-target.js";
import type { MotionSample } from "../../sensor/types.js";
import { mountChart } from "../chart/time-series-chart.js";
import { createFrameScheduler, type FrameScheduler } from "../raf.js";
import { button, el } from "../components/dom.js";
import { mountTargetPicker } from "./target-picker.js";

/** The current target persists across navigation (mandatory). Module scope keeps
 *  it without new state architecture; a completed trace is intentionally not
 *  preserved (optional for M1.5). */
let lastTargetIndex = 0;

export interface WalkTheLineDeps {
  readonly controller: AcquisitionController;
  /** test seam — a synchronous flusher stands in for requestAnimationFrame. */
  readonly scheduler?: FrameScheduler;
}

export function mountWalkTheLineView(host: HTMLElement, deps: WalkTheLineDeps): () => void {
  const { controller } = deps;
  const scheduler = deps.scheduler ?? createFrameScheduler();

  let targetIndex = Math.min(lastTargetIndex, WALK_TARGETS.length - 1);
  let studentT: number[] = [];
  let studentX: number[] = [];
  let frozen = false;
  let wasMeasuring = controller.uiState.state === "MEASURING";
  let pickerTeardown: (() => void) | null = null;

  const targetName = el("span", { className: "walk-head__target" });
  const prompt = el("span", { className: "walk-head__prompt" });
  const chartHost = el("div", { className: "chart-host" });

  const prevBtn = button({ label: "Previous", onClick: () => setTarget(prevIndex(targetIndex)) });
  const changeBtn = button({ label: "Change Target", onClick: openPicker });
  const nextBtn = button({ label: "Next", onClick: () => setTarget(nextIndex(targetIndex)) });
  const runAgainBtn = button({
    label: "Run Again",
    variant: "primary",
    onClick: () => {
      clearStudent();
      renderChrome();
      draw();
    },
  });
  runAgainBtn.hidden = true;

  const legend = el(
    "div",
    { className: "walk-legend" },
    el("span", { className: "k-target", textContent: "Target" }),
    el("span", { className: "k-you", textContent: "You" }),
  );

  host.append(
    el(
      "div",
      { className: "walk-lab" },
      el(
        "div",
        { className: "walk-head" },
        el("span", { className: "walk-head__title", textContent: "Walk the Line" }),
        targetName,
        el("span", {
          className: "walk-head__hint",
          textContent:
            "Match the target graph with your motion. Move toward or away from the sensor to trace the shape.",
        }),
        prompt,
      ),
      chartHost,
      el("div", { className: "walk-nav" }, prevBtn, changeBtn, nextBtn, runAgainBtn, legend),
    ),
  );

  const chart = mountChart(chartHost);

  const currentTarget = () => WALK_TARGETS[targetIndex]!;

  function draw(): void {
    const tgt = currentTarget();
    chart.update({
      series: { t: studentT, x: studentX },
      target: {
        t: tgt.points.map((p) => p.timeSeconds),
        x: tgt.points.map((p) => p.positionMeters),
      },
      xLabel: "Time (s)",
      yLabel: "Position (m)",
      xDomain: [0, tgt.durationSeconds],
      yDomain: tgt.positionRange,
    });
  }

  function renderChrome(): void {
    const measuring = controller.uiState.state === "MEASURING";
    targetName.textContent = currentTarget().title;
    prompt.textContent = currentTarget().prompt ?? "";
    prevBtn.disabled = measuring;
    nextBtn.disabled = measuring;
    changeBtn.disabled = measuring;
    runAgainBtn.hidden = !frozen;
  }

  function clearStudent(): void {
    studentT = [];
    studentX = [];
    frozen = false;
  }

  function setTarget(index: number): void {
    if (controller.uiState.state === "MEASURING") return; // blocked while collecting
    targetIndex = index;
    lastTargetIndex = index;
    clearStudent();
    renderChrome();
    draw();
  }

  function openPicker(): void {
    if (controller.uiState.state === "MEASURING") return;
    if (pickerTeardown) return;
    pickerTeardown = mountTargetPicker(host, {
      currentId: currentTarget().id,
      onPick: (id) => {
        const i = targetIndexById(id);
        if (i >= 0) setTarget(i);
      },
      onClose: () => {
        pickerTeardown?.();
        pickerTeardown = null;
      },
    });
  }

  // restore a live trace if we re-entered mid-collection
  if (wasMeasuring) {
    const s = controller.currentRunSamples();
    studentT = s.map((x) => x.timestampSeconds);
    studentX = s.map((x) => x.positionMeters);
  }

  const unsubs = [
    controller.subscribeUiState((ui) => {
      const measuring = ui.state === "MEASURING";
      if (measuring && !wasMeasuring) {
        clearStudent();
        scheduler.schedule(draw);
      }
      wasMeasuring = measuring;
      renderChrome();
    }),
    controller.subscribeSample((s: MotionSample) => {
      if (frozen) return;
      studentT.push(s.timestampSeconds);
      studentX.push(s.positionMeters);
      scheduler.schedule(draw);
    }),
    controller.subscribeRunComplete((run) => {
      studentT = run.samples.map((s) => s.timestampSeconds);
      studentX = run.samples.map((s) => s.positionMeters);
      frozen = true;
      renderChrome();
      scheduler.schedule(draw);
    }),
  ];

  renderChrome();
  draw();

  return () => {
    pickerTeardown?.();
    for (const u of unsubs) u();
    scheduler.cancel();
    chart.destroy();
    host.replaceChildren();
  };
}
