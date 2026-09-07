// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mountHomeView } from "../../src/ui/home/home-view.js";

function setup() {
  const host = document.createElement("div");
  document.body.append(host);
  const navigate = vi.fn();
  const teardown = mountHomeView(host, { navigate });
  return { host, navigate, teardown };
}

const tiles = (host: HTMLElement) => [...host.querySelectorAll(".tile")] as HTMLButtonElement[];

describe("home-view", () => {
  it("has 6 tiles — 3 active, 3 disabled", () => {
    const { host } = setup();
    const all = tiles(host);
    expect(all).toHaveLength(6);
    expect(all.filter((t) => !t.disabled)).toHaveLength(3);
    expect(all.filter((t) => t.disabled)).toHaveLength(3);
  });

  it("renders exactly the six peer tiles in order", () => {
    const { host } = setup();
    expect(tiles(host).map((t) => t.querySelector(".tile__name")!.textContent)).toEqual([
      "Live Lab",
      "Data Display",
      "Walk the Line",
      "Snapshot Lab",
      "Speed Lab",
      "Sequence Lab",
    ]);
  });

  it("Live Lab, Data Display, Walk the Line are active and navigate", () => {
    const { host, navigate } = setup();
    const [live, data, walk] = tiles(host);
    expect(live!.disabled).toBe(false);
    expect(data!.disabled).toBe(false);
    expect(walk!.disabled).toBe(false);
    live!.click();
    data!.click();
    walk!.click();
    expect(navigate).toHaveBeenNthCalledWith(1, "live");
    expect(navigate).toHaveBeenNthCalledWith(2, "data");
    expect(navigate).toHaveBeenNthCalledWith(3, "walk");
  });

  it("Snapshot / Speed / Sequence are disabled and inert", () => {
    const { host, navigate } = setup();
    const disabled = tiles(host).slice(3);
    for (const t of disabled) {
      expect(t.disabled).toBe(true);
      expect(t.className).toContain("tile--disabled");
      expect(t.textContent).toContain("Coming next");
      t.click();
    }
    expect(navigate).not.toHaveBeenCalled();
  });

  it("no roadmap / Activity Library / Standards vocabulary", () => {
    const { host } = setup();
    expect(host.textContent ?? "").not.toMatch(/roadmap|activity library|standards/i);
  });
});
