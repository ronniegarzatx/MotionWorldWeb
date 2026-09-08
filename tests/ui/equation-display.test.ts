// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mountEquationDisplay, splitEquation } from "../../src/ui/snapshot/equation-display.js";
import { mountShowLargeOverlay } from "../../src/ui/snapshot/show-large-overlay.js";

describe("splitEquation", () => {
  it("leaves a short equation alone", () => {
    expect(splitEquation("f(x) ≈ -x + 4")).toEqual(["f(x) ≈ -x + 4"]);
  });

  it("splits a long cubic at top-level +/- boundaries, keeping f(x) and () intact", () => {
    const lines = splitEquation("f(x) = 1.23x³ - 4.56x² + 7.89x - 0.12");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toContain("f(x) =");
    for (const l of lines) {
      // no broken function call / unbalanced parens
      const open = (l.match(/\(/g) ?? []).length;
      const close = (l.match(/\)/g) ?? []).length;
      expect(open).toBe(close);
    }
  });

  it("does not split inside an absolute-value / sqrt argument", () => {
    const lines = splitEquation("f(x) = 2.34√(x - 3.21) + 1.05", 10); // force splitting
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toContain("√(x - 3.21)"); // the inner - is preserved
    for (const l of lines) {
      expect((l.match(/\(/g) ?? []).length).toBe((l.match(/\)/g) ?? []).length);
    }
  });
});

describe("mountEquationDisplay", () => {
  it("renders classroom largest, precise + r² subordinate", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const teardown = mountEquationDisplay(host, {
      classroom: "f(x) ≈ -x + 4",
      precise: "f(x) = -0.99x + 3.94",
      rSquared: 0.997,
      family: "linear",
    });
    expect(host.querySelector(".eq-classroom")!.textContent).toBe("f(x) ≈ -x + 4");
    expect(host.querySelector(".eq-precise")!.textContent).toContain("f(x) = -0.99x + 3.94");
    expect(host.querySelector(".eq-r2")!.textContent).toBe("r² = 1.00");
    teardown();
    expect(host.querySelector(".equation-display")).toBeNull();
  });

  it("clamps a negative r² to 0 in the display", () => {
    const host = document.createElement("div");
    document.body.append(host);
    mountEquationDisplay(host, { classroom: "x", precise: "x", rSquared: -0.4, family: "linear" });
    expect(host.querySelector(".eq-r2")!.textContent).toBe("r² = 0.00");
  });
});

describe("mountShowLargeOverlay", () => {
  it("shows MODEL / big classroom / precise / r² / description; Esc + backdrop close", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const onClose = vi.fn();
    const teardown = mountShowLargeOverlay(host, {
      classroom: "f(x) ≈ -x + 4",
      precise: "f(x) = -0.99x + 3.94",
      rSquared: 1,
      family: "linear",
      onClose,
    });
    expect(host.querySelector(".show-large__label")!.textContent).toBe("MODEL");
    expect(host.textContent).toContain("PRECISE FIT");
    expect(host.textContent).toContain("f(x) = -0.99x + 3.94");
    expect(host.textContent).toMatch(/straight line/i);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    (host.querySelector(".show-large") as HTMLElement).click();
    expect(onClose).toHaveBeenCalledTimes(2);

    teardown();
    expect(host.querySelector(".show-large")).toBeNull();
  });
});
