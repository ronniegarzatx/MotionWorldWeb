# Motion World Web

A zero-install, browser-based classroom motion instrument — the successor to
the native macOS **Motion World** app (`github.com/ronniegarzatx/MotionLab`,
tagged `v1.0.0`).

## The idea

A teacher on an ordinary Windows school PC:

1. plugs a Vernier **CBR 2 / Go!Motion** sensor into USB,
2. opens Motion World Web in the **Chrome or Edge** already on the machine,
3. clicks **Connect Sensor** and approves one browser permission prompt,
4. teaches with it, and projects it for the class.

No Python. No installed helper or driver. No local web server. No backend.
No account. Completed runs are saved **locally in the browser** (IndexedDB).

## Status

**Milestone Zero — PASSED (2026-09-07), feasibility class A, hardware-verified.**
On a Windows work PC in Chrome via the GitHub Pages HTTPS URL, a real Vernier
**Go! Motion ver 1.02** connected, auto-reconnected, armed, streamed a 25 Hz
position trace, completed a 1894-sample run, and stopped from the physical blue
button — with no native helper, driver, backend, or admin rights. Direct WebHID
is viable.

**Now:** the Motion World application — a six-tool Home with **Live Lab**,
**Data Display**, and **Walk the Line** active, a **Runs** utility, on the
sensor/acquisition/model layer built and hardware-verified in M0. Protocol
diagnostics live behind `?debug=sensor`.

| | |
|---|---|
| **Tools** | Live Lab · Data Display · Walk the Line |
| **Utility** | Runs (`#/runs`) — saved collections |
| **Coming next** | Snapshot Lab · Speed Lab · Sequence Lab |

- **Milestone 1** — app shell, Home, Live Lab, Data Display, shared acquisition
  control, web-native dark-first design system.
