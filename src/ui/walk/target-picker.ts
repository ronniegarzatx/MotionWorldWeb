import { WALK_TARGETS } from "../../model/walk-target.js";
import { el } from "../components/dom.js";
import { targetPreviewPathD } from "./target-preview.js";

export interface TargetPickerDeps {
  readonly currentId: string;
  readonly onPick: (id: string) => void;
  readonly onClose: () => void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const PREVIEW_W = 150;
const PREVIEW_H = 70;

function previewSvg(id: string): SVGSVGElement {
  const target = WALK_TARGETS.find((t) => t.id === id)!;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "target-preview");
  svg.setAttribute("viewBox", `0 0 ${PREVIEW_W} ${PREVIEW_H}`);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("class", "target");
  path.setAttribute("d", targetPreviewPathD(target, PREVIEW_W, PREVIEW_H, 6));
  svg.appendChild(path);
  return svg;
}

/** A compact inline picker panel. Not a modal framework — one overlay div. */
export function mountTargetPicker(host: HTMLElement, deps: TargetPickerDeps): () => void {
  const grid = el(
    "div",
    { className: "target-picker__grid" },
    ...WALK_TARGETS.map((target) => {
      const b = el(
        "button",
        {
          className:
            "target-picker__item" + (target.id === deps.currentId ? " is-current" : ""),
        },
        previewSvg(target.id),
        el("span", { className: "target-picker__title", textContent: target.title }),
      );
      b.addEventListener("click", () => {
        deps.onPick(target.id);
        deps.onClose();
      });
      return b;
    }),
  );

  const panel = el(
    "div",
    { className: "target-picker__panel" },
    el("div", { className: "target-picker__header", textContent: "Choose a target" }),
    grid,
  );
  const overlay = el("div", { className: "target-picker" }, panel);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) deps.onClose();
  });

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") deps.onClose();
  };
  document.addEventListener("keydown", onKey);
  host.appendChild(overlay);

  return () => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };
}
