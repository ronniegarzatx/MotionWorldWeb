# MOTION WORLD WEB — PORTABLE BUILD READY

One codebase, two build targets. Bounded build/deployment feature — no app
redesign, no source fork.

## IMPLEMENTATION

**Approach chosen: A — a tiny custom post-build inliner.** The Vite build is
trivially simple: **exactly one JS chunk + one CSS file**, no images, no fonts
(`system-ui` stack), no dynamic imports, no CDN. A single-file Vite *plugin*
would add a dependency and config surface just to inline ~50 kB of our own code.
The inliner is ~60 lines, reads the hashed filenames from the generated
`index.html` (never hard-coded), and leaves `npm run build` completely untouched.
Future modules stay compatible as long as the app remains one chunk + one
stylesheet.

**Files added:**

| file | role |
|---|---|
| `scripts/inline-html.mjs` | pure string transform: `<link>`→`<style>`, `<script src>`→inline `<script type="module">`, strip `assets/` refs, swap the CSP; `assertPortable()` self-checks |
| `scripts/inline-html.d.mts` | types so the unit test can import the transform |
| `scripts/build-portable.mjs` | runs `vite build` (programmatic) into a temp dir with `sourcemap:false`, inlines, asserts, writes `dist-portable/MotionWorld.html`, cleans up; exits non-zero on any failure |
| `src/dev/environment-report.ts` | pure `readEnv` / `describeEnvironment` / `formatEnvironmentReport` — protocol, secure context, WebHID presence |
| `tests/dev/environment-report.test.ts` | 5 tests |
| `tests/portable/inline-html.test.ts` | 10 tests — the transform + `assertPortable` |
| `tests/portable/artifact.test.mjs` | 8 tests — runs the real `build:portable` and validates the produced file |

**Files changed:** `package.json` (+`build:portable` script), `.gitignore`
(+`dist-portable/`), `vitest.config.ts` (also match `*.test.mjs`),
`src/dev/sensor-diagnostics-view.ts` (+Environment panel),
`.github/workflows/deploy-pages.yml` (+portable self-check step), `README.md`.

**No new runtime dependency.** `vite` (already a devDependency) is used
programmatically by the build script. `npm audit`: 0 vulnerabilities.

## NORMAL BUILD

`npm run build` → `dist/` — unchanged: `index.html` + `assets/index-*.js` +
`assets/index-*.css` + `assets/index-*.js.map`. This is the GitHub Pages
deployment and the hardware-verified path.

## PORTABLE BUILD

`npm run build:portable` →

```
dist-portable/MotionWorld.html      ~57 kB      1 runtime file
```

- **exactly one file** required at runtime (`find dist-portable -type f` →
  `MotionWorld.html` only)
- CSS inlined into `<style>`, JS inlined into `<script type="module">`
- **no** `assets/` references, **no** `http(s)://` `src`/`href`, **no** CDN, **no**
  Google Fonts, **no** source map
- CSP swapped for an offline single-file policy:
  `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
  img-src data:; font-src data:; connect-src 'none'; base-uri 'none';
  form-action 'none'`
- hash routing works internally (`#/`, `#/live`, `#/data`, `#/walk`,
  `#/diagnostics`); `?fake` works from `file://` (query string survives)
- the two remaining `http://www.w3.org/2000/svg` strings are the SVG **XML
  namespace** (never fetched); one `http://localhost` string is documentation
  text inside the unsupported-browser message — neither is a resource reference

## TESTING

- **215 tests, 34 files — all green** (192 → **+23**). `tsc --noEmit` clean.
- `npm run build` clean (multi-file). `npm run build:portable` clean — its own
  `assertPortable()` gate + `tests/portable/artifact.test.mjs` validate the real
  generated file on every `npm test` and in CI.
- The transform is unit-tested with the real Vite output shape, including a
  `</script>`-in-JS guard.

## FILE:// STATUS

**What software proves:** the portable file is fully self-contained — it opens
with no network, no CDN, no fonts, no sibling files; Home / Live Lab / Data
Display / Walk the Line render; hash routing and `?fake` work; nothing crashes if
WebHID is absent (the diagnostics Environment panel explains it).

**What still needs a real browser:** whether **WebHID `requestDevice` works from
`file://`**. Chrome treats `file://` as a secure context (`isSecureContext`
often `true`), so it *may* work — but this is browser-, version-, and
platform-dependent and is **not assumed**. The HTTPS GitHub Pages build remains
the known hardware-verified deployment.

## PHYSICAL TEST (shortest path)

1. `npm run build:portable`, then open `dist-portable/MotionWorld.html` **directly
   in Chrome** (double-click / `File → Open`).
2. Confirm **Home** shows 6 tiles and **Live Lab**, **Data Display**, **Walk the
   Line** each open and render.
3. Open `dist-portable/MotionWorld.html?debug=sensor` → the **Environment** panel
   reports:
   - `origin / protocol` (expect `file:`)
   - `secure context` (yes / no)
   - `WebHID API` (available / unavailable)
4. Plug in the Go!Motion.
5. If **Connect Sensor** is offered (WebHID available), try it → does the picker
   appear and the sensor connect?
6. Repeat on **Windows** Chrome and Edge.

Report the three Environment values + whether Connect Sensor worked, per browser.
