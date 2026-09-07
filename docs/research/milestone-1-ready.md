# MOTION WORLD WEB — MILESTONE 1 READY

The application shell, five-tool Home (Live Lab + Data Display active), Live Lab,
and Data Display are built on the hardware-verified Milestone Zero sensor stack,
tested, and deployed. **No new hardware behaviour is claimed** — the physical
acceptance below is the next gate.

## HARDWARE STATUS

- **Milestone Zero: PASSED — feasibility class A (DIRECT WEBHID VIABLE),
  HARDWARE VERIFIED.** Windows work PC + Chrome + GitHub Pages HTTPS + Vernier
  **Go! Motion ver 1.02** (VID `0x08F7` / PID `0x0004`).
- **Hardware-confirmed (see `go-motion-webhid-protocol.md` §0):** plain-HID
  enumeration, no driver/admin; INIT round-trip `1a 02` → `9a 1a`; `SET_PERIOD`
  + `START` + a real distance stream at **25.0 Hz / ~40 ms**; a **1894-sample,
  75.7 s** completed `MotionRun`; physical blue-button **STOP**; **auto-reconnect
  of a previously granted device on startup**; `micron × 1e-6 → metres` plausible
  across ≈ 0.16–4.30 m.
- **One remaining small sensor check (not an M1 blocker):** physical-button
  **START** from `SENSOR_READY` (code path is identical to on-screen Start and is
  unit-tested; only a hardware demonstration is missing). Also outstanding:
  deliberate unplug→`DEVICE_LOST`→replug, many-cycle + >5-min endurance, formal
  distance calibration.

## ARCHITECTURE

- **Graph:** hand-rolled **SVG** (`src/ui/chart/time-series-chart.ts`) — one
  `<path>` trace, `<line>`/`<text>` axes, vector text for projector clarity.
  Pure geometry (`computeXDomain` auto-grow → 30 s slide, `computeYDomain` with
  hysteresis, `makeScale`, `buildPathD`) is unit-tested. `overlays` / `markers`
  / `selection` are in the contract for Snapshot Lab (M5); `selection` renders a
  static band today. Canvas escape hatch documented in the design, not built.
- **App/controller ownership:** one composition root (`src/app/app.ts`) builds
  `getHid()` → `GoMotionWebHIDAdapter` (or `FakeSensorAdapter` for `?fake`) →
  **one** `AcquisitionController`, then an `AppStore` + hash **router** →
  `mountShell`. Views subscribe to the controller; **no view touches HID**
  (enforced by `tests/architecture.test.ts`). Leaving Live/Data while
  `MEASURING` calls `controller.stopForNavigation()` (partial run frozen + kept,
  connection stays open, sensor stays armed). Boot fires a **non-blocking**
  `controller.reconnect()`.
- **Debug route:** `#/diagnostics` mounts the refactored M0 spike
  (`src/dev/sensor-diagnostics-view.ts`: device descriptor, event log, raw HID
  ring, timing) — reachable **only** with `?debug=sensor` or `?fake`; a
  "Diagnostics" header link shows only then. Teacher UI never renders
  `protocol_init_failed`, report IDs, or hex.
- **Fake mode:** `?fake` (FakeSensorAdapter, synthetic 25 Hz trace),
  `?fake&debug=sensor` composes.
