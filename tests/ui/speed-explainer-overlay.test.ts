// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountSpeedExplainerOverlay } from "../../src/ui/speed/speed-explainer-overlay.js";

afterEach(() => document.body.replaceChildren());

const baseInput = () => ({
  endpoint: {
    startSeconds: 0.56,
    endSeconds: 1.04,
    startMeters: 0.19,
    endMeters: 0.67,
    deltaSeconds: 0.48,
    deltaMeters: 0.48,
    slopeMetersPerSecond: 1.0,
  },
  ols: {
    slopeMetersPerSecond: 2.06,
    interceptMeters: 0.1,
    rSquared: 0.98,
    sampleCount: 128,
  },
  speedMetersPerSecond: 2.06,
  speedMilesPerHour: 4.61,
  direction: "away" as const,
  onClose: vi.fn(),
});

describe("speed-explainer-overlay", () => {
  it("shows the two-point substitution with the real numbers", () => {
    const host = document.createElement("div");
    document.body.append(host);
    mountSpeedExplainerOverlay(host, baseInput());
    const text = host.textContent!;
    expect(text).toMatch(/0\.67 m/);
    expect(text).toMatch(/0\.19 m/);
    expect(text).toMatch(/1\.04 s/);
    expect(text).toMatch(/0\.56 s/);
    expect(text.toLowerCase()).toContain("delta");
  });

  it("shows the honest OLS explanation with m, r² and the sample count", () => {
    const host = document.createElement("div");
    document.body.append(host);
    mountSpeedExplainerOverlay(host, baseInput());
    const text = host.textContent!;
    expect(text).toMatch(/best[- ]fit/i);
    expect(text).toMatch(/128/);
    expect(text).toMatch(/r² = 0\.98/);
    expect(text).toMatch(/2\.06/);
    expect(text).toMatch(/2\.2369/); // the conversion factor is shown
    expect(text.toLowerCase()).toMatch(/away/);
  });

  it("omits the two-point section when endpoint is null but keeps the OLS section", () => {
    const host = document.createElement("div");
    document.body.append(host);
    mountSpeedExplainerOverlay(host, { ...baseInput(), endpoint: null });
    expect(host.querySelector(".speed-explain__twopoint")).toBeNull();
    expect(host.querySelector(".speed-explain__ols")).not.toBeNull();
  });

  it("Esc and backdrop close; teardown removes it", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const input = baseInput();
    const teardown = mountSpeedExplainerOverlay(host, input);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(input.onClose).toHaveBeenCalledTimes(1);
    const overlay = host.querySelector(".show-large") as HTMLElement;
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(input.onClose).toHaveBeenCalledTimes(2);
    teardown();
    expect(host.querySelector(".show-large")).toBeNull();
  });
});
