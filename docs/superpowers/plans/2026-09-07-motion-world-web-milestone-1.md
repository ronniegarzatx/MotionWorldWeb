# Milestone 1 — Application Shell + Home + Live Lab + Data Display — Plan

**Date:** 2026-09-07
**Design:** `docs/superpowers/specs/2026-09-07-motion-world-web-milestone-1-design.md`
**Parent spec:** `docs/superpowers/specs/2026-09-06-motion-world-web-v1-design.md`
**Builds on:** Milestone Zero (PASSED, class A) — the sensor/acquisition/model
layer is done and hardware-verified. **87 tests must stay green throughout.**

TDD every task: write the failing test, watch it fail, implement, green, refactor,
`npm test -- --run && npx tsc --noEmit` clean, focused commit.

Do **not** build: Snapshot / Speed / Sequence Lab, `AnalysisWindow`, IndexedDB /
Runs, broadcast/networking, accounts, backend, standards, light theme, PWA.

---

## Task 1 — Controller: additive hooks for the app shell

Small, additive changes to `src/acquisition/acquisition-controller.ts` +
`acquisition-state.ts`. No behaviour change to existing paths.

- **Tests first** (`tests/acquisition/acquisition-controller.test.ts`,
  `acquisition-state.test.ts`):
  - `AcquisitionUiState.connecting` is `true` while the adapter status is
    `connecting` or `reconnecting`, `false` otherwise; a `uiState` change is
    emitted when it flips.
  - `stopForNavigation()` while `MEASURING` → `SENSOR_READY`, `lastStopReason`
    `"navigation"`, and the partial `MotionRun` is still emitted; while not
    `MEASURING` it is a no-op.
  - `"navigation"` added to the `StopReason` union + machine `stop` handling.
  - `currentRunSamples()` returns a frozen snapshot of the in-progress buffer
    (empty when not measuring); `lastCompletedRun()` returns the last frozen
    `MotionRun` or `null`.
- Implement. `connecting` is derived in `deriveUiState`; the controller listens
  to adapter status for `connecting`/`reconnecting` and re-emits `uiState`.
- **Commit:** `feat(acquisition): connecting flag, navigation stop, run snapshots`.

## Task 2 — `app/flags.ts` + `app/app-store.ts` + `app/router.ts`

- **Tests first** (`tests/app/flags.test.ts`, `router.test.ts`):
  - `parseFlags("?fake&debug=sensor")` → `{ fake: true, debugSensor: true }`;
    empty → both false; `?debug=other` → `debugSensor:false`.
  - `AppStore`: `route` getter, `setRoute`, `subscribe` fires on change, no fire
    on same-value set.
  - `router`: maps `#/` → `"home"`, `#/live` → `"live"`, `#/data` → `"data"`,
    `#/diagnostics` → `"diagnostics"`, anything else → `"home"`; `start()`
    reads the initial hash and subscribes to `hashchange`; `navigate("live")`
    sets `location.hash = "#/live"`; `stop()` detaches.
  - `#/diagnostics` resolves to `"home"` when `flags.debugSensor` and
    `flags.fake` are both false (guard lives in the router, takes flags).
- Implement. Router is a tiny pure-ish module over `window.location` /
  `hashchange`, injectable `window` for tests.
- **Commit:** `feat(app): boot flags, app store, hash router`.

## Task 3 — `ui/components/` primitives + `styles/` design system

- `styles/reset.css`, `tokens.css` (semantic dark-first + fluid `clamp()` type +
  space scale), `layout.css` (shell grid, Home tile grid, Live layout, Data
  centering), `components.css` (button, tile, bar, stat). Replace the M0
  `styles/app.css` / `styles/tokens.css`.
- `ui/components/dom.ts`: `el()` helper (typed), `button()`, `tile()`, `stat()`.
- **Tests first** (`tests/ui/components.test.ts`, jsdom): `el()` sets props +
  children + listeners; `button({label,onClick,disabled})` renders a `<button>`
  with the right disabled state and calls `onClick`; `tile({label,active})`
  renders an enabled/disabled tile.
- **Commit:** `feat(ui): dark-first design tokens + DOM component primitives`.

## Task 4 — `ui/chart/time-series-chart.ts` (hand-rolled SVG)

