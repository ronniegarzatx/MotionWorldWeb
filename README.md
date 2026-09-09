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

**Now:** the Motion World application — a **six-tool** Home, all active:
**Live Lab**, **Data Display**, **Walk the Line**, **Snapshot Lab**,
**Speed Lab**, **Sequence Lab** — plus a **Runs** utility and a special
non-educational mode, **Art Party**, on the sensor/acquisition/model layer
built and hardware-verified in M0. Protocol diagnostics live behind
`?debug=sensor`.

| | |
|---|---|
| **Tools** | Live Lab · Data Display · Walk the Line · Snapshot Lab · Speed Lab · Sequence Lab |
| **Special mode** | Art Party (`#/art`) — live sensor-powered generative visuals. Non-educational: no graphs, numbers, or lesson copy — the sensor becomes a creative instrument. |
| **Utility** | Runs (`#/runs`) — saved collections |
| **Themes** | Midnight (default) · Daylight · Dusk · Kusama Dots — header picker, persists locally, token-only |

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
- **Milestone 3 — Snapshot Lab.** Turn a dense position-vs-time run into a clean
  classroom coordinate set you can model with an equation.
  - **The measured `MotionRun` is never modified.** The Classroom Snapshot is a
    derived, session-only coordinate view.
  - Choose an interval on the graph (draggable handles or Start/End steppers),
    then **Make Snapshot** — the interval is rescaled onto a classroom x/y grid.
    A **dense Motion trace** (every selected sample, unrounded) preserves the
    shape of the walk; on top of it sit a few larger representative **Points**
    (3–10, default 5, deterministic), rounded to the nearest 0.5 for readability
    — **the model fit uses the unrounded values.**
  - Fit **Constant / Linear / Quadratic / Cubic / Absolute value / Square root /
    Exponential** — a family may honestly refuse if the points don't support it.
    **Suggest** deterministically picks the simplest model that fits well enough.
  - The big **`f(x) ≈ …`** is a classroom-friendly *approximation* (coefficients
    snapped for readability); a smaller **`precise fit: f(x) = …`** and `r²` stay
    visible, and the graph's model curve is the *exact* regression. **Show Large**
    is a projector overlay; long equations never crop.
  - Works from the latest run or a saved run (**Runs → Open in Snapshot**) —
    no sensor needed.

- **Milestone 4 — Speed Lab.** Turn a selected section of position-vs-time
  motion into an honest speed / velocity calculation for the class.
  - Collect a run in Speed Lab (the result appears **after Stop**, never live),
    use the latest run, or open a saved one (**Runs → Open in Speed Lab**, no
    sensor needed). Drag the shaded `AnalysisWindow` band to pick the interval.
  - **The number on screen is the ordinary-least-squares best-fit slope of every
    sample in the selected interval** — not `(last − first) ÷ Δt`. The
    two-point endpoint slope appears only inside **"How was this speed
    calculated?"** as the intuitive check, alongside the honest note that Motion
    World uses the best-fit slope of all the samples.
  - **Speed** is an unsigned magnitude: big **mph** (and smaller m/s).
    **Velocity** keeps its sign (`+2.06 m/s`). **Direction** is a word — *away
    from sensor* (positive slope) / *toward sensor* (negative) / *stationary*
    (|slope| < 0.05 m/s). Never "negative speed".
  - `mph = |slope| × 2.2369362920544` — one centralized, tested constant
    (`MPH_PER_MPS`).
  - Compared against a **speed-limit preset** — `2 / 5 / 10 mph`, default 5 —
    with a plain "0.4 mph under the 5 mph limit" line. **No scoring, no stars,
    no pass/fail.**
  - Refuses with plain copy (never NaN) for an interval that is too short or has
    invalid timestamps.

- **Milestone 5 — Sequence Lab (Bounce + Pendulum).** Turn a real physical
  cycle into a discrete sequence students can analyse by index `n`. Two modes,
  optimised — no generic sequence framework, no timed/manual capture, no
  sinusoid fitting.
  - **Everything is derived from the immutable raw `MotionRun`, after Stop.**
    Nothing rewrites raw samples; derived events / terms / ratios are session-only
    and not persisted. Works from the latest run, a fresh collection, or a saved
    run (**Runs → Open in Sequence Lab**, no sensor).
  - **Bounce:** detects the bounce apexes (orientation-agnostic — apex may be a
    maximum *or* a minimum), cross-checks a settled resting level and **refuses
    honestly** if the ball never settles, then plots `n` vs **bounce height**
    (`abs(apex − resting level)`) and a robust **common ratio** `r ≈ …` with a
    `RATIO LOOKS CONSISTENT` / `RATIO VARIES` verdict and, with enough terms,
    `aₙ ≈ a₁·rⁿ⁻¹`.
  - **Pendulum:** detects the swing extrema and a robust midline, then either
    **TURNING-POINT AMPLITUDE** (`|extremum − midline|` per half-cycle → an
    approximate decay + amplitude ratio) or **PERIOD** (full periods from like
    extrema, with a deterministic side-selection rule → **AVERAGE PERIOD** `T ≈ …`
    and a `PERIOD LOOKS CONSISTENT` / `PERIOD VARIES` verdict). No forced
    arithmetic/geometric language.
  - One compact `PEAK SENSITIVITY` control (`Low / Standard / High`) reruns
    detection on the same run — never recollects. A lightweight non-destructive
    term range trims a poor first/last event; excluded events stay visible,
    muted, never deleted.
  - All cycle detection and sequence maths are bundled TypeScript — no SciPy, no
    Pyodide, no remote DSP.

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

**Six tools, all shipped:** Live Lab · Data Display · Walk the Line · Snapshot
Lab · Speed Lab · Sequence Lab (Bounce + Pendulum).

**Plus one special mode:** Art Party (`#/art`) — a non-educational, sensor-driven
generative visuals instrument. No graphs, equations, or numbers; six Canvas 2D
effect families respond live to the same sensor stream, through the same
`AcquisitionController`. Silent, no persistence beyond the ordinary Runs
autosave, respects `prefers-reduced-motion`.

**Out of V1:** Inverse Lab, a full Pendulum Lab / sinusoid fitting, a general
sequence framework, standards, accounts, cloud sync, any backend, student
live-view/broadcast.

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
