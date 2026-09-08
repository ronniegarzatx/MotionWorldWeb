import type { ModelFamily } from "../../model/model-fit.js";
import { FAMILY_DESCRIPTION } from "../../model/model-fit.js";
import { el } from "../components/dom.js";

export interface EquationDisplayInput {
  readonly classroom: string; // "f(x) ≈ -x + 4"
  readonly precise: string; // "f(x) = -0.99x + 3.94"
  readonly rSquared: number;
  readonly family: ModelFamily;
}

/**
 * Split an equation string at TOP-LEVEL " + " / " − " (and " - ") boundaries so
 * a long equation can wrap onto continuation lines without ever cropping. Never
 * splits inside "()" or a function call like "f(x)".
 */
export function splitEquation(expr: string, maxLen = 22): string[] {
  if (expr.length <= maxLen) return [expr];
  const eq = expr.indexOf("=");
  const approx = expr.indexOf("≈");
  const cut = Math.max(eq, approx);
  const head = cut >= 0 ? expr.slice(0, cut + 1).trim() : "";
  const body = cut >= 0 ? expr.slice(cut + 1).trim() : expr;

  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    const two = body.slice(i, i + 3);
    if (depth === 0 && (two === " + " || two === " - " || two === " − ")) {
      parts.push(cur);
      cur = two.trim() === "+" ? "+ " : "− ";
      i += 2;
      continue;
    }
    cur += ch;
  }
  parts.push(cur);

  if (parts.length <= 1) return [expr];
  const lines = parts.map((p) => p.trim());
  return head ? [`${head} ${lines[0]}`, ...lines.slice(1).map((l) => `  ${l}`)] : lines;
}

/**
 * Reusable: render `classroom` large, shrink toward a floor, then split at safe
 * boundaries if it still overflows its host. `precise` + r² render subordinate.
 */
export function mountEquationDisplay(host: HTMLElement, input: EquationDisplayInput): () => void {
  const classroomEl = el("div", { className: "eq-classroom" });
  const preciseEl = el("div", {
    className: "eq-precise",
    textContent: `precise fit: ${input.precise}`,
  });
  const r2El = el("div", {
    className: "eq-r2",
    textContent: `r² = ${Math.max(0, input.rSquared).toFixed(2)}`,
  });
  const wrap = el("div", { className: "equation-display" }, classroomEl, preciseEl, r2El);
  host.append(wrap);

  const applyClassroom = (): void => {
    classroomEl.textContent = input.classroom;
    classroomEl.classList.remove("eq-classroom--split");
    // shrink toward the floor if we can measure an overflow (real browser only)
    let size = 44;
    classroomEl.style.fontSize = `${size}px`;
    while (classroomEl.scrollWidth > classroomEl.clientWidth && size > 20) {
      size -= 2;
      classroomEl.style.fontSize = `${size}px`;
    }
    if (classroomEl.scrollWidth > classroomEl.clientWidth) {
      classroomEl.classList.add("eq-classroom--split");
      classroomEl.textContent = "";
      for (const line of splitEquation(input.classroom)) {
        classroomEl.append(el("div", { className: "eq-line", textContent: line }));
      }
    }
  };
  applyClassroom();

  return () => wrap.remove();
}

export function familyDescription(family: ModelFamily): string {
  return FAMILY_DESCRIPTION[family];
}
