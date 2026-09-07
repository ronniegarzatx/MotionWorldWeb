// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mountTargetPicker } from "../../src/ui/walk/target-picker.js";

function setup(currentId = "stand-still") {
  const host = document.createElement("div");
  document.body.append(host);
  const onPick = vi.fn();
  const onClose = vi.fn();
  const teardown = mountTargetPicker(host, { currentId, onPick, onClose });
  return { host, onPick, onClose, teardown };
}

describe("target picker", () => {
  it("shows 8 previews with titles; marks the current one", () => {
    const { host } = setup("walk-away");
    const items = host.querySelectorAll(".target-picker__item");
    expect(items).toHaveLength(8);
    expect(host.querySelectorAll("svg.target-preview")).toHaveLength(8);
    expect([...items].map((i) => i.querySelector(".target-picker__title")!.textContent)).toContain(
      "Stop → Move → Stop",
    );
    expect(host.querySelector(".is-current .target-picker__title")!.textContent).toBe("Walk Away");
  });

  it("clicking an item picks it and closes", () => {
    const { host, onPick, onClose } = setup();
    const items = [...host.querySelectorAll(".target-picker__item")] as HTMLButtonElement[];
    items[2]!.click(); // "Walk Toward"
    expect(onPick).toHaveBeenCalledWith("walk-toward");
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape and backdrop click close", () => {
    const { host, onClose } = setup();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    (host.querySelector(".target-picker") as HTMLElement).click();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("teardown removes the overlay and the key listener", () => {
    const { host, onClose, teardown } = setup();
    teardown();
    expect(host.querySelector(".target-picker")).toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
