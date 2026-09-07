# Motion World Web — Snapshot Lab Design (Milestone 3)

**Date:** 2026-09-07 · **Human-approved direction.** Builds on M1/M1.5/M2 + the
portable build. **Parent spec:** `docs/superpowers/specs/2026-09-06-motion-world-web-v1-design.md`
§6, §11 (Snapshot Lab pedagogy). Resolves architecture; does not re-open the
approved product decisions.

## Pedagogical progression

real motion → **choose an interval** (`AnalysisWindow`) → **rescale into
classroom coordinates** (`ClassroomSnapshot`) → **choose a few representative
points** → **fit a function family** → **compare a classroom-friendly approximate
equation with the precise regression**.

**The raw `MotionRun` is never modified.** Everything downstream is a derived,
session-only view.

## Locked constraints

- Portability: `npm run build` and `npm run build:portable` both green after M3;
  one runtime file; no CDN / runtime fetch / external font / remote math
  renderer / backend / runtime-downloaded WASM. Math text = CSS + Unicode + SVG.
- No lab imports IndexedDB or WebHID internals (existing guards, extended).
- Pure math in model modules — no Python/Pyodide/SciPy.
- Snapshot works **with the sensor unplugged** (from a saved run).

---

## 1. Sources — one workspace, two entry points

**One** Snapshot workspace consumes a `MotionRun`.

- **`#/snapshot`** — the current run: `controller.lastCompletedRun()`. If null →
  empty state:
  > **NO RUN TO SNAPSHOT** · `[ Go to Live Lab ]` `[ Open Saved Runs ]`
- **`#/snapshot/<runId>`** — a saved run: `runStore.get(id)` → `deserializeRun`.
  No sensor needed. Reached from **Runs → View → "Open in Snapshot"**.

App state carries the current in-memory run (not the URL). Saved runs use the id
in the hash.

## 2. Classroom coordinate transform — `src/model/classroom-snapshot.ts` (pure)

```ts
interface ClassroomPoint { readonly x: number; readonly y: number; }

interface ClassroomSnapshot {
  readonly sourceRunId: string;
  readonly window: AnalysisWindow;
  readonly pointCount: number;                 // 3..10, default 5
  readonly points: readonly ClassroomPoint[];      // DISPLAY — y snapped to 0.5
  readonly fitPoints: readonly ClassroomPoint[];   // MODELLING — y unrounded
  readonly xLabel: "Classroom x";
  readonly yLabel: "Classroom y";
}

makeClassroomSnapshot(run: MotionRun, window: AnalysisWindow, pointCount: number): ClassroomSnapshot
classroomDomain(snapshot): { x: [number, number]; y: [number, number] }   // FIXED, padded to 0.5
```

**Transform (V1):**
- **Classroom x = the integer grid `0, 1, …, N−1`.** The N representative points
  are sampled at real times evenly spaced across the window:
  `t_k = window.start + k/(N−1) · windowDuration`, and get classroom x = `k`.
  Axis label is **"Classroom x"** — deliberately *not* seconds. The abstract grid
  is `N−1` units wide (the teacher sizes it by choosing N).
