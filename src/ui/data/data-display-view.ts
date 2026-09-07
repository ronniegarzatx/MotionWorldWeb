import type {
  AcquisitionController,
  AcquisitionUiState,
} from "../../acquisition/acquisition-controller.js";
import type { MotionSample } from "../../sensor/types.js";
import { button, el } from "../components/dom.js";

export interface DataDisplayDeps {
  readonly controller: AcquisitionController;
}

const DASH = "—";

export function mountDataDisplayView(host: HTMLElement, deps: DataDisplayDeps): () => void {
  const { controller } = deps;

  const value = el("div", { className: "hero-value hero-value--muted", textContent: DASH });
  const time = el("div", { className: "hero-time", textContent: DASH });
  const meta = el("div", { className: "hero-meta", textContent: "" });
  const resetBtn = button({
    label: "Reset",
    variant: "ghost",
    onClick: () => showValue(null),
  });

  host.append(
    el(
      "div",
      { className: "data-display" },
      el("div", { className: "stat__label", textContent: "POSITION" }),
      value,
      time,
      meta,
      resetBtn,
    ),
  );

  let count = 0;

  function showValue(sample: MotionSample | null): void {
    if (!sample) {
      count = 0;
      value.textContent = DASH;
      value.classList.add("hero-value--muted");
      time.textContent = DASH;
      meta.textContent = "";
      return;
    }
    value.textContent = `${sample.positionMeters.toFixed(3)} m`;
    value.classList.remove("hero-value--muted");
    time.textContent = `${sample.timestampSeconds.toFixed(2)} s`;
    meta.textContent = `${count} samples`;
  }

  // restore from the last completed run if there is one
  const last = controller.lastCompletedRun();
  if (last && last.sampleCount > 0) {
    count = last.sampleCount;
    showValue(last.samples[last.sampleCount - 1]!);
  }

  let prevState = controller.uiState.state;
  const unsubs = [
    controller.subscribeSample((s: MotionSample) => {
      count += 1;
      showValue(s);
    }),
    controller.subscribeUiState((ui: AcquisitionUiState) => {
      // a fresh run beginning blanks the display; after Stop the value is kept
      if (ui.state === "MEASURING" && prevState !== "MEASURING") showValue(null);
      prevState = ui.state;
    }),
  ];

  return () => {
    for (const u of unsubs) u();
    host.replaceChildren();
  };
}
