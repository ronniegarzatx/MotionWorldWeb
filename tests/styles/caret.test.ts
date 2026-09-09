import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// import.meta.glob's `?raw` query returns an empty string for .css under
// this project's node-environment Vitest config, so read the file directly.
const resetCss = readFileSync(
  fileURLToPath(new URL("../../src/styles/reset.css", import.meta.url)),
  "utf8",
);

/**
 * Motion World has no text-entry fields anywhere in the ordinary app. A
 * blinking insertion caret in ordinary text (from browser caret-browsing, or
 * a stray focusable/selectable element) makes the classroom projection read
 * as an editable document. We cannot make jsdom render a physical blinking
 * caret, so this guards the CSS *intent*: ordinary content is transparent,
 * and the few genuinely editable element types explicitly regain a caret.
 */
describe("caret CSS policy", () => {
  it("suppresses the caret on ordinary body content", () => {
    expect(resetCss).toMatch(/body\s*{[^}]*caret-color:\s*transparent/);
  });

  it("explicitly restores the caret for input, textarea, and contenteditable", () => {
    const restoreRule = resetCss.match(/([^{}]*)\{([^}]*caret-color:\s*auto[^}]*)\}/);
    expect(restoreRule).not.toBeNull();
    const [, selector, body] = restoreRule!;
    expect(selector).toMatch(/input/);
    expect(selector).toMatch(/textarea/);
    expect(selector).toMatch(/\[contenteditable="true"\]/);
    expect(body).toMatch(/caret-color:\s*auto/);
  });

  it("does not resort to a blanket user-select: none", () => {
    expect(resetCss).not.toMatch(/\*\s*{[^}]*user-select:\s*none/);
    expect(resetCss).not.toMatch(/body\s*{[^}]*user-select:\s*none/);
  });
});
