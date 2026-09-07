// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { button, el, stat, tile } from "../../src/ui/components/dom.js";

describe("el", () => {
  it("sets props, dataset, children, and skips nullish children", () => {
    const node = el(
      "div",
      { id: "x", className: "y", dataset: { role: "z" } },
      "hello",
      null,
      el("span", { textContent: "child" }),
    );
    expect(node.id).toBe("x");
    expect(node.className).toBe("y");
    expect(node.dataset.role).toBe("z");
    expect(node.textContent).toBe("hellochild");
  });
});

describe("button", () => {
  it("renders label + disabled state and calls onClick only when enabled", () => {
    const onClick = vi.fn();
    const b = button({ label: "Go", onClick });
    expect(b.tagName).toBe("BUTTON");
    expect(b.textContent).toBe("Go");
    b.click();
    expect(onClick).toHaveBeenCalledTimes(1);

    const d = button({ label: "No", onClick, disabled: true });
    d.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("primary variant adds the class", () => {
    expect(button({ label: "P", onClick: () => {}, variant: "primary" }).className).toContain(
      "btn--primary",
    );
  });
});

describe("tile", () => {
  it("active tile navigates; disabled tile does not", () => {
    const onOpen = vi.fn();
    const active = tile({ name: "Live Lab", active: true, onOpen });
    active.click();
    expect(onOpen).toHaveBeenCalled();

    const disabled = tile({ name: "Speed Lab", note: "coming next", active: false, onOpen });
    expect(disabled.disabled).toBe(true);
    expect(disabled.className).toContain("tile--disabled");
    disabled.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("stat", () => {
  it("renders a label + value", () => {
    const s = stat("SAMPLES", "42");
    expect(s.querySelector(".stat__label")!.textContent).toBe("SAMPLES");
    expect(s.querySelector(".stat__value")!.textContent).toBe("42");
  });
});
