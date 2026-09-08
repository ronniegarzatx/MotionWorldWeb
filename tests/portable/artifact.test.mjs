import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT_DIR = join(ROOT, "dist-portable");
const OUT_FILE = join(OUT_DIR, "MotionWorld.html");

let html = "";

describe("portable artifact (real build)", () => {
  beforeAll(() => {
    // build:portable itself runs assertPortable and exits non-zero on failure
    execFileSync("node", ["scripts/build-portable.mjs"], { cwd: ROOT, stdio: "pipe" });
    html = readFileSync(OUT_FILE, "utf8");
  }, 120_000);

  it("writes exactly one runtime file: dist-portable/MotionWorld.html", () => {
    expect(existsSync(OUT_FILE)).toBe(true);
    const files = readdirSync(OUT_DIR).filter((f) => statSync(join(OUT_DIR, f)).isFile());
    expect(files).toEqual(["MotionWorld.html"]);
  });

  it("is non-empty and plausibly complete", () => {
    expect(html.length).toBeGreaterThan(40_000); // ~1 JS bundle + CSS inline
  });

  it("has application JS and CSS inline", () => {
    expect(html).toMatch(/<script type="module">[\s\S]*mountWalkTheLineView|<script type="module">[\s\S]{2000,}/);
    expect(html).toMatch(/<style>[\s\S]{1000,}<\/style>/);
  });

  it("has no sibling asset references", () => {
    for (const bad of ['src="/assets/', 'href="/assets/', 'src="./assets/', 'href="./assets/']) {
      expect(html.includes(bad), bad).toBe(false);
    }
    expect(html).not.toMatch(/assets\//);
  });

  it("has no external (http/https) runtime resource references and no CDN/fonts", () => {
    expect(html).not.toMatch(/\b(?:src|href)=["']https?:\/\//i);
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\./i);
  });

  it("carries the current app: title + Walk the Line + Home/Live/Data + Runs", () => {
    expect(html).toMatch(/<title>[^<]*Motion World/i);
    expect(html).toContain("Walk the Line");
    expect(html).toContain("Data Display");
    expect(html).toContain("Live Lab");
    expect(html).toContain("NO SAVED RUNS YET"); // Runs UI is bundled
  });

  it("bundles the local-run storage code (IndexedDB is browser-local, allowed)", () => {
    expect(html).toContain("motion-world"); // the IndexedDB database name
    expect(html).toMatch(/Temporary storage/); // the MemoryRunStore fallback notice
  });

  it("bundles Snapshot Lab (no network math renderer)", () => {
    expect(html).toContain("Classroom Snapshot");
    expect(html).toMatch(/NO RUN TO SNAPSHOT/);
    expect(html).not.toMatch(/mathjax|katex/i);
  });

  it("bundles Speed Lab (OLS math is all local TS)", () => {
    expect(html).toContain("Speed Lab");
    expect(html).toContain("YOUR SPEED");
    expect(html).toMatch(/How was this speed calculated/);
    expect(html).toMatch(/Δposition ÷ Δtime/); // the slope-calc hero string
  });

  it("bundles the theme system with no external assets", () => {
    expect(html).toContain("Kusama Dots");
    expect(html).toContain("Daylight");
    expect(html).toMatch(/data-theme.{0,2}kusama/); // theme token layer inlined (quotes may be minified away)
    expect(html).toContain("motion-world-theme"); // the localStorage key
    // the Kusama dots are pure CSS gradients — no image request
    expect(html).toMatch(/radial-gradient\([^)]*kusama-dot/);
    expect(html).not.toMatch(/url\(\s*["']?https?:/i); // no remote image anywhere
  });

  it("applies the offline CSP", () => {
    expect(html).toMatch(/Content-Security-Policy[\s\S]*default-src 'none'/i);
  });

  it("does not ship a source map reference", () => {
    expect(html).not.toMatch(/sourceMappingURL/);
  });
});
