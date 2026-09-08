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
  it("has 6 tiles, all active — no 'Coming next'", () => {
    const { host } = setup();
    const all = tiles(host);
    expect(all).toHaveLength(6);
    expect(all.filter((t) => !t.disabled)).toHaveLength(6);
    expect(host.textContent ?? "").not.toMatch(/coming next/i);
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

  it("all six tools navigate to their route", () => {
    const { host, navigate } = setup();
    const all = tiles(host);
    for (const t of all) expect(t.disabled).toBe(false);
    all.forEach((t) => t.click());
    expect(navigate.mock.calls.map((c) => c[0])).toEqual([
      "live",
      "data",
      "walk",
      "snapshot",
      "speed",
      "sequence",
    ]);
  });

  it("no roadmap / Activity Library / Standards vocabulary", () => {
    const { host } = setup();
    expect(host.textContent ?? "").not.toMatch(/roadmap|activity library|standards/i);
  });
});
