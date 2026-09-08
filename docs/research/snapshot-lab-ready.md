# MOTION WORLD WEB — SNAPSHOT LAB READY (Milestone 3)

Turn a dense position-vs-time run into a clean classroom coordinate set and model
it with an equation. Built on M1/M1.5/M2 + the portable build. Software green,
both builds green, deployed. No new hardware behaviour claimed.

## HOME

Six peer tiles, existing balanced layout. **Active:** Live Lab · Data Display ·
Walk the Line · **Snapshot Lab**. **Coming next:** Speed Lab · Sequence Lab.
Runs stays the sole header utility. No roadmap row / Activity Library / Standards.

## SOURCES — one workspace, two entry points

- **`#/snapshot`** — the **current run** (`controller.lastCompletedRun()`). If
  none → **"NO RUN TO SNAPSHOT"** + `[ Go to Live Lab ]` `[ Open Saved Runs ]`.
- **`#/snapshot/<runId>`** — a **saved run** (`runStore.get(id)` →
  `deserializeRun`). Reached from **Runs → View → "Open in Snapshot"**. **No
  sensor needed** — works offline. Neither the in-memory run nor the persisted
  raw run is ever mutated (asserted).

## ANALYSIS WINDOW — selection UX

- **Direct on the SVG graph:** a shaded band with **draggable LEFT / RIGHT
  handles** and a **draggable band** (moves the whole interval). Pointer Events,
  pointer capture on the chart host. Handles **cannot cross** (min gap), **clamp
  to the run range**; the region outside is subdued.
- **Accessibility fallback (not drag-only):** numeric **Start** / **End**
  steppers + a **Use All** button, always present.
- `Selected: 1.20 s → 4.80 s` shown; `[ Use All ]` `[ Make Snapshot ]`; after a
  snapshot exists, `[ Change Window ]`.
- **Semantics:** the pure `AnalysisWindow` (M2) — clamped into `[runStart,
  runEnd]`, `start < end`, inclusive both ends, no NaN/Infinity, irregular
  timestamps fine. **Raw samples never change.**

## CLASSROOM SNAPSHOT — `src/model/classroom-snapshot.ts` (pure)

- **Transform:** classroom **x = the integer grid `0, 1, …, N−1`** (deliberately
  *not* seconds — the abstract grid the teacher sized by choosing N). Classroom
  **y = the interpolated position in metres** (no y-rescale in V1 — keeps the
  equation honest; documented future option).
- **Point sampling:** the N points are sampled at real times **evenly spaced
  across the window** (`t_k = start + k/(N−1)·duration`) by **linear
  interpolation** between bracketing raw samples (`positionAt`,
  `src/model/run-interpolation.ts`). Deterministic — never random samples.
  **Interpolation touches only derived points; the raw `MotionRun` is untouched.**
- **Rounding:** `points` (display) carry y **snapped to the nearest 0.5**;
  **`fitPoints` (modelling) carry the unrounded y**. Distinct typed arrays;
  `runFit` consumes `fitPoints`.
- **Point count:** 3–10, default 5, clamped; a stepper rebuilds the snapshot.
- **`classroomDomain`** is fixed + padded to 0.5 — the classroom graph never
  auto-scales.
- **Raw immutability:** `positionAt` / `makeClassroomSnapshot` / the workspace
  never mutate the run — tests freeze it and deep-equal before/after a full
  session.

## MODELS — `src/model/model-fit.ts` (pure)

**Supported families:** Constant · Linear · Quadratic · Cubic · Absolute value ·
Square root · Exponential.

**Fit methods:**
- constant `y=a` (mean); linear/quadratic/cubic — normal equations `AᵀA c = Aᵀy`
  solved by **Gauss-Jordan with partial pivoting**; needs ≥ degree+1 distinct x.
- **abs** `a·|x−h|+k` — h searched over the point x-values + midpoints; linear
  in (a, k) for each h.
- **sqrt** `a·√(x−h)+k` — h candidates below min(x); linear in (a, k) over `√(x−h)`.
- **exp** `a·eᵇˣ` — require all y one sign & non-zero; log-linearise, r² on the
  original scale.
- **r²** = `1 − SS_res/SS_tot`, honest (may be < 0); `SS_tot=0` → 1 if exact else
  0; the UI clamps the *displayed* value at 0.
- **A family may refuse** (`FitFailure`): too few points, exp on non-positive y,
  |b|≈0, sqrt on non-monotone junk. **No fake equations.**

**Suggest — `src/model/suggest-model.ts` (deterministic, documented thresholds
`GOOD=0.98`, `MATERIAL=0.03`, `SPECIAL_GOOD=0.995`, `SPECIAL_MARGIN=0.02`):**
the **simplest model that fits well enough**, never max r². constant → linear
first; a special shape (abs/sqrt/exp) wins only if excellent *and* clearly beats
a line; then quadratic/cubic only if they materially beat the simpler
polynomial. **Linear r²≈0.995 beats Cubic r²=1.000.**

## EQUATIONS — `src/model/classroom-equation.ts` + `src/ui/snapshot/equation-display.ts`

- **Classroom approximation (primary, large):** `f(x) ≈ -x + 4` — each
  coefficient **snapped** (within 0.15 of an integer → integer; else within 0.15
  of a half → half; else one decimal), tidied (`1x→x`, `-1x→-x`, `+ -4 → - 4`,
  drop `0` terms **unless it erases the family**). **Display only — never
  replaces the `FitResult` coefficients.**
