/**
 * `npm run build:portable` — one codebase, a second build target.
 *
 * Runs the normal Vite production build into a throwaway directory, then inlines
 * the single CSS bundle and single JS bundle into `index.html` and writes:
 *
 *     dist-portable/MotionWorld.html
 *
 * That is the only file needed at runtime — no sibling assets, no network, no
 * CDN, no fonts. The normal `npm run build` (-> dist/, for GitHub Pages) is
 * untouched.
 *
 * Approach: a ~60-line custom inliner, chosen because the build is trivially
 * simple — exactly one JS chunk + one CSS file, no images, no fonts, no dynamic
 * imports. A single-file Vite plugin would add a dependency and config surface
 * to inline ~50 kB of our own code. Hashed filenames are read from the built
 * index.html, never hard-coded. Future modules (Snapshot / Speed / Sequence)
 * stay compatible as long as the app remains a single chunk + single stylesheet.
 */
import { build } from "vite";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { inlineHtml, assertPortable, PORTABLE_CSP } from "./inline-html.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = join(ROOT, "dist-portable");
const OUT_FILE = join(OUT_DIR, "MotionWorld.html");

async function main() {
  const tmp = await mkdtemp(join(tmpdir(), "mw-portable-"));

  await build({
    root: ROOT,
    logLevel: "warn",
    build: { outDir: tmp, sourcemap: false, emptyOutDir: true },
  });

  const html = await readFile(join(tmp, "index.html"), "utf8");

  const cssRef = html.match(/href="([^"]+\.css)"/)?.[1];
  const jsRef = html.match(/src="([^"]+\.js)"/)?.[1];
  if (!cssRef || !jsRef) {
    throw new Error("could not locate the built CSS/JS in index.html");
  }

  const strip = (p) => p.replace(/^\.?\//, "");
  const css = await readFile(join(tmp, strip(cssRef)), "utf8");
  const js = await readFile(join(tmp, strip(jsRef)), "utf8");

  const out = inlineHtml({ html, css, js, portableCsp: PORTABLE_CSP });
  assertPortable(out);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, out, "utf8");
  await rm(tmp, { recursive: true, force: true });

  const kB = (Buffer.byteLength(out, "utf8") / 1024).toFixed(1);
  console.log(`\nPORTABLE BUILD OK`);
  console.log(`  ${OUT_FILE}`);
  console.log(`  ${kB} kB — 1 runtime file, no external assets`);
}

main().catch((err) => {
  console.error("\nbuild:portable failed\n", err);
  process.exit(1);
});
