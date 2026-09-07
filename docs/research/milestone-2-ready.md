# MOTION WORLD WEB — MILESTONE 2 READY

Movable Walk target + persistent local Runs + the immutable `AnalysisWindow`
foundation. Built on M1/M1.5 + the portable build. Software green, both builds
green, deployed. No new hardware behaviour claimed.

## WALK THE LINE — movable target

- **Model:** `WALK_TARGETS` and every `points` array are **immutable**. Movement
  is a render-time translation — `displayedPoints(target, offsetMeters)` adds the
  offset to each position; times and slopes are byte-identical to canonical. A
  test proves the whole catalog is deep-equal before/after a batch of moves.
- **±0.5 buttons:** `[ − 0.5 m ]  <label>  [ + 0.5 m ]` + **Reset Position** —
  real `<button>`s (keyboard-accessible). Each ± moves the entire target by
  exactly 0.5 m, then `clampOffset`. Disabled at the legal extreme and while
  MEASURING.
- **Drag:** continuous vertical Pointer-Events drag on a **26 px transparent hit
  region** along the target path (visible stroke unchanged, `cursor: ns-resize`).
  Pointer capture on the persistent chart host; `pointermove`/`pointerup` there.
  **Only Y changes** — X/time never moves. Snap to the nearest 0.1 m on release.
- **Offset label:** flat target → `Target height: 2.0 m`; non-flat →
  `Target shift: +0.5 m` / `−0.5 m`.
- **Clamping:** `offsetLimits(target)` = `[0.5 − canonicalMin, 3.5 − canonicalMax]`
  — every displayed point stays in `[0.5, 3.5]`. Stand Still (1.5 m) can move
  −1.0…+2.0 m; Positive Constant Rate already reaches 3.5 m so its max offset is
  0. The shape is **never distorted** — only translated.
- **Axes stay fixed** — `yDomain` still comes from `positionRange`, never the
  offset. Confirmed by a test (tick labels unchanged after moves).
- **Per-target session offsets** — an injected `TargetOffsets` (one instance in
  the composition root). Run Again keeps the offset; switching target restores
  that target's own offset; not persisted.

## RUN STORAGE

- **`RunStore` boundary** (`src/store/run-store.ts`): `save / get / listSummaries
  (newest-first) / delete / clear`. Views depend on this interface only —
  enforced by `tests/architecture.test.ts` (nothing outside `src/store/` mentions
  IndexedDB).
- **`IndexedDbRunStore`** — native IndexedDB, no library. DB `motion-world`
  v1, store `runs`, in-line key `id`, `getAll()` + sort desc. `onupgradeneeded`
  creates the store.
- **`MemoryRunStore`** — the test double and the graceful fallback.
- **`createRunStore()`** — tries IndexedDB; on any failure (API absent, `file://`
  quirk, private mode) returns a `MemoryRunStore` and logs the reason. Called
  once in `app.ts`.
- **`StoredRun`** (`src/model/stored-run.ts`) — `schemaVersion 1`, exact
  **unrounded** `{t,x}` samples, `stopReason`, derived `interrupted`. `serialize`
  / `deserialize` / `summarize` are pure; `deserializeRun` rebuilds the **frozen**
  `MotionRun` via `makeMotionRun` — a plain DTO, never an editable substitute;
  round-trips byte-identically.
- **Persistence coordinator** (`startRunPersistence`) — ONE subscription to the
  controller's single run-complete event, built once in `app.ts`, never
  per-view. A `Set<id>` guard → each run saved **exactly once** regardless of
  route remounts. **Every** run is retained — ordinary `STOP`, `navigation`,
  `device_lost` — with its `stopReason`. Partial runs are **not** auto-deleted.
  A `store.save` rejection is reported and **swallowed** — acquisition is never
  affected (tested with a failing store).
- **Durable-storage request** — best-effort `navigator.storage?.persist?.()` at
  boot; result logged, never implied as guaranteed. Teacher copy: **"Runs are
  stored on this device"**; help: "can be lost if the browser or site data is
  cleared."
- **`MotionRun` gained `stopReason`** (additive; `finishRun()` passes
  `snap.lastStopReason`), removing the need for a side channel.

## RUNS

- Secondary **"Runs"** link in the persistent header — **not** a Home tile
  (Home stays 6 tiles).
- **`#/runs`** — newest-first list: saved date/time · duration · sample count ·
  an **"interrupted — …"** chip for `navigation`/`device_lost`/`error` · a "demo"
  tag for fake runs. **View** → detail. **Delete** → inline confirm → row
  removed **in place**, no reload. **Clear All Runs** → two-step
  ("Really clear N runs? [Clear] [Cancel]"). Empty → **"NO SAVED RUNS YET"** +
  "Completed collections will appear here automatically." Memory-store fallback →
  an amber "Temporary storage — runs will be lost when this page closes." banner.
- **`#/run/<id>`** — `deserializeRun` → a position-vs-time graph + Saved /
  Duration / Samples + complete/interrupted state + the analysis-window line.
  **Works with no sensor connected** — never touches WebHID. A full
  `AnalysisWindow` is instantiated; a start/end nudge demo appears only under
  `?debug=sensor`. No Snapshot transform / fitting / point drawer.

## ANALYSIS WINDOW

