import type { MotionDirection } from "../../model/rate-analysis.js";
import { MPH_PER_MPS } from "../../model/rate-analysis.js";
import { el } from "../components/dom.js";

export interface SpeedExplainerEndpoint {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly startMeters: number;
  readonly endMeters: number;
  readonly deltaSeconds: number;
  readonly deltaMeters: number;
  readonly slopeMetersPerSecond: number;
}

export interface SpeedExplainerOls {
  readonly slopeMetersPerSecond: number;
  readonly interceptMeters: number;
  readonly rSquared: number;
  readonly sampleCount: number;
}

export interface SpeedExplainerInput {
  /** null when the interval is too short for a two-point slope */
  readonly endpoint: SpeedExplainerEndpoint | null;
  readonly ols: SpeedExplainerOls;
  readonly speedMetersPerSecond: number;
  readonly speedMilesPerHour: number;
  readonly direction: MotionDirection;
  readonly onClose: () => void;
}

const s = (v: number): string => v.toFixed(2);
const r2 = (v: number): string => Math.max(0, v).toFixed(2);

const DIRECTION_PHRASE: Record<MotionDirection, string> = {
  away: "away from the sensor",
  toward: "toward the sensor",
  stationary: "not moving",
};

/**
 * "How was this speed calculated?" — a projector-focused teaching overlay.
 * Same Esc / backdrop-close pattern as the Snapshot Show-Large overlay, reusing
 * its `.show-large` CSS shell. All arithmetic already happened in the model; this
 * only formats and lays out.
 */
export function mountSpeedExplainerOverlay(host: HTMLElement, input: SpeedExplainerInput): () => void {
  const sections: Node[] = [];

  if (input.endpoint) {
    const e = input.endpoint;
    sections.push(
      el(
        "div",
        { className: "speed-explain__twopoint" },
        el("div", { className: "show-large__label", textContent: "THE IDEA — TWO POINTS" }),
        el("div", { className: "speed-explain__formula", textContent: "slope = Δposition ÷ Δtime" }),
        el("div", {
          className: "speed-explain__sub",
          textContent:
            "Δ (delta) means “the change in” — the end value minus the start value.",
        }),
        el("div", {
          className: "speed-explain__work",
          textContent:
            `( ${s(e.endMeters)} m − ${s(e.startMeters)} m ) ÷ ` +
            `( ${s(e.endSeconds)} s − ${s(e.startSeconds)} s )`,
        }),
        el("div", {
          className: "speed-explain__work",
          textContent:
            `= ${s(e.deltaMeters)} m ÷ ${s(e.deltaSeconds)} s ` +
            `= ${s(e.slopeMetersPerSecond)} m/s`,
        }),
      ),
    );
  }

  const o = input.ols;
  const disagree =
    input.endpoint !== null &&
    Math.abs(o.slopeMetersPerSecond - input.endpoint.slopeMetersPerSecond) >
      0.1 * Math.max(1e-9, Math.abs(o.slopeMetersPerSecond));

  sections.push(
    el(
      "div",
      { className: "speed-explain__ols" },
      el("div", { className: "show-large__label", textContent: "WHAT MOTION WORLD USES" }),
      el("div", {
        className: "speed-explain__sub",
        textContent:
          "Two points can be noisy. Motion World uses the best-fit slope of every " +
          `sample in the selected interval — the straight line closest to all ` +
          `${o.sampleCount} of them at once (least squares).`,
      }),
      el("div", {
        className: "speed-explain__work",
        textContent:
          `best-fit slope m = ${s(o.slopeMetersPerSecond)} m/s` +
          `   b = ${s(o.interceptMeters)} m   r² = ${r2(o.rSquared)}`,
      }),
      disagree
        ? el("div", {
            className: "speed-explain__sub",
            textContent: "(the best-fit slope is the number shown on the result.)",
          })
        : null,
    ),
  );

  sections.push(
    el(
      "div",
      { className: "speed-explain__toSpeed" },
      el("div", { className: "show-large__label", textContent: "FROM SLOPE TO SPEED" }),
      el("div", {
        className: "speed-explain__work",
        textContent: `speed = | slope | = ${s(input.speedMetersPerSecond)} m/s`,
      }),
      el("div", {
        className: "speed-explain__work",
        textContent:
          `mph = ${s(input.speedMetersPerSecond)} × ${MPH_PER_MPS} = ` +
          `${input.speedMilesPerHour.toFixed(1)} mph`,
      }),
      el("div", {
        className: "speed-explain__sub",
        textContent: `The sign of the slope tells the direction: ${DIRECTION_PHRASE[input.direction]}.`,
      }),
    ),
  );

  const closeBtn = el("button", { className: "btn", textContent: "Close" });
  closeBtn.addEventListener("click", input.onClose);

  const panel = el(
    "div",
    { className: "show-large__panel speed-explain__panel" },
    el("div", { className: "show-large__family", textContent: "How was this speed calculated?" }),
    ...sections,
    closeBtn,
  );

  const overlay = el("div", { className: "show-large" }, panel);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) input.onClose();
  });
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") input.onClose();
  };
  document.addEventListener("keydown", onKey);
  host.append(overlay);

  return () => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };
}
