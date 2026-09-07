import { describe, expect, it } from "vitest";
import { assertPortable, inlineHtml, PORTABLE_CSP } from "../../scripts/inline-html.mjs";

// The real Vite output shape (see dist/index.html).
const VITE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'"
    />
    <title>Motion World — Sensor Test</title>
    <script type="module" crossorigin src="./assets/index-Bn8KlH6n.js"></script>
    <link rel="stylesheet" crossorigin href="./assets/index-BlAemoVZ.css">
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
`;

const CSS = ":root{--surface:#0e1014}.walk-lab{display:grid}";
const JS = 'const T="Walk the Line";console.log(T);';

describe("inlineHtml", () => {
  const out = inlineHtml({ html: VITE_HTML, css: CSS, js: JS });

  it("inlines the stylesheet into <style> and drops the <link>", () => {
    expect(out).toContain(`<style>\n${CSS}\n</style>`);
    expect(out).not.toMatch(/<link[^>]*stylesheet/i);
  });

  it("inlines the module script and drops the src", () => {
    expect(out).toContain(`<script type="module">\n${JS}\n</script>`);
    expect(out).not.toMatch(/<script[^>]*\bsrc=/i);
  });

  it("removes every assets/ reference", () => {
    expect(out).not.toMatch(/assets\//);
  });

  it("swaps in the offline CSP", () => {
    expect(out).toContain(PORTABLE_CSP);
    expect(out).not.toContain("script-src 'self'");
  });

  it("keeps the title and body mount point", () => {
    expect(out).toMatch(/<title>Motion World/);
    expect(out).toContain('<div id="app">');
  });

  it("guards a literal </script> inside the JS", () => {
    const evil = inlineHtml({ html: VITE_HTML, css: CSS, js: 'const s="</script>";' });
    // the only real closing tag is the one we added
    expect(evil.match(/<\/script>/g)).toHaveLength(1);
    expect(evil).toContain("<\\/script>");
  });
});

describe("assertPortable", () => {
  const good = inlineHtml({ html: VITE_HTML, css: CSS, js: JS });

  it("passes a well-formed artifact", () => {
    // still fails html.length < 20_000 for this tiny fixture — pad it
    const padded = good.replace("</body>", `<!-- ${"x".repeat(21_000)} -->\n</body>`);
    expect(() => assertPortable(padded)).not.toThrow();
  });

  it("rejects a leftover asset reference", () => {
    expect(() => assertPortable(good + '<script src="./assets/x.js"></script>')).toThrow(
      /assets/i,
    );
  });

  it("rejects an external URL", () => {
    expect(() =>
      assertPortable(good + '<link href="https://fonts.googleapis.com/css">'),
    ).toThrow();
  });

  it("rejects output with no inline script", () => {
    expect(() => assertPortable("<html><style>x</style><title>Motion World</title></html>")).toThrow(
      /inline module <script>/i,
    );
  });
});
