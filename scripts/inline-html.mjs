/**
 * Pure string transform used by `npm run build:portable`. No I/O.
 *
 * Takes the Vite-built `index.html` plus the contents of the single CSS bundle
 * and single JS bundle it references, and returns one self-contained HTML
 * string: stylesheet inlined into <style>, module script inlined into
 * <script type="module">, all `assets/` references gone, and the CSP swapped
 * for a policy that works from `file://` with nothing external.
 */

/** CSP for the single-file offline artifact: inline is allowed (it is one file
 *  we built), nothing external, no network. */
export const PORTABLE_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";

const guardClose = (code, tag) =>
  code.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);

export function inlineHtml({ html, css, js, portableCsp = PORTABLE_CSP }) {
  let out = html;

  // 1. <link rel="stylesheet" ... href="...assets/x.css"> -> <style>…</style>
  out = out.replace(
    /<link\b[^>]*\brel=["']stylesheet["'][^>]*>\s*/gi,
    () => `<style>\n${guardClose(css, "style")}\n</style>\n`,
  );

  // 2. <script type="module" ... src="...assets/x.js"></script> -> inline
  out = out.replace(
    /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'][^"']+["'][^>]*>\s*<\/script>/gi,
    () => `<script type="module">\n${guardClose(js, "script")}\n</script>`,
  );

  // 3. swap the CSP for the offline single-file policy
  out = out.replace(
    /(<meta\b[^>]*\bhttp-equiv=["']Content-Security-Policy["'][^>]*\bcontent=")[^"]*(")/i,
    `$1${portableCsp}$2`,
  );

  return out;
}

/** Assertions run against the produced HTML — throws on the first failure. */
export function assertPortable(html) {
  const fail = (m) => {
    throw new Error(`portable artifact check failed: ${m}`);
  };
  if (!/<style>/.test(html)) fail("no inline <style>");
  if (!/<script type="module">/.test(html)) fail("no inline module <script>");
  if (/\b(?:src|href)=["']\.?\/?assets\//i.test(html)) fail("still references assets/…");
  if (/\b(?:src|href)=["']https?:\/\//i.test(html)) fail("external src/href URL");
  if (/https?:\/\/[^"'\s)]+\.(?:js|mjs|css|woff2?|ttf|otf|png|svg|jpe?g|gif|webp)\b/i.test(html))
    fail("external asset URL");
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\./i.test(html)) fail("CDN / Google Fonts reference");
  if (!/<title>[^<]*Motion World/i.test(html)) fail("Motion World title missing");
  if (!/Walk the Line/.test(html)) fail("Walk the Line content not represented");
  if (!/Content-Security-Policy/i.test(html) || !/default-src 'none'/.test(html))
    fail("portable CSP not applied");
  if (html.length < 20_000) fail(`output implausibly small (${html.length} bytes)`);
}
