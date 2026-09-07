# Milestone 3 — Snapshot Lab — Plan

**Design:** `docs/superpowers/specs/2026-09-07-motion-world-web-snapshot-lab-design.md`
Builds on HEAD `0383553` (M2). **289 tests stay green.** TDD every task; each
ends `npm test -- --run && npx tsc --noEmit` green + a focused commit. Both
builds stay green.

Not building: Speed Lab, Sequence Lab, symbolic algebra, snapshot persistence.

---

## T1 — `model/run-interpolation.ts`
- **Tests first:** `positionAt(run, t)` — exact at a sample; linear between two
  samples; clamps below first / above last; single-sample run → that value;
  irregular timestamps; run frozen + unchanged.
- **Commit:** `feat(model): positionAt linear interpolation over a run`.

## T2 — `model/classroom-snapshot.ts`
- **Tests first:** `makeClassroomSnapshot(run, window, n)` —
  x = integer grid 0..n-1; n ∈ {3,5,10}; `fitPoints.y` = interpolated (unrounded);
  `points.y` = fitPoints.y snapped to 0.5; deterministic (same inputs → same
  output, no randomness); evenly-spaced sampling in real time; degenerate window
  → constant point set; `pointCount` clamped to [3,10]; `classroomDomain` fixed +
  padded to 0.5; **the source `MotionRun` is frozen and deep-equal before/after**;
  a snapshot whose window covers a linear walk 1.0→3.0 m gives clean points.
- **Commit:** `feat(model): ClassroomSnapshot transform (display vs fit points)`.

## T3 — `model/model-fit.ts` — polynomials + r²
- **Tests first (synthetic, exact):** constant `y=2` → r²=1, coeffs [2];
  linear `y=3x-1` → coeffs≈[3,-1], r²≈1; quadratic `y=2x²-x+4`; cubic
  `y=x³-2x²+x`; noisy linear → r² between 0.9 and 1; insufficient points
  (1 point for linear, 3 for cubic) → `FitFailure`; `predict` matches; r² of a
  deliberately-bad fit is < 1 (honest). Gaussian elimination unit-tested via the
  fits.
- **Commit:** `feat(model): polynomial least-squares fits + honest r²`.

## T4 — `model/model-fit.ts` — abs / sqrt / exp
- **Tests first:** abs `y=2|x-3|+1` (h search) → coeffs≈[2,3,1], r²≈1;
  sqrt `y=1.5√(x-0)+0.5` → r²≈1; exp `y=2·e^{0.5x}` → coeffs≈[2,0.5], r²≈1;
  exp on data with a y ≤ 0 → `FitFailure`; exp on a straight line (|b|≈0) →
  `FitFailure`; sqrt on non-monotone junk → `FitFailure`.
- **Commit:** `feat(model): absolute-value / square-root / exponential fits`.

## T5 — `model/suggest-model.ts`
- **Tests first:** perfect line → `linear`; **linear r²≈0.995 + cubic r²=1.000
  → `linear`** (named); a parabola where the line materially fails → `quadratic`;
  a clean `2|x-3|+1` → `abs`; a clean `2e^{0.5x}` → `exp`; a family that can't
  fit is skipped; thresholds exported as constants.
- **Commit:** `feat(model): deterministic Suggest (simplest good-enough fit)`.