- **Tests first** (`tests/ui/time-series-chart.test.ts`, jsdom):
  - `mountChart(host)` creates one `<svg>` with axis `<text>` for `xLabel` /
    `yLabel`.
  - `update({ series, xDomain:"auto-grow", yDomain:"auto", ... })`:
    - empty series → no trace path `d` (or `d=""`), no throw.
    - single point → a valid `d` with one `M`.
    - N points → trace `<path>` `d` has N vertices; monotonic-x mapping is
      correct (spot-check two mapped coords against hand math).
    - `auto-grow` X: with max t = 3 → xDomain top is 10; with max t = 42 →
      top slides to 42 and bottom to 12 (30 s window).
    - `auto` Y with hysteresis: a small out-of-range excursion inside the pad
      does not change the domain; a large one does.
  - `destroy()` removes the svg and any listeners.
  - pure helpers exported and unit-tested: `computeXDomain`, `computeYDomain`,
    `buildPathD(series, xScale, yScale)`.
- Implement ~200 lines. `overlays` / `markers` / `selection` inputs are accepted
  in the type but only `selection` stubs a no-op group in M1 (Snapshot uses it
  at M5). Document that.
- **Commit:** `feat(ui): SVG TimeSeriesChart (Snapshot-ready contract)`.

## Task 5 — `ui/acquisition-bar.ts` + `ui/keyboard.ts`

- **Tests first** (`tests/ui/acquisition-bar.test.ts`, `keyboard.test.ts`, jsdom,
  `FakeSensorAdapter` + real `AcquisitionController`):
  - bar text + visible controls for each state: `NO_DEVICE`, `connecting`,
    `SYSTEM_READY`, `SENSOR_READY`, `MEASURING`, `DEVICE_LOST`, `ERROR` — exact
    friendly strings; **no** "protocol", "report", "0x", "HID" anywhere in the
    rendered text (assert via a regex over `textContent`).
  - clicking **Connect Sensor** / **Sensor Ready** / **Disarm** / **Start** /
    **Stop** / **Reconnect** calls the matching controller intent (spy).
  - `Details` link present only when `flags.debugSensor` is true and state is
    `ERROR`.
  - keyboard: dispatch `keydown` `" "` on `document.body` while `SENSOR_READY`
    → `controller.start` called, `preventDefault` called; while `MEASURING` →
    `controller.stop`. Dispatch with `activeElement` an `<input>` → **not**
    called. Dispatch with a focused `<button>` as `e.target` → **not** called
    (no double-activation). `e.repeat === true` → ignored.
- Implement. Bar renders from `controller.subscribeUiState`. Keyboard module:
  `installStartStopKey(controller, { getFlags })` returns an uninstaller.
- **Commit:** `feat(ui): shared acquisition bar + Space start/stop key guard`.

## Task 6 — `ui/home/home-view.ts`

- **Tests first** (`tests/ui/home-view.test.ts`, jsdom):
  - renders exactly 5 tiles in order: Live Lab, Data Display, Snapshot Lab,
    Speed Lab, Sequence Lab.
  - Live Lab + Data Display are enabled; clicking them calls `navigate("live")`
    / `navigate("data")`.
  - Snapshot / Speed / Sequence are disabled, carry a restrained "coming next"
    label, and clicking them does nothing (no navigate).
  - no "roadmap", no "Activity Library", no "Standards" text anywhere.
- Implement.
- **Commit:** `feat(ui): five-tool Home (Live + Data active)`.

## Task 7 — `ui/shell.ts` + `app/app.ts` + `main.ts` rewrite + `app/presentation-state.ts`

- `presentation-state.ts` — **tests first**: `computePresentationState` returns a
  plain object; `JSON.parse(JSON.stringify(x))` deep-equals `x`; no functions,
  no DOM nodes; `activeRunId` is the last run's id or null; `derivedReadouts`
  has string values.
- `shell.ts` — header (wordmark = Home link, `<AcquisitionBar>`, dev-only
  Diagnostics link) + `<main>` outlet; `renderRoute(route)` swaps only `<main>`,
  tearing down the previous view.