- **Milestone 1.5 — Walk the Line** — a **visual graph-match** instrument: a
  fixed *target* position-vs-time graph with the student's **real sensor trace**
  drawn live on top, in the same coordinate system. **No scoring** — no %, RMSE,
  stars, grades, or leaderboards; the question is just "can you match this
  graph?". 8 canonical targets (Stand Still · Walk Away · Walk Toward ·
  Positive/Negative Constant Rate · Stop → Move · Stop → Move → Stop ·
  Away → Pause → Toward). The live overlay is intentional. Reuses the Live Lab
  SVG chart (`ui/chart/time-series-chart.ts`) with a `target` curve + plot
  clipping; **fixed** axes from the target (unlike Live Lab's auto-scale).
- **Milestone 2 — Movable target + Local Runs + AnalysisWindow.**
  - *Walk the Line:* the target position is **movable** — drag it vertically or
    use `− 0.5 m` / `+ 0.5 m` / Reset. The same graph *shape* at a different
    height is still the same kind of motion. The catalog stays immutable
    (movement is a render-time translation); axes stay fixed; controls lock
    while collecting.
  - *Runs:* every completed collection — including partial ones (you left the
    tool, or the sensor was unplugged) — is **saved on this device** in
    IndexedDB. **Runs are stored on this device; they can be lost if the browser
    or site data is cleared.** No account, no backend, no cloud. `#/runs` lists
    them newest-first; open one to see its graph with no sensor needed. If
    durable storage isn't available (some `file://` contexts) the app falls back
    to temporary in-memory storage and says so.
  - *`AnalysisWindow`* — a pure, immutable interval selection over a run. The
    foundation Snapshot Lab and Speed Lab will build on. Not a user feature yet.

- Design spec: [`docs/superpowers/specs/2026-09-06-motion-world-web-v1-design.md`](docs/superpowers/specs/2026-09-06-motion-world-web-v1-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-09-07-webhid-sensor-spike.md`](docs/superpowers/plans/2026-09-07-webhid-sensor-spike.md)
- Protocol research: [`docs/research/go-motion-webhid-protocol.md`](docs/research/go-motion-webhid-protocol.md)
- Windows test procedure: [`docs/research/webhid-spike-windows-test.md`](docs/research/webhid-spike-windows-test.md)
- Readiness report: [`docs/research/milestone-zero-ready.md`](docs/research/milestone-zero-ready.md)

**Live spike (for the Windows + CBR 2 test):**
<https://ronniegarzatx.github.io/MotionWorldWeb/> — deployed from `main` by
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
(GitHub Actions → Pages, static, no backend).

### Running

```
npm ci
npm run dev            # http://localhost:5173  (a secure context for WebHID)
npm test               # unit tests, no hardware needed
npm run build          # normal web build -> dist/  (multi-file, GitHub Pages)
npm run build:portable # self-contained offline build -> dist-portable/MotionWorld.html
```

**One source tree, two build targets.** `npm run build` is the known
hardware-verified deployment (the GitHub Pages HTTPS site). `npm run build:portable`
runs the same Vite build and then inlines the single CSS bundle and single JS
bundle into **one file** — `dist-portable/MotionWorld.html` — with no sibling
assets, no CDN, no fonts, no network dependency. Open it directly (`file://`) or
copy it anywhere.

> **`file://` + hardware:** the portable file's UI (Home, Live Lab, Data Display,
> Walk the Line, `?fake`) works offline. Whether **WebHID** works from `file://`
> is browser/platform-dependent and **must be physically verified** — open
> `MotionWorld.html?debug=sensor` and read the Environment panel (protocol /
> secure context / WebHID available). Do not assume; the HTTPS build remains the
> verified path.

URL flags:

- `?fake` — run against `FakeSensorAdapter` (no hardware; use this on the Mac).
- `?debug=sensor` — reveal the developer **Sensor Diagnostics** view
  (`#/diagnostics`): device descriptor, event log, raw HID ring, timing. Compose
  with `?fake` (`?fake&debug=sensor`). Not shown to teachers.
- `?broad` — **development only**: widen the HID chooser to any Vernier device.

> `npm` in this environment gates package install scripts; `package.json`
> carries an `allowScripts` entry for the exact `esbuild` build. If you bump
> `vite`/`vitest`, run `npm install-scripts approve esbuild` once.

### Architecture boundary (enforced)

`navigator.hid` is named in exactly one file (`src/sensor/hid.ts`). HID report
bytes live in exactly one production module (`src/sensor/go-motion-webhid.ts`)
plus its pure helpers. The UI issues intents to `AcquisitionController` and
never touches HID. See the plan for the full module map.

## Scope (V1)

**Five tools:** Live Lab · Data Display · Snapshot Lab · Speed Lab · Sequence Lab.

**Out of V1:** Inverse Lab, Walk the Line, Pendulum Lab, standards, accounts,
cloud sync, any backend, student live-view/broadcast.

## Architecture in one paragraph

The sensor is reached only through a `SensorAdapter` interface; its first
implementation, `GoMotionWebHIDAdapter`, is the **only** module that knows HID
report bytes. Above it, a single app-lifetime `AcquisitionController` owns the
one persistent connection and the one acquisition state machine, and publishes
the one authoritative sample stream. Completed collections are frozen into an
**immutable `MotionRun`**; every lab and every analysis is a pure, downstream
transform of a run and never rewrites a raw observation. Runs persist in
IndexedDB. Presentation state is kept as one serializable object so a future
student-broadcast feature could be added without a rewrite — but Web V1 writes
no networking code.

## Tech (planned)

Vite · TypeScript (`strict`) · browser-native DOM + CSS (no React unless a
concrete V1 reason appears) · WebHID · IndexedDB (from Milestone 2) · Vitest
(+ Playwright later). No Pyodide, no SciPy/NumPy — numerical routines are ported
to focused TypeScript modules whose tests mirror the native suite.

## Relationship to the native app

Motion World Web is an **independent project**. It inherits the product
knowledge and the numerical ideas (the Classroom Snapshot transform, the
classroom-approximate-equation display rule, the honest two-slope Speed Lab
teaching view, the "steps not jumps" Sequence Lab), **not** the desktop
codebase. The native app is now maintenance-only.
