import type { AcquisitionController } from "../../acquisition/acquisition-controller.js";
import {
  WALK_TARGETS,
  clampOffset,
  displayedPoints,
  nextIndex,
  offsetLimits,
  prevIndex,
  targetIndexById,
  targetOffsetLabel,
} from "../../model/walk-target.js";
import type { MotionSample } from "../../sensor/types.js";
import {
  metresPerPixelY,
  mountChart,
  type ChartHandle,
} from "../chart/time-series-chart.js";
import { createFrameScheduler, type FrameScheduler } from "../raf.js";
import { button, el } from "../components/dom.js";
import { mountTargetPicker } from "./target-picker.js";
import type { TargetOffsets } from "./target-offsets.js";

/** The current target persists across navigation (offsets persist too, in the
 *  injected TargetOffsets). A completed trace is intentionally not preserved. */
let lastTargetIndex = 0;

/** Test-only: reset the session-remembered target index. */
export function __resetWalkTargetIndex(): void {
  lastTargetIndex = 0;
}

const STEP_METERS = 0.5;
const SNAP_METERS = 0.1;

export interface WalkTheLineDeps {
  readonly controller: AcquisitionController;
  readonly offsets: TargetOffsets;
  /** test seam — a synchronous flusher stands in for requestAnimationFrame. */
  readonly scheduler?: FrameScheduler;
}

export function mountWalkTheLineView(host: HTMLElement, deps: WalkTheLineDeps): () => void {
  const { controller, offsets } = deps;
  const scheduler = deps.scheduler ?? createFrameScheduler();

  let targetIndex = Math.min(lastTargetIndex, WALK_TARGETS.length - 1);
  let studentT: number[] = [];
  let studentX: number[] = [];
  let frozen = false;
  let wasMeasuring = controller.uiState.state === "MEASURING";
  let pickerTeardown: (() => void) | null = null;
  let drag: { pointerId: number; startClientY: number; startOffset: number } | null = null;

  const measuring = () => controller.uiState.state === "MEASURING";
  const currentTarget = () => WALK_TARGETS[targetIndex]!;
  const offset = () => offsets.get(currentTarget().id);

  const targetName = el("span", { className: "walk-head__target" });
  const prompt = el("span", { className: "walk-head__prompt" });
  const chartHost = el("div", { className: "chart-host" });

  const prevBtn = button({ label: "Previous", onClick: () => setTarget(prevIndex(targetIndex)) });
  const changeBtn = button({ label: "Change Target", onClick: openPicker });
  const nextBtn = button({ label: "Next", onClick: () => setTarget(nextIndex(targetIndex)) });

  const minusBtn = button({ label: "− 0.5 m", onClick: () => nudge(-STEP_METERS) });
  const plusBtn = button({ label: "+ 0.5 m", onClick: () => nudge(+STEP_METERS) });
  const resetBtn = button({
    label: "Reset Position",
    variant: "ghost",
    onClick: () => {
      if (measuring()) return;
      offsets.reset(currentTarget().id);
      renderChrome();
      draw();
    },
  });
  const offsetLabel = el("span", { className: "walk-offset__label" });

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
      el(
        "div",
        { className: "walk-nav" },
        prevBtn,
        changeBtn,
        nextBtn,
        el(
          "span",
          { className: "walk-offset" },
          minusBtn,
          offsetLabel,
          plusBtn,
          resetBtn,
        ),
        runAgainBtn,
        legend,
      ),
    ),
  );

  const chart: ChartHandle = mountChart(chartHost);

  function draw(): void {
    const tgt = currentTarget();
    const pts = displayedPoints(tgt, offset());
    chart.update({
      series: { t: studentT, x: studentX },
      target: { t: pts.map((p) => p.timeSeconds), x: pts.map((p) => p.positionMeters) },
      xLabel: "Time (s)",
      yLabel: "Position (m)",
      xDomain: [0, tgt.durationSeconds],
      yDomain: tgt.positionRange, // FIXED — the offset never rescales the axes
      onTargetPointerDown: onTargetPointerDown,
    });
  }

  function renderChrome(): void {
    const m = measuring();
    const tgt = currentTarget();
    const limits = offsetLimits(tgt);
    const off = offset();
    targetName.textContent = tgt.title;
    prompt.textContent = tgt.prompt ?? "";
    offsetLabel.textContent = targetOffsetLabel(tgt, off);

    prevBtn.disabled = m;
    nextBtn.disabled = m;
    changeBtn.disabled = m;
    minusBtn.disabled = m || off <= limits.min + 1e-6;
    plusBtn.disabled = m || off >= limits.max - 1e-6;
    resetBtn.disabled = m || Math.abs(off) < 1e-9;
    runAgainBtn.hidden = !frozen;
  }

  function clearStudent(): void {
    studentT = [];
    studentX = [];
    frozen = false;
  }

  function setTarget(index: number): void {
    if (measuring()) return;
    targetIndex = index;
    lastTargetIndex = index;
    clearStudent();
    renderChrome();
    draw();
  }

  function nudge(deltaMeters: number): void {
    if (measuring()) return;
    const tgt = currentTarget();
    offsets.set(tgt.id, clampOffset(tgt, offset() + deltaMeters));
    renderChrome();
    draw();
  }

  // ── vertical drag ───────────────────────────────────────────────────────
  function onTargetPointerDown(e: PointerEvent): void {
    if (measuring()) return;
    drag = { pointerId: e.pointerId, startClientY: e.clientY, startOffset: offset() };
    if (typeof chartHost.setPointerCapture === "function") {
      try {
        chartHost.setPointerCapture(e.pointerId);
      } catch {
        /* jsdom / unsupported — fine */
      }
    }
    chartHost.addEventListener("pointermove", onPointerMove);
    chartHost.addEventListener("pointerup", onPointerUp);
    chartHost.addEventListener("pointercancel", onPointerUp);
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const geom = chart.yGeometry();
    if (!geom) return;
    const mPerPx = metresPerPixelY(geom);
    // dragging up (smaller clientY) raises the target
    const deltaMeters = (drag.startClientY - e.clientY) * mPerPx;
    const tgt = currentTarget();
    offsets.set(tgt.id, clampOffset(tgt, drag.startOffset + deltaMeters));
    renderChrome();
    scheduler.schedule(draw);
  }

  function onPointerUp(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const tgt = currentTarget();
    const snapped = clampOffset(tgt, Math.round(offset() / SNAP_METERS) * SNAP_METERS);
    offsets.set(tgt.id, snapped);
    drag = null;
    chartHost.removeEventListener("pointermove", onPointerMove);
    chartHost.removeEventListener("pointerup", onPointerUp);
    chartHost.removeEventListener("pointercancel", onPointerUp);
    if (typeof chartHost.releasePointerCapture === "function") {
      try {
        chartHost.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    renderChrome();
    draw();
  }

  function openPicker(): void {
    if (measuring() || pickerTeardown) return;
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
      const m = ui.state === "MEASURING";
      if (m && !wasMeasuring) {
        clearStudent();
        scheduler.schedule(draw);
      }
      wasMeasuring = m;
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
    chartHost.removeEventListener("pointermove", onPointerMove);
    chartHost.removeEventListener("pointerup", onPointerUp);
    chartHost.removeEventListener("pointercancel", onPointerUp);
    scheduler.cancel();
    chart.destroy();
    host.replaceChildren();
  };
}