- `app.ts` — composition root:
  1. capability check → `renderUnsupportedView` and stop if no `hid` and not `?fake`.
  2. build `flags`, `DiagnosticLog`, `RawReportRing`, adapter (`FakeSensorAdapter`
     if `flags.fake` else `GoMotionWebHIDAdapter(hid, { onLog, onDeviceReport })`),
     wire raw-report/status/trigger → logs, build `AcquisitionController` **once**.
  3. build `AppStore`, `router`; on route change call `shell.renderRoute`, and
     when leaving `#/live`/`#/data` while `MEASURING` call
     `controller.stopForNavigation()`.
  4. mount `shell`; render initial route.
  5. fire `controller.reconnect()` (non-blocking) — bar shows Connecting… →
     System Ready or stays No Sensor.
  6. global `unhandledrejection` / `error` → `DiagnosticLog` (never console-only).
- `main.ts` → just `import "./app/app.js"` (+ the css import).
- **Tests** (`tests/app/app.test.ts`, jsdom, `?fake`):
  - boot → Home mounted, one controller, Diagnostics link hidden (no debug flag).
  - `?fake&debug=sensor` → Diagnostics link visible; `#/diagnostics` mounts the
    diagnostics view.
  - navigate Home→Live→Home: same adapter/controller instance
    (`disconnect` spy never called); Live view torn down on leave.
  - navigate away while `MEASURING` → `stopForNavigation` called, partial run kept.
- **Commit:** `feat(app): shell, composition root, presentation-state, boot wiring`.

## Task 8 — `ui/live/live-lab-view.ts`

- **Tests first** (`tests/ui/live-lab-view.test.ts`, jsdom, fake adapter +
  controller):
  - mounts the chart + a stats strip (elapsed, current position, sample count);
    no HID log element.
  - during `MEASURING`, emitted samples grow the chart trace (`path` vertex
    count increases) on the next `rAF`/flush; stats update.
  - `Stop` → chart shows the frozen run (vertex count == run.sampleCount);
    stats show the final values.
  - starting a new run clears the trace first.
  - unmount → remount while still `MEASURING` → trace restored from
    `controller.currentRunSamples()`; while frozen → from `lastCompletedRun()`.
  - no acquisition restart on mount/unmount (adapter `start`/`connect` not called).
- Implement. `rAF` is injectable (default `requestAnimationFrame`, test passes a
  synchronous flusher) — and note: `requestAnimationFrame` is receiver-sensitive
  in Chromium exactly like the timers, so bind it (`globalThis.requestAnimationFrame.bind(globalThis)`)
  or wrap — **carry the M0 `Illegal invocation` lesson forward.**
- **Commit:** `feat(ui): Live Lab — real-time position-vs-time graph`.

## Task 9 — `ui/data/data-display-view.ts`

- **Tests first** (`tests/ui/data-display-view.test.ts`, jsdom):
  - before any sample: POSITION and TIME both render "—".
  - during `MEASURING`: POSITION shows the latest `positionMeters` to 3 dp + " m",
    TIME shows seconds; updates as samples arrive.
  - after `Stop`: the last value is retained (not cleared, not "—").
  - **Reset** button → back to "—", and the controller is **not** disarmed
    (`uiState.state` stays `SENSOR_READY`).
  - the big number element has a computed font-size above a floor (projector).
- Implement. Fluid `clamp()` size from tokens; no card; colour only.
- **Commit:** `feat(ui): Data Display — huge position readout`.

## Task 10 — `dev/sensor-diagnostics-view.ts` (refactor the M0 spike)

- Move `src/spike/` → `src/dev/`; rename `spike-view.ts` →
  `sensor-diagnostics-view.ts`; keep `diagnostic-log.ts`, `raw-report-ring.ts`,
  `unsupported-view.ts`. Update imports + existing tests' paths.
- The view is unchanged in behaviour (descriptor / event log / raw ring /
  timing) but mounts at `#/diagnostics` inside the shell `<main>` and drops its
  own `<h1>` / standalone framing.
- **Tests:** the existing spike-view tests move to `tests/dev/` and keep
  passing; add: `#/diagnostics` route renders it only under a debug/fake flag.
- **Commit:** `refactor(dev): M0 spike becomes the ?debug=sensor diagnostics view`.

