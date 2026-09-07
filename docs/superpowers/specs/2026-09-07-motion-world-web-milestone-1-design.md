# Motion World Web — Milestone 1 Design

**Date:** 2026-09-07
**Predecessor:** Milestone Zero — WebHID sensor spike, **PASSED / class A /
hardware-verified** (Windows + Chrome + Vernier *Go! Motion ver 1.02*). The
`SensorAdapter` → `GoMotionWebHIDAdapter` → `AcquisitionController` →
`MotionSample` / `MotionRun` layer already exists and is hardware-verified.
**Parent spec:** `docs/superpowers/specs/2026-09-06-motion-world-web-v1-design.md`
(approved). This document resolves the M1 architecture; it does not re-open the
product requirements.

---

## 1. Scope

**In:** Motion World application shell · five-tool Home (Live Lab + Data Display
active; Snapshot / Speed / Sequence present but disabled) · Live Lab · Data
Display · one shared acquisition control · a web-native design system ·
auto-reconnect on startup · developer sensor diagnostics behind `?debug=sensor` ·
`?fake` retained.

**Out (later milestones — do not build, do not stub with real code):** Snapshot
Lab, Speed Lab, Sequence Lab, `AnalysisWindow`, IndexedDB / `runStore` / Runs
panel, `PresentationState` broadcast/networking, accounts, backend, standards,
Inverse / Walk the Line / Pendulum, light theme, PWA manifest.

## 2. Non-negotiables carried from the parent spec

- No lab owns WebHID. One app-lifetime `GoMotionWebHIDAdapter` →
  `AcquisitionController`; tools subscribe downstream and never see HID bytes,
  report IDs, or `navigator.hid`.
- Raw samples immutable; a completed run is a frozen `MotionRun`; every readout
  is a pure derivation.
- No backend, no network calls except loading the static app. CSP stays
  `default-src 'self'; connect-src 'self'`.
- No React/Vue/Svelte, no Pyodide, no state-management library, no CSS framework.
- Static build, deployed to GitHub Pages over HTTPS; must work from a repo
  subpath.
- Teacher UI never shows `protocol_init_failed`, report IDs, or hex.

---

## 3. Graph implementation — decision

**Requirement:** ~25 Hz live position-vs-time trace; crisp axis text on a
classroom projector at 1024×768 → 1920×1080; responsive axes; **future Snapshot
Lab** needs draggable time-interval selection, point markers, and model-curve
overlays; low bundle cost; maintainable with no framework.

### Approach A — hand-rolled SVG *(recommended)*