- **Classroom y = the interpolated position in metres** (no y-rescale in V1 —
  keeps the equation's meaning honest; y-rescale is a documented future option).
- **`fitPoints`** carry the **unrounded** interpolated y.
- **`points`** carry y **snapped to the nearest 0.5** (display readability).
- Degenerate window (duration ≈ 0): every point maps to the window start → a
  constant point set (valid).

**Point sampling — linear interpolation (chosen over nearest-sample):** the x
positions stay exactly evenly spaced and deterministic; nearest-sample would
jitter x-vs-real-time. `positionAt(run, t)` (new pure helper
`src/model/run-interpolation.ts`, reused by Speed Lab later): linear interpolation
between the two bracketing raw samples; clamps to the endpoints outside the range.
**Interpolation touches only derived snapshot points — the raw `MotionRun` is
untouched** (asserted in tests).

**LOCKED:** display points may be rounded; **the model fit uses `fitPoints`
(unrounded)**. Types make the two arrays distinct; tests assert the fit consumes
`fitPoints`.

## 3. Model families + fitting — `src/model/model-fit.ts` (pure)

```ts
type ModelFamily = "constant" | "linear" | "quadratic" | "cubic" | "abs" | "sqrt" | "exp";

interface FitResult {
  readonly ok: true;
  readonly family: ModelFamily;
  readonly coefficients: readonly number[];
  readonly rSquared: number;                 // 1 − SS_res/SS_tot; honest (may be < 0)
  readonly preciseExpression: string;        // e.g. "f(x) = -0.99x + 3.94"
}
interface FitFailure { readonly ok: false; readonly family: ModelFamily; readonly reason: string; }

fitModel(family, points): FitResult | FitFailure
predict(family, coefficients, x): number     // pure; no stored closures in the persisted shape
```

- **constant** `y = a`: `a = mean(y)`. r² = 1 if data exactly constant, else 0.
- **linear** `y = ax + b`: ordinary least squares. Needs ≥ 2 distinct x.
- **quadratic / cubic** `Σ aᵢ xⁱ`: normal equations `AᵀA c = Aᵀy` solved by
  Gaussian elimination with partial pivoting. Needs ≥ degree+1 distinct x, else
  `FitFailure("Not enough usable points for this model")`.
- **abs** `y = a·|x − h| + k`: for h ∈ each candidate (the point x-values and
  their midpoints), the model is linear in (a, k) → pick the h with least SSR.
  Deterministic.
- **sqrt** `y = a·√(x − h) + k`, domain `x ≥ h`: try h ∈ { min(x) − {0, 0.25,
  0.5, 1} }; given h, linear in (a, k) over the basis `√(x−h)`. `FitFailure` if
  the best r² is poor or the data isn't monotone-ish.
- **exp** `y = a·eᵇˣ` (c = 0): require all y strictly one sign; flip sign if all
  negative; require all |y| > 0. Linearize `ln|y| = ln|a| + b x`, OLS, r²
  computed **on the original scale**. `FitFailure("This point set does not
  support an exponential fit")` if any y ≤ 0 after the flip, or |b| < 0.05, or
  the original-scale r² < 0.9.
- **r²:** `SS_tot = Σ(y−ȳ)²`, `SS_res = Σ(y−ŷ)²`; `SS_tot === 0` → r² = (SS_res
  === 0 ? 1 : 0). Reported honestly; the UI clamps the *displayed* value at 0.
- **A model may refuse.** No fake equations.

## 4. Suggest — `src/model/suggest-model.ts` (pure, deterministic)

`suggestModel(points): { family: ModelFamily; reason: string }`. Philosophy:
**the simplest model that fits well enough**, never "max r²".

Thresholds (exported constants):
- `GOOD = 0.98` — "fits well enough"
- `MATERIAL = 0.03` — a higher-degree polynomial must beat the simpler one by
  this much in r² to be preferred
- `SPECIAL_GOOD = 0.995`, `SPECIAL_MARGIN = 0.02` — abs/sqrt/exp must be this
  good *and* beat the best polynomial by this much

Order: constant → linear → quadratic → cubic → (abs | sqrt | exp).
1. constant r² ≥ GOOD → **constant**.
2. linear r² ≥ GOOD → **linear** (so linear 0.995 beats cubic 1.000).
3. quadratic r² ≥ GOOD **and** (quad.r² − lin.r²) ≥ MATERIAL → **quadratic**.
4. cubic r² ≥ GOOD **and** (cubic.r² − quad.r²) ≥ MATERIAL → **cubic**.
5. a special family with r² ≥ SPECIAL_GOOD **and** beats the best polynomial by
   ≥ SPECIAL_MARGIN → that family.
6. fallback: the best-fitting polynomial, preferring the lower degree when within
   MATERIAL.

## 5. Classroom equation — `src/model/classroom-equation.ts` (pure, display-only)

```ts
snapCoefficient(c): number
  // |c − round(c)| ≤ 0.15  -> round(c)
  // else |c − nearestHalf(c)| ≤ 0.15 -> nearestHalf(c)
  // else -> round to 1 decimal
classroomExpression(family, coefficients): string   // snapped, tidied
preciseExpression(family, coefficients): string     // no snap, 2 decimals
```

- Tidy: `1x → x`, `-1x → -x`, `… + -4 → … - 4`, drop `+ 0` / `0x²` **unless
  dropping erases the family** (a quadratic whose `a` snaps to 0 keeps `a` at one
  decimal so it stays quadratic).
- Examples asserted: `-0.99 → -1`, `3.94 → 4`, `2.46 → 2.5`, `0.52 → 0.5`,
  `1.27 → 1.3`; `f(x) = -0.99x + 3.94` → `f(x) ≈ -x + 4`.
- **The classroom string never replaces the `FitResult` coefficients.**

## 6. `AnalysisWindow` selection — direct on the SVG graph

Extend `src/ui/chart/time-series-chart.ts`:
- `ChartInput.selection?: { startT, endT, editable?: boolean; onChange?: (r) => void }`.
- When `editable`: shaded band; **draggable LEFT + RIGHT handles**; the band
  itself draggable to move the whole interval. Pointer Events; pointer capture on
  the persistent chart host (the Walk-drag pattern). Handles **cannot cross** (a
  min gap), **clamp to the x-domain**. Region outside the selection is subdued
  (lower opacity trace).
- New geometry: `ChartHandle.xGeometry(): { domain, pixelLeft, pixelRight } | null`
  + pure `pixelXToSeconds(g, px)` / `secondsPerPixelX(g)`.
- **Accessibility fallback (not drag-only):** the Snapshot view provides
  numeric/stepper controls for **Start**, **End**, and a **Use All** button.
- Raw samples never change; the window stays a valid `AnalysisWindow`.

## 7. Window / snapshot UX

- Fresh **Raw Run**: `[ Select Window ]`. Once active:
  `Selected: 1.20 s → 4.80 s` + `[ Use All ]` `[ Make Snapshot ]`.
- After a **Classroom Snapshot** exists: `[ Change Window ]`.
- Changing the window **invalidates** derived classroom points **and** the
  fit/equation/overlay/Show-Large. Does not touch the `MotionRun`; does not
  overwrite any saved run.

## 8. Model curve overlay — the graph shows the *precise* fit

Classroom Snapshot graph: classroom **points** (as markers) + the **fitted model
curve** sampled from `predict(family, coefficients, x)` across the classroom
x-domain. Chart gets `ChartInput.functionOverlay?: (x: number) => number` →
draws a `.model` path. Legend distinguishes **POINTS** / **MODEL**. The curve is
the **exact** fit; the big equation is the snapped classroom approximation.

Classroom domain is **fixed** (from `classroomDomain(snapshot)`, padded to 0.5) —
no auto-scale surprise.

## 9. Equations + Show Large — `src/ui/snapshot/equation-display.ts` (reusable)

Normal screen hierarchy:
- large: `f(x) ≈ -x + 4`
- smaller: `precise fit: f(x) = -0.99x + 3.94`
- subordinate: `r² = 1.00`

**Show Large** → a projector overlay (Esc / backdrop close): `MODEL` · very large
`f(x) ≈ …` · smaller `PRECISE FIT` / `f(x) = …` · `r² = …` · one-line family
description.

`equation-display.ts` implements the reusable fit: render large → measure →
shrink font toward a floor → if still overflowing, **split at top-level ` + ` /
` − ` term boundaries** onto continuation lines (never inside `()` or a function
call). Cubic equations must never crop.

## 10. Points drawer — `src/ui/snapshot/points-drawer.ts`

Collapsed by default; header `POINTS (5)`. Open → a two-column `X | Y` table,
large numbers, scrollable. Creating/recreating a snapshot keeps it collapsed
unless the teacher opened it.

## 11. Graph-first layout (projector)

```
[ Raw Run ▸ / ◂ Classroom Snapshot ]   ← explicit mode toggle + one-line copy
   graph (dominant)
   window / snapshot controls
   model controls + equations
   POINTS (collapsed)
```
Raw Run copy: "Original position vs. time. Your measured data is never changed."
Classroom copy: "Selected interval rescaled to classroom x/y coordinates for
modeling." Axis labels: Raw = **Time (s) / Position (m)**; Classroom =
**Classroom x / Classroom y**.

## 12. Workspace state + fit invalidation — `src/model/snapshot-workspace.ts` (pure)

```ts
interface SnapshotWorkspace {
  readonly run: MotionRun;
  readonly mode: "raw" | "snapshot";
  readonly window: AnalysisWindow | null;      // null until Select Window
  readonly pointCount: number;
  readonly snapshot: ClassroomSnapshot | null;
  readonly family: ModelFamily | null;         // may persist across refits
  readonly fit: FitResult | FitFailure | null;
}

startWorkspace(run) · selectWindow(ws, w) · useAll(ws) · setWindowRange(ws, s, e)
makeSnapshot(ws) · changeWindow(ws) · setPointCount(ws, n)
setFamily(ws, fam) · runFit(ws) · runSuggest(ws)
```

Every transition that changes `run` / `window` / `pointCount` / `snapshot` sets
`fit = null` (and rebuilds `snapshot` where appropriate). `family` may stay set,
but **equation / r² / overlay / Show Large are gone until `runFit` runs again**.
The view renders purely from the workspace → no stale results.

## 13. Routing / state

Router `Route` gains `"snapshot"`. `#/snapshot` → `{ route: "snapshot" }`;
`#/snapshot/<id>` → `{ route: "snapshot", param: id }`. `app.ts` mounts
`mountSnapshotLabView({ controller, runStore, navigate, runId?: param })`. The
in-memory current run comes from `controller.lastCompletedRun()`. Hash routing;
portable file routing unaffected.

## 14. Saved-run integration

Runs **detail** gains `[ Open in Snapshot ]` → `navigate("snapshot", run.id)`.
Snapshot never mutates the persisted raw run. **`ClassroomSnapshot` is NOT
persisted in M3** — derived snapshots are session/workspace state. Raw
`MotionRun`s stay the durable truth.

## 15. Module map (new)

```
src/model/
  run-interpolation.ts     positionAt(run, t) — pure linear interpolation
  classroom-snapshot.ts    ClassroomSnapshot + makeClassroomSnapshot + classroomDomain
  model-fit.ts             ModelFamily, FitResult|FitFailure, fitModel, predict
  suggest-model.ts         suggestModel + threshold constants
  classroom-equation.ts    snapCoefficient, classroomExpression, preciseExpression
  snapshot-workspace.ts    pure SnapshotWorkspace + transitions
src/ui/
  chart/time-series-chart.ts   (+ editable selection handles, xGeometry, functionOverlay)
  snapshot/
    equation-display.ts    reusable shrink/split equation renderer
    show-large-overlay.ts
    points-drawer.ts
    snapshot-lab-view.ts   orchestrator (raw/classroom panels inline)
src/app/router.ts          (+ "snapshot" route/param)
src/ui/runs/run-detail-view.ts   (+ "Open in Snapshot")
```

---

## Self-review

- **Raw immutability** — `positionAt` / `makeClassroomSnapshot` / `AnalysisWindow`
  / `snapshot-workspace` never mutate the run; tests freeze it and deep-equal
  before/after. `ClassroomSnapshot` and the workspace are the only derived state,
  session-only.
- **Rounded-display vs unrounded-fit** — distinct typed arrays (`points` vs
  `fitPoints`); `runFit` consumes `fitPoints`; a test asserts fitting the rounded
  table would give a different (worse) answer.
- **Portability** — all math is bundled TS; equation rendering is CSS/Unicode/SVG;
  no new dependency. The portable artifact test is extended (Snapshot code
  present, no network refs, still one file).
- **Suggest is deterministic** — pure function, documented constants, the
  linear-0.995-beats-cubic-1.000 case is a named test.
- **Fit invalidation** — centralised in `snapshot-workspace`; the view can't show
  a stale equation because it renders from `ws.fit`, which transitions null it.
- **Selection is not drag-only** — numeric Start/End steppers + Use All always
  present; drag is an enhancement.
- **Classroom axes unambiguous** — "Classroom x / Classroom y" vs "Time (s) /
  Position (m)"; the mode toggle carries one-line copy.
- **Snapshot ≠ 7th tile** — it's tool #4 of the existing six-tool Home; Runs
  stays the sole header utility.
- **No Speed Lab / Sequence work.** `equation-display` is built reusable but only
  Snapshot consumes it now.
- Contradiction check: "rescale into classroom coordinates" vs "keep the
  equation honest" — resolved: x is a clean abstract grid (0…N−1); y stays in
  metres (honest), display-rounded only; the graph curve uses the exact fit.
