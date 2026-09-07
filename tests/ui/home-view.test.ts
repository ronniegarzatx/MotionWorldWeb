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
  it("renders exactly the five peer tiles in order", () => {
    const { host } = setup();
    expect(tiles(host).map((t) => t.querySelector(".tile__name")!.textContent)).toEqual([
      "Live Lab",
      "Data Display",
      "Snapshot Lab",
      "Speed Lab",
      "Sequence Lab",
    ]);
  });

  it("Live Lab and Data Display are active and navigate", () => {
    const { host, navigate } = setup();
    const [live, data] = tiles(host);
    expect(live!.disabled).toBe(false);
    expect(data!.disabled).toBe(false);
    live!.click();
    data!.click();
    expect(navigate).toHaveBeenNthCalledWith(1, "live");
    expect(navigate).toHaveBeenNthCalledWith(2, "data");
  });

  it("Snapshot / Speed / Sequence are disabled and inert", () => {
    const { host, navigate } = setup();
    const disabled = tiles(host).slice(2);
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