## T6 — `model/classroom-equation.ts`
- **Tests first:** `snapCoefficient` — `-0.99→-1`, `3.94→4`, `2.46→2.5`,
  `0.52→0.5`, `1.27→1.3`, `0.08→0` ; `classroomExpression("linear",[-0.99,3.94])`
  → `"f(x) ≈ -x + 4"`; `[1,0]` → `"f(x) ≈ x"`; `[-1,-4]` → `"f(x) ≈ -x - 4"`;
  quadratic whose `a` snaps to 0 keeps one decimal (family preserved);
  `preciseExpression` → `"f(x) = -0.99x + 3.94"`; classroom string is display-only
  (doesn't touch coeffs).
- **Commit:** `feat(model): classroom-equation snapping + formatting`.

## T7 — `model/snapshot-workspace.ts`
- **Tests first:** `startWorkspace(run)` → mode "raw", window null, pointCount 5,
  fit null; `selectWindow` / `useAll` / `setWindowRange` clamp + keep valid;
  `makeSnapshot` → mode "snapshot" + `snapshot` built + `fit` null;
  `changeWindow` → back to selecting, `snapshot`/`fit` null; `setPointCount` →
  rebuilds `snapshot`, `fit` null; `setFamily` keeps `fit` null until `runFit`;
  `runFit` → `fit` set from `fitPoints`; `runSuggest` → sets `family` + fits;
  any window/pointCount change after a fit → `fit` null (no stale); the run is
  never mutated.
- **Commit:** `feat(model): pure SnapshotWorkspace with fit invalidation`.

## T8 — chart: editable selection + xGeometry + functionOverlay
- **Tests first:** `selection.editable` renders `.sel-handle-left` /
  `.sel-handle-right` + a `.sel-band`; a pointerdown+move on the left handle
  calls `onChange` with a larger start (clamped, can't cross the right);
  band drag shifts both; `xGeometry()` → `{ domain, pixelLeft, pixelRight }`;
  pure `pixelXToSeconds` maps endpoints; `functionOverlay` draws a `.model` path
  sampled from the function; existing chart/target/geometry tests still pass.
- **Commit:** `feat(ui): chart editable interval selection + model-curve overlay`.

## T9 — `ui/snapshot/equation-display.ts` + `show-large-overlay.ts`
- **Tests first (jsdom):** `mountEquationDisplay(host, { classroom, precise,
  rSquared, family })` → the classroom line is the largest; precise + r² present;
  `splitEquation("a x^3 + b x^2 - c x + d")` splits at top-level ` + `/` − `,
  not inside `f(x)` or `()`; a very long cubic renders on ≥ 2 lines and the host
  has no horizontal overflow (`scrollWidth <= clientWidth` with a set width).
  `mountShowLargeOverlay` → MODEL / big classroom / smaller precise / r² /
  description; Esc + backdrop close; teardown removes it.
- **Commit:** `feat(ui): reusable equation display + Show Large overlay`.

## T10 — `ui/snapshot/points-drawer.ts`
- **Tests first (jsdom):** collapsed by default, header `POINTS (5)`; open →
  `X | Y` table with 5 rows matching `snapshot.points`; close → table gone;
  re-render after a new snapshot stays collapsed unless `keepOpen`.
- **Commit:** `feat(ui): Snapshot POINTS drawer (collapsed by default)`.

## T11 — `ui/snapshot/snapshot-lab-view.ts` (orchestrator)
- **Tests first (jsdom, FakeSensorAdapter + MemoryRunStore):**
  - **no run** → "NO RUN TO SNAPSHOT" + `[ Go to Live Lab ]` `[ Open Saved Runs ]`
    (navigate spies).
  - **with a current run** → Raw Run graph (Time (s) / Position (m)), `Select
    Window`.
  - Select Window → drag/steppers set `Selected: a → b`; `Use All`.
  - Make Snapshot → mode toggles; graph axes become **Classroom x / Classroom
    y**; markers = 5 points; POINTS header shows `(5)`, collapsed.
  - point-count stepper 3..10 rebuilds the markers.
  - `MODEL [Choose ▾] [Suggest]`; choose Linear → big `f(x) ≈ …`, smaller
    `precise fit: …`, `r² = …`, a `.model` curve overlays the points.
  - **Change Window → the equation / r² / overlay disappear** until refit.
  - Show Large opens the overlay.
  - a **saved run** (runId) loads with no controller run; works offline.
  - the raw `MotionRun` (and any stored run) is never mutated.
- **Commit:** `feat(ui): Snapshot Lab workspace`.

## T12 — wire it: router + Home + app + Runs + shell
- router: `"snapshot"` route; `#/snapshot` and `#/snapshot/<id>`.
- `home-view.ts`: Snapshot Lab **active** (4 active, 2 disabled).
- `app.ts`: `snapshot` → `mountSnapshotLabView({ controller, runStore, navigate,
  runId: location.param })`; nav-away `stopForNavigation` set now also includes…
  no — Snapshot isn't a live tool, but leaving a *live* tool for Snapshot still
  needs the existing guard (already covers tool→anywhere).
- `run-detail-view.ts`: `[ Open in Snapshot ]` → `navigate("snapshot", id)`.
- **Tests:** Home has 4 active tiles; `#/snapshot` mounts with the shared
  controller (no 2nd controller, no `connect`); `#/snapshot/<id>` mounts from the
  store; Runs detail "Open in Snapshot" navigates.
- **Commit:** `feat(app): activate Snapshot Lab — routes, Home, Runs hand-off`.

## T13 — architecture guard + portable + docs + audit
- `tests/architecture.test.ts`: model-fit / classroom-* / snapshot-workspace are
  pure (no DOM import, no `document`); Snapshot view doesn't import IndexedDB or
  WebHID internals.
- `tests/portable/artifact.test.mjs`: bundle contains `Classroom Snapshot` /
  `Suggest`; still one file; no network refs.
- `docs/research/milestone-3-projector-audit.md` — the state matrix from the
  prompt.
- README: 4 active tools; Snapshot's core idea (immutable raw / derived
  classroom view / approximate-vs-precise equation).
- **Commit:** `test+docs: M3 guard, portable check, projector audit, README`.

## T14 — verify + deploy + report
`npm ci` · `npm test -- --run` · `npx tsc --noEmit` · `npm run build` ·
`npm run build:portable` · `npm audit` · `git diff --check`. Preview smoke
(`?fake`: run → Snapshot → select → Make Snapshot → Linear → Show Large →
change window). Push `main`, watch Pages, verify the live URL.
`docs/research/snapshot-lab-ready.md` + the final report.

---

## Risks / notes
- **jsdom PointerEvent** — reuse the M2 `MouseEvent`+`pointerId` shim.
- **Gaussian elimination** — small (≤4×4), partial pivoting, guard singular →
  `FitFailure`.
- **exp / sqrt honesty** — bias toward `FitFailure`; a wrong equation is worse
  than "this model doesn't fit".
- **equation split** — only Snapshot needs it now but build it reusable.
- Keep every existing test.

## Self-review
Spec coverage: sources (T11/T12), AnalysisWindow selection UX (T8/T11),
classroom transform + sampling + rounding + immutability (T1/T2), model families
+ fits + r² (T3/T4), Suggest (T5), classroom + precise equations + Show Large
(T6/T9), POINTS drawer (T10), model curve overlay (T8/T11), fit invalidation
(T7/T11), Runs integration (T12), routing (T12), portability (T13), tests
(every task), audit (T13), README (T13). No placeholders. One `FitResult` shape,
one `ClassroomSnapshot`, one workspace; router param threaded once.
