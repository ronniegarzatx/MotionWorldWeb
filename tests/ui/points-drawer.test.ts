// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mountPointsDrawer } from "../../src/ui/snapshot/points-drawer.js";
import type { ClassroomPoint } from "../../src/model/classroom-snapshot.js";

const pts = (ys: number[]): ClassroomPoint[] => ys.map((y, x) => ({ x, y }));

describe("points-drawer", () => {
  it("collapsed by default; header shows the count", () => {
    const host = document.createElement("div");
    const d = mountPointsDrawer(host, pts([1, 1.5, 2, 2.5, 3]));
    expect(host.querySelector(".snapshot-points__header")!.textContent).toContain("POINTS (5)");
    expect((host.querySelector(".snapshot-points__table") as HTMLElement).hidden).toBe(true);
    d.destroy();
  });

  it("opens to an X | Y table and closes again", () => {
    const host = document.createElement("div");
    mountPointsDrawer(host, pts([1, 2, 3]));
    (host.querySelector(".snapshot-points__header") as HTMLButtonElement).click();
    const rows = [...host.querySelectorAll("tr")];
    expect(rows[0]!.textContent).toBe("XY");
    expect(rows).toHaveLength(4); // header + 3
    expect(rows[1]!.textContent).toBe("01.0");
    (host.querySelector(".snapshot-points__header") as HTMLButtonElement).click();
    expect((host.querySelector(".snapshot-points__table") as HTMLElement).hidden).toBe(true);
  });

  it("a new snapshot updates the count but stays collapsed", () => {
    const host = document.createElement("div");
    const d = mountPointsDrawer(host, pts([1, 2, 3]));
    d.update(pts([1, 1.5, 2, 2.5, 3, 3.5, 4]));
    expect(host.querySelector(".snapshot-points__header")!.textContent).toContain("POINTS (7)");
    expect((host.querySelector(".snapshot-points__table") as HTMLElement).hidden).toBe(true);
  });

  it("if open, an update refreshes the table", () => {
    const host = document.createElement("div");
    const d = mountPointsDrawer(host, pts([1, 2, 3]));
    (host.querySelector(".snapshot-points__header") as HTMLButtonElement).click();
    d.update(pts([9, 8]));
    expect([...host.querySelectorAll("tr")]).toHaveLength(3);
    expect(host.querySelectorAll("tr")[1]!.textContent).toBe("09.0");
  });
});
