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
const signed = (v: number): string => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;

const DIRECTION_PHRASE: Record<MotionDirection, string> = {
  away: "away from the sensor",
  toward: "toward the sensor",
  stationary: "not moving",
};

function detailRow(label: string, value: string): HTMLElement {
  return el(
    "div",
    { className: "speed-explain__row" },
    el("span", { className: "speed-explain__row-label", textContent: label }),
    el("span", { className: "speed-explain__row-value", textContent: value }),
  );
}

/**
 * "How was this speed calculated?" — a projector-focused teaching overlay,
 * reusing the Snapshot Show-Large CSS shell. The slope calculation is the visual
 * hero; the honest note that Motion World actually uses the OLS best-fit slope
 * of every sample, and the supporting numbers, sit below it in smaller type.
 * All arithmetic already happened in the model; this only formats.
 */
export function mountSpeedExplainerOverlay(host: HTMLElement, input: SpeedExplainerInput): () => void {
  const e = input.endpoint;
  const o = input.ols;

  const sections: Node[] = [];

  // ── HERO — the slope calculation, largest type ─────────────────────────────
  if (e) {
    sections.push(
      el(
        "div",
        { className: "speed-explain__twopoint speed-explain__hero" },
        el("div", { className: "speed-explain__hero-formula", textContent: "m  =  Δposition ÷ Δtime" }),
        el("div", {
          className: "speed-explain__hero-sub",
          textContent:
            `( ${s(e.endMeters)} m − ${s(e.startMeters)} m )  ÷  ` +
            `( ${s(e.endSeconds)} s − ${s(e.startSeconds)} s )`,
        }),
        el("div", {
          className: "speed-explain__hero-result",
          textContent:
            `=  ${s(e.deltaMeters)} m ÷ ${s(e.deltaSeconds)} s  =  ${s(e.slopeMetersPerSecond)} m/s`,
        }),
        el("div", {
          className: "speed-explain__sub",
          textContent: "Δ (delta) means “the change in” — the end value minus the start value.",
        }),
      ),
    );
  } else {
    sections.push(
      el(
        "div",
        { className: "speed-explain__hero" },
        el("div", { className: "speed-explain__hero-formula", textContent: "m  =  best-fit slope" }),
        el("div", {
          className: "speed-explain__hero-result",
          textContent: `=  ${s(o.slopeMetersPerSecond)} m/s`,
        }),
        el("div", {
          className: "speed-explain__sub",
          textContent: "This interval is too short for a two-point estimate.",
        }),
      ),
    );
  }

  // ── the honest note ───────────────────────────────────────────────────────
  const disagree =
    e !== null &&
    Math.abs(o.slopeMetersPerSecond - e.slopeMetersPerSecond) >
      0.1 * Math.max(1e-9, Math.abs(o.slopeMetersPerSecond));

  sections.push(
    el(
      "div",
      { className: "speed-explain__ols" },
      el("div", { className: "show-large__label", textContent: "WHAT MOTION WORLD ACTUALLY USES" }),
      el("div", {
        className: "speed-explain__sub",
        textContent:
          "Two points can be noisy. Motion World uses the best-fit slope of every " +
          `sample in the selected interval — the least-squares straight line through all ` +
          `${o.sampleCount} points at once.`,
      }),
      disagree
        ? el("div", {
            className: "speed-explain__sub",
            textContent:
              `Best-fit slope: ${s(o.slopeMetersPerSecond)} m/s — the number on the result ` +
              `(the two-point estimate above is only the teaching idea).`,
          })
        : null,
    ),
  );

  // ── supporting numbers ───────────────────────────────────────────────────
  sections.push(
    el(
      "div",
      { className: "speed-explain__details" },
      el("div", { className: "show-large__label", textContent: "THE NUMBERS" }),
      detailRow("best-fit velocity", `${signed(o.slopeMetersPerSecond)} m/s`),
      detailRow("speed = | m |", `${s(input.speedMetersPerSecond)} m/s`),
      detailRow(
        "mph",
        `${s(input.speedMetersPerSecond)} × ${MPH_PER_MPS} = ${input.speedMilesPerHour.toFixed(1)} mph`,
      ),
      detailRow("direction", DIRECTION_PHRASE[input.direction]),
      detailRow("samples", String(o.sampleCount)),
      detailRow("r² = " + r2(o.rSquared), `intercept b = ${s(o.interceptMeters)} m`),
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
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) input.onClose();
  });
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape") input.onClose();
  };
  document.addEventListener("keydown", onKey);
  host.append(overlay);

  return () => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };
}
