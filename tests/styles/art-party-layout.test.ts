import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// import.meta.glob's `?raw` query returns an empty string for .css under
// this project's node-environment Vitest config, so read the file directly
// (see tests/styles/caret.test.ts for the same workaround).
const layoutCss = readFileSync(
  fileURLToPath(new URL("../../src/styles/layout.css", import.meta.url)),
  "utf8",
);

/**
 * Regression guard for a real production bug: `.art-party`'s only children
 * (canvas + overlay) are both `position: absolute`, so it has zero
 * normal-flow content. `flex: 1` inside a flex/grid ancestor chain whose own
 * height comes only from `min-height` (never an explicit `height`) had
 * nothing definite to grow against, and the whole route rendered at a real,
 * measured `height: 0` in production browsers — confirmed via
 * getBoundingClientRect() on the live site (width 921, height 0) even
 * though the DOM (canvas, overlay, buttons) was all present. jsdom-based
 * tests never caught this because jsdom does not perform real layout.
 */
describe("Art Party layout — height must not depend on flex-grow", () => {
  const artPartyBlock = layoutCss.match(/\.art-party(?!_)\s*\{([^}]*)\}/)![1]!;

  it("declares an explicit, ancestor-independent height", () => {
    expect(artPartyBlock).toMatch(/height:\s*100vh/);
  });

  it("does not rely on flex: 1 for its height (flex-basis:0% would ignore an explicit height)", () => {
    expect(artPartyBlock).not.toMatch(/flex:\s*1\b/);
  });
});
