import type { ClassroomPoint } from "../../model/classroom-snapshot.js";
import { el } from "../components/dom.js";

export interface PointsDrawerHandle {
  update(points: readonly ClassroomPoint[]): void;
  destroy(): void;
}

/**
 * The POINTS drawer — collapsed by default. A new snapshot keeps it collapsed
 * unless the teacher had opened it and `keepOpen` is passed.
 */
export function mountPointsDrawer(
  host: HTMLElement,
  initial: readonly ClassroomPoint[],
): PointsDrawerHandle {
  let points = initial;
  let open = false;

  const header = el("button", { className: "snapshot-points__header" });
  const table = el("div", { className: "snapshot-points__table" });
  table.hidden = true;
  const wrap = el("div", { className: "snapshot-points" }, header, table);
  host.append(wrap);

  const renderHeader = (): void => {
    header.textContent = `${open ? "▾" : "▸"} POINTS (${points.length})`;
  };

  const renderTable = (): void => {
    table.replaceChildren();
    table.append(
      el("p", {
        className: "snapshot-points__caption",
        textContent: "Classroom coordinates — rounded to the nearest 0.5",
      }),
    );
    const t = el("table");
    t.append(
      el(
        "tr",
        {},
        el("th", { textContent: "X" }),
        el("th", { textContent: "Y" }),
      ),
    );
    for (const p of points) {
      t.append(
        el(
          "tr",
          {},
          el("td", { textContent: String(p.x) }),
          el("td", { textContent: p.y.toFixed(1) }),
        ),
      );
    }
    table.append(t);
  };

  header.addEventListener("click", () => {
    open = !open;
    table.hidden = !open;
    renderHeader();
    if (open) renderTable();
  });

  renderHeader();

  return {
    update(next) {
      points = next;
      renderHeader();
      if (open) renderTable();
      // a new snapshot does not force the drawer open
    },
    destroy() {
      wrap.remove();
    },
  };
}