## Task 11 — Architecture guard + projector audit test + docs

- **Test** (`tests/architecture.test.ts`): read every `.ts` under `src/` except
  `src/sensor/`; assert none contains `navigator.hid`, `.sendReport(`,
  `sendFeatureReport`, or an import of `./hid`/`../sensor/hid`. Fail with the
  offending file list.
- **Test** (`tests/ui/projector-audit.test.ts`, jsdom): for widths 1024, 1280,
  1366, 1440, 1920 — mount Home / Live / Data, set `document.documentElement`
  width, assert `document.body.scrollWidth <= width` (no horizontal overflow)
  and the "critical" elements' computed `font-size` ≥ their floor. *(jsdom
  layout is limited; assert what it can and note the manual check.)*
- `docs/research/milestone-1-projector-audit.md` — the manual checklist (screens
  × widths × checks) with a note that visual confirmation is manual (no browser
  automation here).
- Update `README.md` (M1 status, `?debug=sensor`), and
  `docs/research/milestone-zero-ready.md` → append an "M1 in progress" pointer.
- **Commit:** `test: architecture guard + projector audit; docs: M1 status`.

## Task 12 — Full verification + deploy

- `npm ci` (reproducible) · `npm test -- --run` (all green) ·
  `npx tsc --noEmit` · `npm run build`.
- Manual smoke: `npm run preview`, open `/?fake`, click through Home → Live
  (see a synthetic 25 Hz trace) → Data (see the big number) → Home; open
  `/?fake&debug=sensor` → Diagnostics.
- Commit any fixes. Push `main`. Watch the Pages Action to green. Verify
  `https://ronniegarzatx.github.io/MotionWorldWeb/` serves the new shell and
  assets 200; `/?fake` works; `/?debug=sensor` shows Connect (no scary text).
- **Commit(s):** coherent, as needed.

## Task 13 — Milestone 1 readiness report

`docs/research/milestone-1-ready.md` + the final chat report:
hardware status, architecture (graph choice, ownership, debug route, fake mode),
Home, Live Lab, Data Display, testing (old/new counts, tsc, build, audit),
GitHub (commit, Pages, URL), and the **next physical acceptance checklist**
(Live real sensor · Data real sensor · blue-button START · Home/tool navigation
with the sensor staying connected).

- **Commit:** `docs: Milestone 1 readiness report`.

---

## Risks / notes

- **`requestAnimationFrame` receiver** — same Chromium WebIDL trap as the M0
  timer bug. Bind it (`globalThis.requestAnimationFrame.bind(globalThis)`) or
  wrap. A test with a strict receiver-checking `globalThis.requestAnimationFrame`
  mirrors the M0 regression test.
- **jsdom has no layout engine** — chart geometry tests use the pure scale/`d`
  helpers, not `getBBox`; projector-overflow tests assert what jsdom can and the
  rest is the manual checklist. Honest.
- **SVG trace perf** — fine at classroom sizes (§3); the canvas escape hatch is
  documented, not built.
- **Blue-button START** — code path identical to on-screen Start and unit-tested;
  a real-hardware check, not an M1 blocker.
- Keep every M0 test. Keep `SOFTWARE VERIFIED` vs `HARDWARE VERIFIED` honest.

## Self-review

- Spec coverage: shell/Home/Live/Data (Tasks 6–9), shared acquisition control +
  Space guard (5), graph = SVG per design §3 (4), one composition root / no lab
  owns WebHID (7 + guard test 11), hash routing + flags + nav-safe acquisition
  (2, 7), `?debug=sensor` diagnostics + `?fake` (10, 7), design tokens (3),
  auto-reconnect non-blocking (7), device-lost UX (5, 8, 9), projector audit
  (11), keep 87 tests + add app coverage (every task), deploy (12), report (13).
- Placeholders: none — each task names files, test cases, and a commit.
- Type consistency: `AcquisitionUiState` extended (not forked); `Route` union
  defined once in `router.ts`; `Flags` once in `flags.ts`; `ChartInput` once.
- Ordering: controller hooks → app plumbing → primitives/tokens → chart → bar →
  Home → shell/root → Live → Data → diagnostics refactor → guards/docs → verify.
  Each task compiles and tests green on its own.