`src/model/analysis-window.ts` — **pure, immutable**. `fullWindow` / `useAll` /
`withStart` / `withEnd` / `withRange` / `windowDurationSeconds` / `windowContains`
/ `activeSamples`.

- **Range rules:** `runStart ≤ start`, `start < end` (a degenerate full window is
  allowed for a run with < 2 distinct timestamps), `end ≤ runEnd`. All inputs
  clamped; **no NaN/Infinity** (`+Infinity` → runEnd, `NaN` → runStart).
- **Boundaries:** start-inclusive **and** end-inclusive, with a float epsilon —
  documented and tested.
- **No resampling, no interpolation** — a view/filter only. Works with
  **irregular** timestamps.
- **The `MotionRun` is never touched** — a test freezes it and asserts deep-equal
  before/after every op.

## PORTABLE

- `dist-portable/MotionWorld.html` — **one runtime file, 70 kB**, still no CDN /
  remote fonts / remote JS / runtime API / fetched assets.
- IndexedDB is **browser-local**, so it's allowed and used; the app stays fully
  functional **offline**. If IndexedDB is unavailable under `file://`, the
  `MemoryRunStore` fallback keeps Runs working for the session (with the banner).
- The artifact test now also asserts the Runs UI + IndexedDB code + fallback
  notice are in the single file.

## TESTING

- **289 tests, 43 files — all green** (216 → **+73**). `tsc --noEmit` clean.
  `npm run build` clean (multi-file). `npm run build:portable` clean (one file).
  `npm audit`: **0 vulnerabilities** (`fake-indexeddb` is a test-only
  devDependency — never imported by `src/`). `npm ci` reproducible.
  `git diff --check` clean.
- New coverage: `MotionRun.stopReason`; `AnalysisWindow` (14); `StoredRun`
  serialize/deserialize/round-trip (5); `MemoryRunStore` (3); `IndexedDbRunStore`
  via fake-indexeddb — CRUD, schema creation, persist across close+reopen, exact
  samples, failure mapping (5); persistence coordinator — one save per run,
  partial runs, save-failure isolation, no double-save (6); Walk offset helpers +
  `TargetOffsets` (10); chart Y geometry + hit region (3); Walk view movable
  target — drag Y-only, ±0.5, reset, clamp, disabled-at-limit, locked-while-
  measuring, Run-Again-keeps-offset, per-target restore, axes-unchanged (9 new);
  router `#/runs` + `#/run/<id>` (8); Runs list (empty/list/interrupted/view/
  delete/clear/banner — 6); Run detail (graph/stats/window/interrupted/missing/
  debug — 5); app wiring — Runs mounts with the shared store, a run persists and
  appears, no 2nd controller, run detail with no sensor (9); persistence-boundary
  architecture guard; portable-bundle assertions.
- No test claims physical-hardware behaviour. `SOFTWARE VERIFIED` vs
  `HARDWARE VERIFIED` maintained.

## PROJECTOR

Manual — `docs/research/milestone-2-projector-audit.md` (5 widths × Home /
Walk default / Walk shifted / Walk dragging / Walk at limit / Walk collecting /
Runs empty / Runs populated / Runs interrupted / Run detail / storage-fallback
banner). No browser-automation tool in this environment; the visual pass is the
human's. The sensor + persistence boundaries and the single-file portable
invariant run in CI.

## GITHUB

- repo `https://github.com/ronniegarzatx/MotionWorldWeb` (public)
- final commit **`8ff3ad5`** on `main` (`adcf53e..8ff3ad5`, no force)
- Pages: GitHub Actions → Pages, runs `101888282064` + `101888383238` **success**
  (build now also runs `npm run build:portable` as a self-check step)
- **live URL: https://ronniegarzatx.github.io/MotionWorldWeb/** — verified 200,
  assets 200, bundle carries the M2 code, CSP `connect-src 'self'`.
- `GoIO_SDK` / native MotionLab untouched; working tree clean.

## NEXT PHYSICAL CHECK

Windows PC, Chrome/Edge, the live URL (hard-refresh), sensor plugged in:

1. **Walk the Line → Stand Still.** Use `+ 0.5 m` / `− 0.5 m` to move the target
   to a few different heights (watch "Target height: X.X m").
2. **Drag** the Stand Still target line to a different height with the mouse.
3. **Sensor Ready → Start** and physically match it — stand at the target height.
4. **Change Target → Walk Away**, use `+ 0.5 m`, and confirm the **slope stays
   the same** (only the whole line moves up).
5. Complete **several** Live Lab and Walk the Line runs (mix in an interrupted
   one — leave the tool mid-run, or unplug briefly).
6. Open **Runs** — confirm every run appears, newest first, with the interrupted
   ones chipped.
7. **Refresh** the browser → the runs are still there.
8. **Close and reopen** the browser (or the tab) → the runs are still there.
9. Open a saved run's **View** with the **sensor unplugged** → the graph loads.
10. Open the portable **`MotionWorld.html`** directly (double-click). Complete a
    `?fake` run, then close and reopen the file → report whether the local Runs
    **persist** across closing/reopening the file, and what
    `?debug=sensor` → Environment shows for protocol / secure context / WebHID.

**Do not begin Snapshot Lab.** It is the next milestone and builds on
`AnalysisWindow`.
