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
  it("has 6 tiles — 5 active, 1 disabled", () => {
    const { host } = setup();
    const all = tiles(host);
    expect(all).toHaveLength(6);
    expect(all.filter((t) => !t.disabled)).toHaveLength(5);
    expect(all.filter((t) => t.disabled)).toHaveLength(1);
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

  it("Live Lab, Data Display, Walk the Line, Snapshot Lab, Speed Lab are active and navigate", () => {
    const { host, navigate } = setup();
    const [live, data, walk, snapshot, speed] = tiles(host);
    for (const t of [live, data, walk, snapshot, speed]) expect(t!.disabled).toBe(false);
    live!.click();
    data!.click();
    walk!.click();
    snapshot!.click();
    speed!.click();
    expect(navigate).toHaveBeenNthCalledWith(1, "live");
    expect(navigate).toHaveBeenNthCalledWith(2, "data");
    expect(navigate).toHaveBeenNthCalledWith(3, "walk");
    expect(navigate).toHaveBeenNthCalledWith(4, "snapshot");
    expect(navigate).toHaveBeenNthCalledWith(5, "speed");
  });

  it("Sequence Lab is disabled and inert", () => {
    const { host, navigate } = setup();
    const disabled = tiles(host).slice(5);
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
