import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// import.meta.glob's `?raw` query returns an empty string for .css under
// this project's node-environment Vitest config, so read the files directly.
const componentsCss = readFileSync(
  fileURLToPath(new URL("../../src/styles/components.css", import.meta.url)),
  "utf8",
);
const tokensCss = readFileSync(
  fileURLToPath(new URL("../../src/styles/tokens.css", import.meta.url)),
  "utf8",
);

/**
 * The projector clipping bug: `.speed-lab` used a plain `1fr` graph row, and
 * `.chart-host` inside it asserted a fixed `64vh` height regardless of how
 * much room the header/deck actually left. A plain `1fr` track has no upper
 * bound, so the fixed-height child forced the row (and the whole page) to
 * overflow a short projector viewport instead of yielding to it. This guards
 * the fix: the row is bounded (`minmax(0, 1fr)`) and the graph fills exactly
 * that bounded space (`height: 100%`), so the header/deck determine what's
 * left for the graph — not the other way around.
 */
describe("Speed Lab projector-fit CSS", () => {
  const speedLabBlock = componentsCss.match(/\.speed-lab\s*\{([^}]*)\}/)![1];
  const chartHostBlock = componentsCss.match(/\.speed-lab \.chart-host\s*\{([^}]*)\}/)![1];

  it("bounds the graph row so it cannot grow past its share of the viewport", () => {
    expect(speedLabBlock).toMatch(/grid-template-rows:\s*auto auto minmax\(0,\s*1fr\)/);
  });

  it("has the graph fill its row instead of asserting a fixed viewport-height", () => {
    expect(chartHostBlock).toMatch(/height:\s*100%/);
    expect(chartHostBlock).not.toMatch(/height:\s*\d+vh/);
  });

  it("still keeps a sane minimum graph height as a floor", () => {
    expect(chartHostBlock).toMatch(/min-height:\s*\d+px/);
  });

  it("reduces the speed headline token for reclaimed vertical space", () => {
    const token = tokensCss.match(/--type-speed:\s*([^;]+);/)![1]!;
    // old ceiling was 6.5rem — the new one must be meaningfully smaller
    // (roughly 20–30%) while staying large enough to read from the back row
    const maxRem = Number(token.match(/([\d.]+)rem\)/)![1]!);
    expect(maxRem).toBeLessThan(6.5 * 0.85);
    expect(maxRem).toBeGreaterThan(6.5 * 0.6);
  });
});
