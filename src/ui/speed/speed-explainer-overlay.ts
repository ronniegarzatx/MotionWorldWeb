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
  /** e.g. "0.4 mph under the 5 mph limit" — null when the analysis failed */
  readonly limitLine: string | null;
  readonly intervalSeconds: number;
  readonly onClose: () => void;
}

const s = (v: number): string => v.toFixed(2);
const r2 = (v: number): string => Math.max(0, v).toFixed(2);
const signed = (v: number): string => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;
const signed1 = (v: number): string => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;

const DIRECTION_PHRASE: Record<MotionDirection, string> = {
  away: "away from the sensor",
  toward: "toward the sensor",
  stationary: "not moving",
};

/** A visual fraction: numerator over a rule over denominator. */
function frac(numerator: string, denominator: string): HTMLElement {
  return el(
    "span",
    { className: "frac" },
    el("span", { className: "frac__num", textContent: numerator }),
    el("span", { className: "frac__den", textContent: denominator }),
  );
}

function equation(...parts: (Node | string)[]): HTMLElement {
  return el("div", { className: "speed-explain__eq" }, ...parts);
}

function detailRow(label: string, value: string): HTMLElement {
  return el(
    "div",
    { className: "speed-explain__row" },
    el("span", { className: "speed-explain__row-label", textContent: label }),
    el("span", { className: "speed-explain__row-value", textContent: value }),
  );
}

/**
 * "How was this speed calculated?" — the single place for every detail. The
 * slope formula is the visual hero: `m = Δposition / Δtime` as a real fraction,
 * then the selected interval's endpoint values substituted in, then the computed
 * two-point slope. Below that, in smaller type: the Δ explanation, then Motion
 * World's ACTUAL best-fit (OLS) calculation with all the supporting numbers, and
 * the honest reminder that the two-point slope is only an intuitive check.
 * All arithmetic happened in the model; this only formats.
 */
export function mountSpeedExplainerOverlay(host: HTMLElement, input: SpeedExplainerInput): () => void {
  const e = input.endpoint;
  const o = input.ols;
  const sections: Node[] = [];

  // ── HERO — the slope calculation, largest type ───────────────────────────
  if (e) {
    sections.push(
      el(
        "div",
        { className: "speed-explain__twopoint speed-explain__hero" },
        equation(
          el("span", { textContent: "m" }),
          el("span", { textContent: "=" }),
          frac("Δposition", "Δtime"),
        ),
        equation(
          el("span", { textContent: "m" }),
          el("span", { textContent: "=" }),
          frac(
            `${s(e.endMeters)} m − ${s(e.startMeters)} m`,
            `${s(e.endSeconds)} s − ${s(e.startSeconds)} s`,
          ),
        ),
        equation(
          el("span", { textContent: "m" }),
          el("span", { textContent: "=" }),
          frac(`${s(e.deltaMeters)} m`, `${s(e.deltaSeconds)} s`),
        ),
        el("div", {
          className: "speed-explain__slope",
          textContent: `TWO-POINT SLOPE ≈ ${signed1(e.slopeMetersPerSecond)} m/s`,
        }),
      ),
    );

    // ── Δ explanation — subordinate ───────────────────────────────────────
    sections.push(
      el(
        "div",
        { className: "speed-explain__delta" },
        el("div", { className: "speed-explain__sub", textContent: "Δ (delta) means “the change in”." }),
        el("div", { className: "speed-explain__sub", textContent: "Δposition = final − initial" }),
        el("div", { className: "speed-explain__sub", textContent: "Δtime = final − initial" }),
        el("div", {
          className: "speed-explain__sub",
          textContent: "On a position-vs-time graph, slope = velocity.",
        }),
      ),
    );
  } else {
    sections.push(
      el(
        "div",
        { className: "speed-explain__hero" },
        equation(el("span", { textContent: "m" }), el("span", { textContent: "= best-fit slope" })),
        el("div", {
          className: "speed-explain__slope",
          textContent: `≈ ${s(o.slopeMetersPerSecond)} m/s`,
        }),
        el("div", {
          className: "speed-explain__sub",
          textContent: "This interval is too short for a two-point estimate.",
        }),
      ),
    );
  }

  // ── ACTUAL Motion World calculation (OLS) ────────────────────────────────
  sections.push(
    el(
      "div",
      { className: "speed-explain__ols" },
      el("div", { className: "show-large__label", textContent: "ACTUAL MOTION WORLD CALCULATION" }),
      el("div", {
        className: "speed-explain__sub",
        textContent:
          "Motion World uses the best-fit slope of every sample in the selected " +
          `interval — the least-squares straight line through all ${o.sampleCount} points at once.`,
      }),
      el("div", {
        className: "speed-explain__sub",
        textContent:
          `best-fit slope m = ${s(o.slopeMetersPerSecond)} m/s   ·   ` +
          `r² = ${r2(o.rSquared)}   ·   ${o.sampleCount} samples over ${s(input.intervalSeconds)} s`,
      }),
      detailRow("Best-fit velocity", `${signed(o.slopeMetersPerSecond)} m/s`),
      detailRow(
        "Speed",
        `| ${signed(o.slopeMetersPerSecond)} | = ${s(input.speedMetersPerSecond)} m/s`,
      ),
      detailRow(
        "Convert",
        `${s(input.speedMetersPerSecond)} × ${MPH_PER_MPS} ≈ ${input.speedMilesPerHour.toFixed(1)} mph`,
      ),
      detailRow("Direction", DIRECTION_PHRASE[input.direction]),
      ...(input.limitLine ? [detailRow("Speed limit", input.limitLine)] : []),
      detailRow("Interval", `${s(input.intervalSeconds)} s`),
      detailRow("Intercept", `b = ${s(o.interceptMeters)} m`),
    ),
  );

  // ── honesty: teaching check vs actual calculation ────────────────────────
  const disagree =
    e !== null &&
    Math.abs(o.slopeMetersPerSecond - e.slopeMetersPerSecond) >
      0.1 * Math.max(1e-9, Math.abs(o.slopeMetersPerSecond));

  const honesty = el(
    "div",
    { className: "speed-explain__honesty" },
    el("div", {
      className: "speed-explain__sub",
      textContent:
        "The two-point slope is an intuitive check. The best-fit slope is Motion " +
        "World’s actual calculation — it is the number on the result.",
    }),
  );
  if (disagree && e) {
    honesty.append(
      el("div", {
        className: "speed-explain__callout",
        textContent:
          `The two-point slope (≈ ${signed1(e.slopeMetersPerSecond)} m/s) and the best-fit ` +
          `slope (${s(o.slopeMetersPerSecond)} m/s) differ by more than 10%. ` +
          "The result uses the best-fit slope.",
      }),
    );
  }
  sections.push(honesty);

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