- **Controller additions (all additive, TDD'd):** `AcquisitionUiState.connecting`,
  `stopForNavigation()`, `currentRunSamples()` / `lastCompletedRun()`,
  `StopReason` `"navigation"`.
- **Design system:** `src/styles/` — semantic **dark-first** tokens, fluid
  `clamp()` type scale (Data Display number huge at 1920, fits at 1024), space
  scale; hand-written, no framework, no CDN. Light theme is M7.
- **Routing:** hash (`#/`, `#/live`, `#/data`, `#/diagnostics`) — works from the
  GitHub Pages subpath and any static host; `?fake`/`?debug` survive navigation.
- **`requestAnimationFrame`** (Live Lab redraw coalescing) is **bound to
  `globalThis`** — the M0 `TypeError: Illegal invocation` lesson carried forward.

## HOME

Five equal peer tiles: **Live Lab · Data Display · Snapshot Lab · Speed Lab ·
Sequence Lab**. Live Lab + Data Display are active and navigate. Snapshot / Speed
/ Sequence are visibly present, **disabled**, labelled "Coming next", and inert.
No roadmap row, no Activity Library, no Standards. Plus the persistent header:
"Motion World" wordmark (= Home), the shared acquisition bar, and (dev only) a
Diagnostics link.

## LIVE LAB

- Position-vs-Time SVG graph dominates the screen; X "Time (s)", Y "Position
  (m)"; X auto-grows to 10 s then slides a 30 s window; Y auto-scales with
  hysteresis.
- Live trace at ~25 Hz — samples append to a buffer, redraw coalesced to one
  animation frame.
- **STOP** freezes the completed `MotionRun` on screen (full sample set). A new
  run clears the trace first.
- Navigating Home and back **restores** the trace from
  `controller.currentRunSamples()` (measuring) or `lastCompletedRun()` (frozen)
  with **no acquisition restart, no USB reopen**.
- Small stat strip only: Elapsed, Position, Samples. **No HID log** — that's the
  `?debug=sensor` view.

## DATA DISPLAY

- One **huge** POSITION value (fluid `clamp()`, fills the width), TIME secondary,
  a tiny sample count. No card, colour only.
- **"—"** before the first sample. Live-updates while `MEASURING`. **Retains**
  the last value after Stop. **Reset** blanks it to "—" **without disarming**
  (`state` stays `SENSOR_READY`). A fresh run blanks it first.
- Metres.

## TESTING

- **163 tests, 26 files, all green.** `tsc --noEmit` clean (strict). `vite build`
  clean — **42 kB JS / 13.8 kB gzip**, 7 kB CSS. `npm audit`: 0 vulnerabilities.
  `npm ci` reproducible.
- Kept all Milestone Zero tests (protocol codec, adapter vs FakeHid, acquisition
  machine, timing, models, diagnostics, the `Illegal invocation` regression).
- New: controller hooks; flags/router/app-store; DOM primitives; the SVG chart
  geometry + DOM; the acquisition bar (friendly copy per state, no scary
  vocabulary, guarded intents) + the Space key guard (no focused-button
  double-fire, ignores repeat / editable fields); Home (5 tiles, active/disabled);
  the composition root (one controller across navigation, `stopForNavigation` on
  leave, unsupported screen, `#/diagnostics` gating); Live Lab (trace grows,
  freeze on stop, clear on new run, restore on remount, no restart); Data Display
  (— / live / retained / reset); `presentation-state` (JSON-round-trips, no
  functions/DOM); the **sensor-boundary architecture guard**.
- **No test claims physical-hardware behaviour.** SOFTWARE VERIFIED vs HARDWARE
  VERIFIED maintained.
- **Browser projector audit:** manual — `docs/research/milestone-1-projector-audit.md`
  (5 widths × the M1 screens). No browser-automation tool is available in this
  environment, so the visual pass is the human's; the structure guard runs in CI.

## GITHUB

- repo: `https://github.com/ronniegarzatx/MotionWorldWeb` (public)
- final commit: **`fcfd968`** on `main` (`0e6e27b..fcfd968` pushed, no force)
- Pages: GitHub Actions → Pages, run `101827003408` **success**
  (build: `npm ci` + tests + tsc + build; deploy)
- **live URL: https://ronniegarzatx.github.io/MotionWorldWeb/** — verified 200,
  assets 200, bundle carries the M1 shell, CSP `connect-src 'self'`.

## NEXT PHYSICAL ACCEPTANCE

On the Windows PC, Chrome/Edge, **https://ronniegarzatx.github.io/MotionWorldWeb/**
(hard-refresh). Sensor plugged in.

1. **Live Lab, real sensor** — open Live Lab → the bar auto-reconnects to
   "System Ready" (or click **Connect Sensor**) → **Sensor Ready** → **Start** →
   walk a target 0.5–3 m → confirm the **position-vs-time graph draws a smooth
   trace** and the Elapsed / Position / Samples stats climb → **Stop** → the run
   freezes on screen. Start again → the trace clears and a new run draws.
2. **Data Display, real sensor** — go to Data Display → **Start** → confirm the
   **big POSITION number tracks distance** and is readable across the room; TIME
   ticks up → **Stop** → the last value stays → **Reset** → "—". Check it's
   still "Sensor Ready" (not disarmed).
3. **Blue-button START** — in Live Lab at "Sensor Ready", **press the physical
   blue button** (do not click Start) → confirm it goes to "Collecting" and the
   graph starts. Press again → it stops. (This is the one unverified path.)
4. **Home/tool navigation while connected** — Start a run in Live Lab, then click
   the "Motion World" wordmark to go Home, then back into Live Lab → confirm the
   sensor **stayed connected** (no re-pair), the run was **stopped and kept**
   (visible frozen on return), and Start works again immediately.

Report anything that clips, overflows, or reads wrong at your projector
resolution (checklist in `milestone-1-projector-audit.md`).

**Do not begin Snapshot Lab.** M2 (AnalysisWindow + IndexedDB run store + Runs
panel) is next, after this acceptance.