- **Precise fit (smaller, always visible):** `precise fit: f(x) = -0.99x + 3.94`.
- **r² (subordinate):** `r² = 1.00`.
- **Model curve on the graph = the exact regression** (`functionOverlay` samples
  `predict`), with a **POINTS / MODEL** legend; points are never hidden.
- **Show Large:** a projector overlay — `MODEL` · very large `f(x) ≈ …` ·
  `PRECISE FIT` / `f(x) = …` · `r²` · one-line family description. Reusable
  `splitEquation` wraps a long cubic at top-level ` + ` / ` − ` boundaries
  (never inside `()` / `f(x)`) — **long equations never crop.**

## POINTS

Collapsed by default; header **`POINTS (5)`**. Opens to a two-column **X | Y**
table (large tabular numbers, scrollable, height-capped so it never squashes the
graph). A new / recreated snapshot **stays collapsed** unless the teacher opened
it.

## FIT INVALIDATION

Centralised in the pure `SnapshotWorkspace`: any change to the **source run**,
**window**, **point count**, or **snapshot** sets `fit = null`. The `family` may
stay selected, but the **equation / r² / model curve / Show Large disappear
until a refit**. The view renders purely from `ws.fit`, so a stale equation is
structurally impossible.

## RUNS INTEGRATION

Runs **detail** gained **`[ Open in Snapshot ]`** → `#/snapshot/<id>`. Snapshot
never mutates the persisted raw run. **`ClassroomSnapshot` is NOT persisted in
M3** — derived snapshots are session/workspace state; raw `MotionRun`s stay the
durable truth.

## PORTABLE

- `dist-portable/MotionWorld.html` — **one runtime file, 93 kB** (was 70 kB).
  Still no CDN / remote fonts / remote JS / runtime API / fetched assets / runtime
  WASM / remote math renderer. All fit math is bundled TypeScript; equations are
  CSS + Unicode + SVG (no MathJax/KaTeX — asserted).
- Both builds green; the app stays fully functional offline.

## TESTING

- **372 tests, 53 files — all green** (289 → **+83**). `tsc --noEmit` clean.
  `npm run build` clean (multi-file). `npm run build:portable` clean (one file).
  `npm audit`: **0 vulnerabilities**. `npm ci` reproducible. `git diff --check` clean.
- New coverage: `positionAt` (6); `ClassroomSnapshot` transform / display-vs-fit
  / determinism / degenerate window / raw untouched (7); polynomial fits + r²
  honesty + insufficient points (7); abs/sqrt/exp fits + refusals (6); Suggest —
  simple-good-enough, linear-beats-cubic, quadratic when a line fails, clean
  V/exp (8); classroom-equation snapping + formatting + display-only (10);
  `SnapshotWorkspace` transitions + fit invalidation + run-never-mutated (9);
  chart editable selection + xGeometry + model overlay (5 new); reusable equation
  display + splitEquation + Show Large (6); POINTS drawer (4); the Snapshot Lab
  workspace end-to-end (9); router `#/snapshot` + `#/snapshot/<id>` (2 new); app
  wiring (2 new); Runs "Open in Snapshot" (1); pure-model architecture guard;
  portable-bundle assertions.
- No test claims physical-hardware behaviour. `SOFTWARE VERIFIED` vs
  `HARDWARE VERIFIED` maintained.

## PROJECTOR

Manual — `docs/research/milestone-3-projector-audit.md` (5 widths × Snapshot no
run / Raw Run / window selection / trimmed / Classroom Snapshot / POINTS
closed+open / Linear/Quadratic/Cubic/Abs/Sqrt/Exp / Suggest / Show Large /
saved-run Snapshot / resize). No browser-automation tool in this environment;
the visual pass is the human's. Structure, the sensor + persistence + pure-model
boundaries, and the single-file portable invariant run in CI.

## GITHUB

- repo `https://github.com/ronniegarzatx/MotionWorldWeb` (public)
- final commit **`f0da044`** on `main` (`0383553..f0da044`, no force)
- Pages: GitHub Actions → Pages, run `101895...` **success** (build also runs
  `npm run build:portable` as a self-check step)
- **live URL: https://ronniegarzatx.github.io/MotionWorldWeb/** — verified 200,
  assets 200, M3 bundled, CSP `connect-src 'self'`.
- `GoIO_SDK` / native MotionLab untouched; working tree clean.

## NEXT PHYSICAL ACCEPTANCE

Windows PC, Chrome/Edge, the live URL (hard-refresh):

1. Make a real **Live Lab** run (walk a target 0.5–3 m for ~5–8 s), Stop.
2. Home → **Snapshot Lab** → confirm the **Raw Run** graph (Time (s) / Position
   (m)).
3. **Select Window** → drag the left/right handles to a **middle interval** with
   real motion.
4. **Make Snapshot** → confirm the graph clearly changes to **Classroom x /
   Classroom y** with 5 points.
5. Open **POINTS** and inspect the X | Y table; close it.
6. **MODEL → Choose model → Linear** (or **Suggest**).
7. Compare the large **`f(x) ≈ …`** with the smaller **`precise fit: f(x) = …`**
   and `r²`; confirm the model curve overlays the points.
8. **Show Large** → confirm the projector overlay; Esc to close.
9. **Change Window** and confirm the old equation / r² / model curve disappear
   until you refit.
10. Go to **Runs → View** a saved run → **Open in Snapshot** **with the sensor
    unplugged** → confirm it loads and models fine.
11. `npm run build:portable`, open **`dist-portable/MotionWorld.html`** directly,
    and repeat 1–9 with `?fake`.

**Do not begin Speed Lab.** It is the next milestone and reuses `positionAt` /
`AnalysisWindow` / the equation display.
