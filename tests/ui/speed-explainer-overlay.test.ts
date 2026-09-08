// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mountSpeedExplainerOverlay,
  type SpeedExplainerInput,
} from "../../src/ui/speed/speed-explainer-overlay.js";

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
  limitLine: "0.4 mph under the 5 mph limit",
  intervalSeconds: 3.16,
  onClose: vi.fn(),
});

function mount(overrides: Partial<SpeedExplainerInput> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const input: SpeedExplainerInput = { ...baseInput(), ...overrides };
  const teardown = mountSpeedExplainerOverlay(host, input);
  return { host, input, teardown };
}

describe("speed-explainer-overlay", () => {
  it("makes the slope formula the hero, above the actual-calculation section", () => {
    const { host } = mount();
    const hero = host.querySelector(".speed-explain__hero")!;
    expect(hero).not.toBeNull();
    expect(hero.textContent).toMatch(/Δposition/);
    expect(hero.textContent).toMatch(/Δtime/);
    // rendered as a real fraction, not an inline slash
    expect(hero.querySelectorAll(".frac").length).toBeGreaterThanOrEqual(2);
    // the computed two-point slope line
    expect(host.querySelector(".speed-explain__slope")!.textContent).toMatch(/m\/s/);

    const ols = host.querySelector(".speed-explain__ols")!;
    expect(hero.compareDocumentPosition(ols) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("substitutes the real endpoint values into the fraction", () => {
    const { host } = mount();
    const fracs = [...host.querySelectorAll(".frac")].map((f) => f.textContent);
    expect(fracs.join(" ")).toMatch(/0\.67 m/);
    expect(fracs.join(" ")).toMatch(/0\.19 m/);
    expect(fracs.join(" ")).toMatch(/1\.04 s/);
    expect(fracs.join(" ")).toMatch(/0\.56 s/);
  });

  it("explains Δ below the hero", () => {
    const { host } = mount();
    const text = host.textContent!.toLowerCase();
    expect(text).toContain("delta");
    expect(text).toMatch(/final − initial|final - initial/);
    expect(text).toMatch(/slope\s*=\s*velocity/i);
  });

  it("shows the actual OLS calculation with velocity, speed, mph, direction, r² and samples", () => {
    const { host } = mount();
    const text = host.textContent!;
    expect(text).toMatch(/best[- ]fit/i);
    expect(text).toMatch(/128/);
    expect(text).toMatch(/r² = 0\.98/);
    expect(text).toMatch(/2\.06/);
    expect(text).toMatch(/2\.2369/); // the conversion factor
    expect(text.toLowerCase()).toMatch(/away/);
  });

  it("carries the speed-limit comparison and the interval duration", () => {
    const { host } = mount();
    const text = host.textContent!;
    expect(text).toMatch(/5 mph limit/);
    expect(text).toMatch(/3\.16 s/);
  });

  it("teaches the endpoint-check vs best-fit-calculation distinction", () => {
    const { host } = mount();
    const text = host.textContent!.toLowerCase();
    expect(text).toMatch(/intuitive check/);
    expect(text).toMatch(/actual calculation/);
  });

  it("calls out a >10% disagreement between the two-point and best-fit slopes", () => {
    const { host } = mount(); // endpoint 1.0 vs OLS 2.06 — far apart
    expect(host.querySelector(".speed-explain__callout")).not.toBeNull();
    expect(host.querySelector(".speed-explain__callout")!.textContent).toMatch(/best[- ]fit/i);
  });

  it("no callout when the two slopes agree", () => {
    const { host } = mount({
      endpoint: {
        startSeconds: 0,
        endSeconds: 4,
        startMeters: 1,
        endMeters: 3,
        deltaSeconds: 4,
        deltaMeters: 2,
        slopeMetersPerSecond: 0.5,
      },
      ols: { slopeMetersPerSecond: 0.5, interceptMeters: 1, rSquared: 0.99, sampleCount: 100 },
    });
    expect(host.querySelector(".speed-explain__callout")).toBeNull();
  });

  it("omits the two-point section for a too-short interval but keeps the calculation", () => {
    const { host } = mount({ endpoint: null });
    expect(host.querySelector(".speed-explain__twopoint")).toBeNull();
    expect(host.querySelector(".speed-explain__ols")).not.toBeNull();
    expect(host.textContent).toMatch(/2\.06/); // still shows the best-fit slope
  });

  it("Esc and backdrop close; teardown removes it", () => {
    const { host, input, teardown } = mount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(input.onClose).toHaveBeenCalledTimes(1);
    const overlay = host.querySelector(".show-large") as HTMLElement;
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(input.onClose).toHaveBeenCalledTimes(2);
    teardown();
    expect(host.querySelector(".show-large")).toBeNull();
  });
});
