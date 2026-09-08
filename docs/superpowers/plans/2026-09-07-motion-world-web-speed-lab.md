# Milestone 4 — Speed Lab — Plan

**Design:** `docs/superpowers/specs/2026-09-07-motion-world-web-speed-lab-design.md`
Builds on HEAD `695db97` (M3.1 + Snapshot precision polish). **384 tests stay
green.** TDD every task; each ends `npm test -- --run && npx tsc --noEmit` green +
a focused commit. Both `npm run build` and `npm run build:portable` stay green.

Not building: acceleration, snapshot/rate persistence, any scoring, Sequence Lab.

---

## T1 — `model/rate-analysis.ts` (pure)
- **Tests first (`tests/model/rate-analysis.test.ts`):**
  - clean `y = 0.5t + 1` over a sub-window ⇒ `m ≈ 0.5`, `b ≈ 1`, `r² ≈ 1`,
    `speedMetersPerSecond ≈ 0.5`, `speedMilesPerHour ≈ 0.5 · MPH_PER_MPS`,
    `sampleCount` = samples in the window.
  - **OLS ≠ endpoints:** a run linear except one yanked interior sample ⇒ slope
    moves toward the cloud and differs from `(yₙ−y₀)/(tₙ−t₀)`.
  - noisy-but-linear ⇒ `|m − true| < 0.05`, `r² < 1`.
  - direction: `+slope ⇒ away`, `−slope ⇒ toward`, `|m| < 0.05 ⇒ stationary`.
  - `MPH_PER_MPS === 2.2369362920544`; `speedMilesPerHour === speedMetersPerSecond
    * MPH_PER_MPS`; `STATIONARY_SPEED_MPS === 0.05`.
  - toward run ⇒ `speedMetersPerSecond > 0` while `slopeMetersPerSecond < 0`
    (never a negative speed).
  - refuses `{ ok: false, reason }` for: 0 samples, 1 sample, zero-duration
    window, all-equal timestamps, a non-finite sample; **no field is NaN /
    Infinity / −0** in any ok result.
  - flat run (`SS_tot = 0`) ⇒ `r² = 1`, `direction = "stationary"`.
  - source run frozen + deep-equal before/after.
- **Commit:** `feat(model): rate-analysis OLS speed/velocity/direction`.

## T2 — `model/speed-limit.ts` (pure)
- **Tests first (`tests/model/speed-limit.test.ts`):** `SPEED_LIMIT_PRESETS_MPH`
  = `[2,5,10]`; `DEFAULT_SPEED_LIMIT_MPH` = 5; `compareToSpeedLimit` — 4.6 vs 5 ⇒
  `under`, `marginMph ≈ 0.4`; 6.1 vs 5 ⇒ `over`, `marginMph ≈ 1.1`; 5.00 vs 5 ⇒
  `at`; 5.03 vs 5 ⇒ `at` (tolerance); `marginMph ≥ 0` always.
- **Commit:** `feat(model): speed-limit comparison (presets, tolerance)`.

## T3 — `model/endpoint-slope.ts` (pure)
- **Tests first (`tests/model/endpoint-slope.test.ts`):** endpoints equal
  `positionAt(run, window.start/end)`; `deltaSeconds` / `deltaMeters` /
  `slopeMetersPerSecond = Δm/Δs`; window boundaries between samples interpolate;
  `null` when `deltaSeconds < 1e-6`; run not mutated.
- **Commit:** `feat(model): endpoint (two-point) teaching slope`.

## T4 — `model/speed-workspace.ts` (pure)
- **Tests first (`tests/model/speed-workspace.test.ts`):** `startSpeedWorkspace`
  ⇒ full-run window, `limitMph = 5`, `analysis.ok`, `comparison` set, `endpoint`
  set; `setSpeedWindow` clamps via `withRange` + recomputes analysis + comparison
  + endpoint; `useAllSpeed` ⇒ full window; `setSpeedLimit` recomputes **only**
  `comparison` (same analysis object identity is fine to not require, but slope
  unchanged); degenerate window ⇒ `analysis.ok === false` and
  `comparison === null`; `withSpeedRun(other)` ⇒ fresh full-run workspace;
  `withSpeedRun(same id)` ⇒ unchanged; run never mutated.
- **Commit:** `feat(model): pure SpeedWorkspace`.

## T5 — `ui/speed/speed-explainer-overlay.ts`
- **Tests first (`tests/ui/speed-explainer-overlay.test.ts`, jsdom):**
  `mountSpeedExplainerOverlay(host, input)` renders — two-point line with the
  **actual** substituted numbers (`(0.67 m − 0.19 m) ÷ (1.04 s − 0.56 s)`), a
  "Δ (delta) means" line, the OLS explanation with `m` / `b` / `r²` / sample
  count, and the slope→speed→mph→direction section; Esc closes; backdrop click
  closes; teardown removes it; when `endpoint` input is null the two-point
  section is omitted but the OLS section still shows.
- **Commit:** `feat(ui): "How was this speed calculated?" overlay`.