One `<svg>` per chart. The trace is a **single `<path>`** whose `d` is rebuilt on
a `requestAnimationFrame` tick (not per sample). Axes/grid/labels are `<line>` /
`<text>`. Interaction (Snapshot's window band, point hover) is ordinary DOM
events on SVG elements.

- **+** Vector text — sharp at any projector scale / DPI, no `devicePixelRatio`
  juggling. Themable with CSS variables / `currentColor`. Accessible (`<title>`,
  `role="img"`, `aria-label`).
- **+** Snapshot-ready with no rewrite: add an `overlays` (model `<path>`),
  `markers` (`<circle>`), and `selection` (draggable `<rect>` band) input to the
  same module. Selection math in user units is trivial in SVG.
- **+** Zero dependencies; ~200 lines.
- **−** A polyline of ~7.5 k points (a 5-min run at 25 Hz) as one `<path>` `d`
  string rebuilt each frame: measured cost is a single attribute write of a
  ~120 KB string — comfortably < 1 ms; Chromium renders a 10 k-point path
  smoothly. Only a problem if we make each point its own DOM node (we do not) or
  push to hundreds of thousands of points (not a classroom run).

### Approach B — Canvas 2D

Draw the whole scene each frame to a `<canvas>` sized to `devicePixelRatio`.

- **+** Highest raw throughput; 7.5 k-point polylines per frame are free.
- **−** Raster text — softens when the projector scales or at fractional DPI;
  must re-implement axis layout, hit-testing, hover, and Snapshot's selection as
  manual pixel math; theme change = full redraw after re-reading CSS vars;
  accessibility needs a parallel DOM. More code for the interactive future, for a
  throughput win we do not need at 25 Hz.

### Approach C — µPlot (or similar ~50 KB lib)

- **+** Fast, streaming-oriented, axes/cursor built in.
- **−** Canvas renderer → same projector-text caveat as B. Adds a dependency +
  API surface + version maintenance. Snapshot's bespoke *classroom-coordinate
  rescale + display-points-rounded-to-0.5 + fit-on-unrounded* and the draggable
  window band fight the library model or need plugins. Parent spec §12: adopt a
  lib only if it **clearly** beats hand-rolled on projector clarity + interaction
  + maintenance — here it does not.

### Decision

**Approach A — hand-rolled SVG**, isolated in `src/ui/chart/time-series-chart.ts`
with a stable input contract:

```ts
interface ChartInput {
  series: { readonly t: readonly number[]; readonly x: readonly number[] };
  xDomain?: [number, number] | "auto-grow";   // auto-grow: 0..max(t,10), then slide
  yDomain?: [number, number] | "auto";        // auto: data range + pad, hysteresis
  xLabel: string; yLabel: string;
  // reserved for Snapshot Lab (M5) — not rendered in M1 if absent:
  overlays?: { d: string; kind: "model" }[];
  markers?: { t: number; x: number }[];
  selection?: { startT: number; endT: number; onChange?: (s) => void };
}
function mountChart(host: HTMLElement): {
  update(input: ChartInput): void;
  destroy(): void;
};
```

**Escape hatch (documented, not built):** if profiling a real ≥10-min run ever
shows the SVG trace stutter, only the *trace layer* inside this module swaps to a
`<canvas>` underlay — axes, labels, and Snapshot interaction stay SVG, and Live
Lab / Data Display / Snapshot are untouched. Revisit at M3 profiling and M5.

---

## 4. Application structure & state ownership

No framework. Views are `mount(host, deps) => teardown` functions (the proven M0
pattern). One composition root builds the long-lived objects **once**.

```
src/
  main.ts                     boot only -> app/app.ts
  app/
    app.ts                    composition root: capability check -> build hid/adapter/
                              controller/logs ONCE -> router -> shell mount
    flags.ts                  parse location.search once: { fake, debugSensor }
    app-store.ts              { route } + emitter (theme fixed dark in M1)
    router.ts                 hash router: '#/', '#/live', '#/data', '#/diagnostics'
    presentation-state.ts     minimal serializable snapshot (spec §10 discipline)
  ui/
    shell.ts                  header (wordmark + Home affordance + <AcquisitionBar> +
                              dev-only Diagnostics link) + <main> route outlet
    acquisition-bar.ts        the shared acquisition control (see §6)
    keyboard.ts               global Space = Start/Stop guard (see §6)
    home/home-view.ts         five peer tiles; Live + Data active
    live/live-lab-view.ts
    data/data-display-view.ts
    chart/time-series-chart.ts
    components/               tiny helpers: el(), button(), tile(), stat()
  dev/                        (was spike/) developer-only
    sensor-diagnostics-view.ts   refactored M0 spike UI (descriptor, event log,
                                 raw HID ring, timing) — route '#/diagnostics',
                                 only reachable when ?debug=sensor or ?fake
    diagnostic-log.ts, raw-report-ring.ts     (moved, unchanged)
  sensor/                     unchanged except: surface `connecting`
  acquisition/               + `connecting` flag, `navigation` stop reason,
                              run-snapshot accessors (see §7)
  model/                     unchanged
  styles/
    reset.css, tokens.css, layout.css, components.css
```

- **`AcquisitionController` remains the single acquisition authority.** M1 adds
  only: a `connecting` boolean on `AcquisitionUiState`; a `"navigation"` stop
  reason + `stopForNavigation()`; `currentRunSamples()` and `lastCompletedRun()`
  read-only accessors so a re-mounted Live Lab can restore its trace. All
  additive, each TDD'd.
- **`AppStore`** holds only app-shell UI state (current route). Plain serializable
  object + the same tiny emitter. Theme is a fixed dark token set in M1.
- **`presentation-state.ts`**: a pure function
  `computePresentationState(route, uiState, run) -> PresentationState` returning
  `{ activeTool, connected, acquisitionState, activeRunId, derivedReadouts }` —
  a plain object, no class instances, no DOM. Honors the parent spec's §10
  serialization discipline with **zero networking**. Used now only to keep the
  "one source of truth → render" habit; not persisted, not transmitted.

## 5. Routing / navigation

- **Hash routing.** GitHub Pages serves the app from `/MotionWorldWeb/`; History
  API deep links would 404 on refresh (no static rewrite). Hash routes work on
  any static host and a `localhost` copy. Parent spec §8 permits hash.
- Routes: `#/` Home · `#/live` Live Lab · `#/data` Data Display ·
  `#/diagnostics` (dev only). Unknown / empty hash → Home. The three disabled
  tiles are **not** routes; clicking one does nothing (with a small "coming next"
  affordance).
- `?fake` / `?debug=sensor` are read once at boot into `flags.ts`; hash
  navigation never drops them.
- **Persistent chrome:** the shell header (wordmark = Home affordance top-left,
  the acquisition bar, dev Diagnostics link) is mounted once and survives route
  changes. Only `<main>` swaps.
- **Leaving a tool:** the sensor connection **stays open**. An in-progress
  `MEASURING` is stopped with reason `"navigation"` and the partial run is kept
  and frozen (offered nowhere to save in M1 — just shown if you return). The
  `SENSOR_READY` latch **persists across navigation** (parent spec open-question
  #3 — resolved: match native, less teacher friction).

## 6. Shared acquisition control

`src/ui/acquisition-bar.ts`, rendered purely from `AcquisitionUiState`
(+ the new `connecting` flag). **Teacher language only** — no HID/diagnostic
vocabulary:

| controller state | bar text | primary control(s) |
|---|---|---|
| `NO_DEVICE` (no grant) | "No sensor connected" | **Connect Sensor** |
| `connecting` / `reconnecting` | "Connecting…" | (spinner, no buttons) |
| `SYSTEM_READY` | "System Ready" | **Sensor Ready** |
| `SENSOR_READY` | "Sensor Ready" | **Disarm** · **Start** |
| `MEASURING` | "Collecting" | **Stop** |
| `DEVICE_LOST` | "Sensor disconnected" | **Reconnect** |
| `ERROR` | "Sensor problem" | **Reconnect** (+ "Details" link *only* in debug mode) |

- Conceptual progression preserved: **System Ready → Sensor Ready → Collecting**.
- Controls: **Sensor Ready / Disarm**, **Start / Stop**. Each calls the matching
  guarded `controller` intent.
- **Keyboard (`src/ui/keyboard.ts`):** a single global `keydown` listener.
  `Space` toggles Start/Stop **only when** `document.activeElement` is not an
  editable control (`input`, `textarea`, `select`, `[contenteditable]`) **and not
  an interactive element that natively handles Space** (`button`, `a[href]`,
  `[role=button]`), and `!e.repeat`. It calls `controller.start()` or
  `controller.stop()` per `uiState` and `preventDefault()`s. This prevents the
  focused-button double-activation the prompt calls out. No other global keys.
  No `Q`.
- The **physical blue trigger** already flows through `AcquisitionController`
  (adapter `TriggerEvent` → machine); the bar needs no trigger-specific code —
  it just re-renders when `uiState` changes. Blue-button **STOP** is
  hardware-verified; blue-button **START** is a pending hardware check but the
  code path (`SENSOR_READY` + `trigger.start` → `MEASURING`) is identical and
  already unit-tested.

## 7. Live Lab

- **Position-vs-Time graph dominates the screen.** X = "Time (s)", Y =
  "Position (m)". Auto-grow X (0 … max(t, 10 s), then slide a 30 s window),
  auto Y with padding + hysteresis.
- **Live trace at ~25 Hz:** subscribe to `controller.subscribeSample`; append to
  a plain `number[]` pair buffer; redraw the chart on a `rAF` tick (coalesces
  bursts, caps work at display rate).
- **STOP freezes the completed run:** on `controller.subscribeRunComplete`, hold
  the frozen `MotionRun` and render it statically (full sample set, not the
  capped view buffer).
- **Next run starts clean:** entering `MEASURING` again clears the trace.
- **Navigation safe:** unmount tears down subscriptions; the controller keeps
  running. Re-mounting restores from `controller.currentRunSamples()` (if
  measuring) or `controller.lastCompletedRun()` (if frozen) — no acquisition
  restart, no USB reopen.
- **Small stats strip only:** elapsed time, current position, sample count. **No
  HID diagnostic log.** A "Diagnostics" link appears in the header only under
  `?debug=sensor` / `?fake`.
- No modelling, no windowing (those are Snapshot/Speed, later).

## 8. Data Display

- One **huge** POSITION value — fluid `clamp()` type, fills the viewport width,
  legible from the back of a room. TIME secondary and smaller. Optional tiny
  sample count.
- **Before the first sample:** everything reads "—". Nothing looks like data.
- **While measuring:** live update (per-sample text write of one node; 25 Hz is
  fine, still `rAF`-guarded).
- **After stop:** retain the latest value until the next acquisition or an
  explicit **Reset** (which returns to "—" without disarming).
- **Meters** for V1. Font-colour only for theme — no card, no box around the
  number.

## 9. Sensor connection UX

Ordinary states surfaced (mapped in §6): **No Sensor · Connecting · System
Ready · Sensor Ready · Collecting · Sensor Disconnected**.

- **Auto-reconnect on startup** (hardware-confirmed to work in this Chrome): on
  boot, `app.ts` calls `controller.reconnect()`; the bar shows "Connecting…"
  then "System Ready" on success, or "No sensor connected" + **Connect Sensor**
  if there is no grant / no device. **The UI is never blocked** during reconnect
  — Home renders immediately; the bar updates when the promise settles.
- **Device lost:** bar → "Sensor disconnected" + **Reconnect**; Live Lab freezes
  the partial run; Data Display retains its last value.
- Teacher UI never exposes `protocol_init_failed`, report IDs, or hex — those are
  only on `#/diagnostics`.

## 10. Developer diagnostics (retain the M0 spike)

- The M0 `spike-view` is refactored into `dev/sensor-diagnostics-view.ts` at
  route **`#/diagnostics`**, reachable **only** when `?debug=sensor` or `?fake`
  is in the URL (otherwise the route redirects to Home and no header link shows).
- Retains: device descriptor panel, event log, raw HID ring (bounded,
  PAUSE/CLEAR), timing diagnostics. `DiagnosticLog` + `RawReportRing` are always
  constructed and wired to the adapter (cheap, bounded) but only **rendered** on
  this route.
- `?fake` keeps the `FakeSensorAdapter`. `?fake&debug=sensor` works (compose).
- The header shows a small "Diagnostics" link only when a debug/fake flag is set.

## 11. Design system / CSS

- `styles/tokens.css` — semantic, **dark-first**: `--surface`, `--surface-raised`,
  `--ink`, `--ink-dim`, `--ink-faint`, `--accent`, `--trace`, `--grid`, `--ok`,
  `--warn`, `--err`; a 6-step space scale; a fluid type scale using `clamp()`
  keyed to viewport width (so the Data Display number is genuinely huge at
  1920 and still fits at 1024); `--radius`, `--focus-ring`.
- `styles/reset.css` — minimal box-sizing / margin reset, `:focus-visible` ring.
- `styles/layout.css` — the shell grid (header + main), Home tile grid, Live Lab
  graph-dominant layout, Data Display centering.
- `styles/components.css` — buttons, tiles, the acquisition bar, stat strip.
- Hand-written, no framework, no CDN. Wordmark is text ("Motion World"), not an
  asset. Projector-first: large hit targets, high contrast, `clamp()` type,
  no layout below ~1024×640 (a "make the window larger" hint instead).
- Light theme is **M7**, not now.

## 12. Testing strategy (all software; keep the 87 M0 tests)

New, with `FakeSensorAdapter` + jsdom where DOM is needed:

- **router** — hash → view; unknown → Home; flags parsed; `#/diagnostics`
  redirects to Home without a debug flag.
- **composition root** — exactly one adapter + one controller; identity stable
  across navigations; `disconnect` never called on navigation; `stopForNavigation`
  called when leaving `MEASURING`.
- **home-view** — 5 tiles; Live + Data enabled and navigate; other 3 disabled
  and inert.
- **acquisition-bar** — friendly copy for every `AcquisitionUiState` (+
  `connecting`); each button calls the right guarded intent; renders nothing
  scary.
- **keyboard** — `Space` toggles Start/Stop; ignored in an `<input>`; **not
  double-fired when a `<button>` is focused**; ignored on `e.repeat`.
- **live-lab-view** — samples grow the chart path; STOP renders the frozen run;
  new run clears; navigate away + back restores the trace from the controller.
- **data-display-view** — "—" before samples; live updates; retains after stop;
  Reset → "—" without disarming.
- **time-series-chart** — pure geometry: domain math, auto-scale + hysteresis,
  `path d` generation, empty series, single point, x auto-grow → slide.
- **device-lost** — bar + Live Lab + Data Display behaviour.
- **auto-reconnect** — boot with a granted fake device → "Connecting…" →
  "System Ready", Home visible throughout.
- **architecture guard** — a source-scan test asserting no file outside
  `src/sensor/` mentions `navigator.hid`, `sendReport`, or imports `./hid`.
- **presentation-state** — pure, serializable (`JSON.stringify` round-trips; no
  functions / DOM nodes).

No test asserts physical-hardware behaviour. `SOFTWARE VERIFIED` vs
`HARDWARE VERIFIED` distinction maintained in docs.

## 13. Projector audit

- `docs/research/milestone-1-projector-audit.md` — a manual checklist for
  widths **1024×768, 1280×720, 1366×768, 1440×900, 1920×1080** across the M1
  screens (Home ×3 connection states, Live ×4 acquisition states, Data ×3,
  Device Lost): no clipping, no horizontal page overflow, critical text + axis
  labels readable, controls visible, the Data Display number actually huge.
- A jsdom test enforces the mechanical parts it can: computed `font-size` floors
  for the "critical" elements and `scrollWidth <= clientWidth` (no horizontal
  overflow) at the five widths. Visual confirmation is manual (no browser
  automation available in this environment — stated honestly).
- Not optimised for phones. Desktop/projector is primary.

## 14. Deployment

Unchanged: `.github/workflows/deploy-pages.yml` (Actions → Pages, static). Push
`main`, let it deploy, verify `https://ronniegarzatx.github.io/MotionWorldWeb/`.
No force push. The deploy workflow already runs `npm ci` + tests + `tsc` + build.

---

## Self-review (design-review checklist)

- [x] **Scope matches the prompt** — shell + Home + Live + Data only; Snapshot /
  Speed / Sequence disabled-visible; no Runs / IndexedDB / broadcast / accounts /
  standards / Inverse / Walk the Line / Pendulum.
- [x] **No lab owns WebHID** — one composition root builds
  `hid → adapter → controller` once; views subscribe; §12 has a source-scan
  guard test.
- [x] **Graph decision made with 3 options + rationale + recommendation** (§3),
  chosen for the *interactive Snapshot future* not just Live Lab, with a
  documented canvas escape hatch.
- [x] **App/controller ownership defined** (§4) — controller unchanged as the
  acquisition authority; only additive `connecting` / `navigation` /
  run-accessors, each TDD'd.
- [x] **Routing decided** (§5) — hash (static-host + subpath safe), flags
  preserved, connection persists across navigation, `SENSOR_READY` latch
  persists (resolves parent open-question #3).
- [x] **Debug route strategy** (§10) — `?debug=sensor` / `?fake` gate
  `#/diagnostics`; teacher UI never shows protocol errors / hex / report IDs.
- [x] **Fake mode retained and composable** — `?fake`, `?fake&debug=sensor`.
- [x] **Shared acquisition control** (§6) — one component, friendly copy, the
  System Ready → Sensor Ready → Collecting progression, Space guard against
  focused-button double-fire, blue trigger via the controller.
- [x] **CSS/token organisation** (§11) — 4 small hand-written files, semantic
  dark-first tokens, fluid `clamp()` type; light theme deferred to M7.
- [x] **Hardware evidence recorded** — done in `go-motion-webhid-protocol.md` §0,
  the parent spec §15/§16, the Windows test doc, and the README (this commit's
  predecessor).
- [x] **Projector audit planned** (§13) with an honest note that visual
  confirmation is manual.
- [x] **Testing** (§12) keeps the 87, adds app-level coverage with the fake
  adapter, and never claims hardware validation.
- [x] **Blue-button START** is *not* a blocker — code path identical and
  unit-tested; listed as a small follow-up hardware check.
- Contradiction check: "web-native redesign" vs "don't spend the milestone on
  polish" — resolved by a *small* token system + `clamp()` and three plain
  screens; no decorative work. "One serializable PresentationState" vs "zero
  networking / YAGNI" — resolved: a pure function producing a plain object,
  used only for the render-from-one-source habit, not persisted or sent.
