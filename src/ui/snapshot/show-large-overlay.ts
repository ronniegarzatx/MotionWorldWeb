import type { ModelFamily } from "../../model/model-fit.js";
import { FAMILY_LABEL } from "../../model/model-fit.js";
import { el } from "../components/dom.js";
import { familyDescription, splitEquation } from "./equation-display.js";

export interface ShowLargeInput {
  readonly classroom: string;
  readonly precise: string;
  readonly rSquared: number;
  readonly family: ModelFamily;
  readonly onClose: () => void;
}

/** A projector-focused equation overlay. Long equations never crop. */
export function mountShowLargeOverlay(host: HTMLElement, input: ShowLargeInput): () => void {
  const bigEq = el("div", { className: "show-large__eq" });
  for (const line of splitEquation(input.classroom)) {
    bigEq.append(el("div", { className: "eq-line", textContent: line }));
  }

  const panel = el(
    "div",
    { className: "show-large__panel" },
    el("div", { className: "show-large__label", textContent: "MODEL" }),
    el("div", { className: "show-large__family", textContent: FAMILY_LABEL[input.family] }),
    bigEq,
    el("div", { className: "show-large__label", textContent: "PRECISE FIT" }),
    el("div", { className: "show-large__precise", textContent: input.precise }),
    el("div", { className: "show-large__r2", textContent: `r² = ${Math.max(0, input.rSquared).toFixed(2)}` }),
    el("div", { className: "show-large__desc", textContent: familyDescription(input.family) }),
    el("button", { className: "btn", textContent: "Close" }),
  );
  (panel.querySelector("button") as HTMLButtonElement).addEventListener("click", input.onClose);

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