## T6 — `ui/speed/speed-lab-view.ts` (orchestrator)
- **Tests first (`tests/ui/speed-lab-view.test.ts`, jsdom, FakeSensorAdapter +
  MemoryRunStore, the M2 PointerEvent shim):**
  - **no run** ⇒ empty head + `[ Connect sensor ]` / `[ Open saved runs ]`
    (navigate spy: `runs`; connect is best-effort/no-crash).
  - **current run** (spy `lastCompletedRun`) ⇒ "YOUR SPEED", an `mph` number,
    a direction phrase (`Away from sensor` / `Toward sensor` / `Not moving`),
    a limit line containing `5 mph`, a `Velocity:` line with `m/s`, a provenance
    line with `r²` + `samples`.
  - graph: `.trace` present; exactly one `.model-curve`; its path x-range lies
    inside the selection band x-range (best-fit only over the interval).
  - `[ 2 mph ] [ 5 mph ] [ 10 mph ]` — `5` marked selected; clicking `2 mph`
    changes the limit line to `2 mph` and flips under/over as expected.
  - drag the right selection handle inward ⇒ headline mph recomputes (value
    changes for a run whose slope varies).
  - `[ How was this speed calculated? ]` opens the overlay; Esc closes.
  - **saved run** via `runId` ⇒ renders with `lastCompletedRun()` null, never
    calls `runStore.save`, store bytes unchanged.
  - degenerate/short window ⇒ refusal `reason` shown, no `NaN`/`Infinity` text in
    `host.textContent`, presets still clickable.
  - MEASURING on mount ⇒ "Collecting…" placeholder, no result; a
    `subscribeRunComplete` emission then renders the result.
  - teardown unsubscribes + clears host.
- **Commit:** `feat(ui): Speed Lab workspace view`.

## T7 — wire it: router + Home + app + Runs
- `router.ts`: `Route` gains `"speed"`; `HASH_TO_ROUTE["#/speed"]`;
  `ROUTE_TO_HASH.speed`; `locationFromHash` `#/speed/<id>` param branch (like
  `#/snapshot/`); `navigate` builds `#/speed/<id>` (extend the run/snapshot
  guard).
- `home-view.ts`: Speed Lab ⇒ `route: "speed"`, note `"Turn a run into a speed"`.
  Six tiles, five active.
- `app.ts`: `case "speed"` ⇒ `mountSpeedLabView({ controller, runStore, navigate,
  runId? })`; add `"speed"` to the nav-away `TOOLS` set.
- `run-detail-view.ts`: `[ Open in Speed Lab ]` ⇒ `navigate("speed", stored.id)`.
- **Tests:** `tests/app/router.test.ts` — `#/speed` ⇒ `speed`; `#/speed/x` ⇒
  `{route:"speed",param:"x"}`; **change the unknown-hash case to `#/nope`**.
  `tests/ui/home-view.test.ts` — 5 active tiles, Speed navigates to `speed`.
  `tests/app/app.test.ts` — `#/speed` mounts with the shared controller (no 2nd
  controller / no `connect`); `#/speed/<id>` mounts from the store.
  `tests/ui/run-detail-view.test.ts` — "Open in Speed Lab" navigates.
- **Commit:** `feat(app): activate Speed Lab — routes, Home, Runs hand-off`.

## T8 — architecture guard + portable + docs + audit
- `tests/architecture.test.ts`: add `rate-analysis` / `speed-limit` /
  `endpoint-slope` / `speed-workspace` to the PURE list; `src/ui/speed/**` free of
  `navigator.hid` / `sendReport` / `indexedDB` / `IDBDatabase`.
- `tests/portable/artifact.test.mjs`: bundle contains `"Speed Lab"` + `"YOUR
  SPEED"`; still one file; no external refs; no mathjax/katex.
- `docs/research/milestone-4-projector-audit.md` — the source/empty/failure/
  live-vs-completed/overlay state matrix + projector legibility checks.
- README: **five** active tools; Speed Lab section — OLS best-fit slope of all
  samples is the real number, the two-point endpoint slope is the teaching check,
  `mph = |m| × 2.2369362920544`, direction from the sign, no scoring.
- **Commit:** `test+docs: M4 guard, portable check, projector audit, README`.

## T9 — verify + deploy + report
`npm ci` · `npm test -- --run` · `npx tsc --noEmit` · `npm run build` ·
`npm run build:portable` · `npm audit` · `git diff --check`. Preview smoke
(`?fake`: collect a run → Stop → speed result → change interval → preset → "How
was this calculated?" → open a saved run in Speed Lab offline → portable file).
Push `main` (no force), watch the Pages deploy, verify the live URL.
`docs/research/speed-lab-ready.md` + final report **MOTION WORLD WEB — SPEED LAB
READY**. Update the memory file. **Do not start Sequence Lab.**

---

## Risks / notes
- **jsdom** has no layout: `clientWidth/Height` = 0 ⇒ chart uses 800×450. Assert
  on path `d` extents / attributes, not computed pixels. Reuse the M2
  `MouseEvent`+`pointerId` shim for handle drags.
- **Float conditioning:** shift OLS sums to `t₀ = firstSampleTime` so runs with
  large absolute timestamps don't lose precision in `n·Sxx − Sx²`.
- **`−0`:** normalize every displayed number (`Object.is(v,-0) ? 0 : v`, or
  `+v.toFixed(k)`).
- **Direction sign convention** (positive = away) is asserted in a test and
  documented in the README so a future sensor with the opposite convention is a
  one-line change.
- **Refusal over guessing:** a degenerate interval shows plain copy, never a
  fabricated speed.
- Keep every existing test green; only the two intentionally-updated cases
  (router unknown-hash, home active-count) change.

## Self-review
Spec coverage: sources + entry points (T6/T7), direct collection after Stop
(T6), OLS actual calculation + all-samples + r² + refusal (T1), MPH constant
centralized + tested (T1), direction + no-negative-speed (T1), speed-limit
presets + tolerance (T2), two-point teaching slope from `positionAt` (T3),
pure workspace (T4), position graph with selection + interval-only best-fit line
(T6), result hierarchy (T6), "How was this calculated?" overlay with real
substituted numbers + honest OLS note (T5), saved-run integration + offline
(T6/T7), empty/live/failure states + no NaN (T6), routing (T7), architecture
purity (T8), portability (T8), projector audit + README (T8), full verify +
deploy (T9). One `RateAnalysisResult` shape, one workspace, router param threaded
once. No placeholders, no scoring.
