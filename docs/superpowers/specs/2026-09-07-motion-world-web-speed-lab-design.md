# Motion World Web — Speed Lab Design (Milestone 4)

**Date:** 2026-09-07 · **Human-approved direction.** Builds on M1/M1.5/M2/M3 +
the portable build. **Parent spec:** `docs/superpowers/specs/2026-09-06-motion-world-web-v1-design.md`
(Speed Lab pedagogy). This doc resolves architecture; it does not re-open the
approved product decisions.

## What Speed Lab is

Speed Lab V1 does **one thing well**: turn a selected section of a
position-vs-time motion into an **honest speed / velocity calculation** a class
can read off a projector.

- **Speed** = an unsigned magnitude in mph (and, smaller, m/s).
- **Velocity** = the signed rate, shown smaller (`+2.06 m/s` / `−1.4 m/s`).
- **Direction** = away from sensor / toward sensor / stationary — words, never a
  minus sign in front of a "speed".
- Compared against a **speed-limit preset** (2 / 5 / 10 mph, default 5) with a
  plain "0.4 mph under the 5 mph limit" line. **No scoring, no stars, no pass/fail.**

The number the class sees is the **ordinary-least-squares slope of every real
sample in the selected interval** — not a two-point difference. The two-point
endpoint slope appears only inside the teaching overlay as a check.

## Locked constraints (unchanged)

- Portability: `npm run build` and `npm run build:portable` both green after M4;
  one runtime file; no CDN / runtime fetch / external font / remote math renderer
  / backend / runtime-downloaded WASM. Math text = CSS + Unicode + SVG.
- No lab imports IndexedDB (`src/store/` only) or WebHID internals
  (`src/sensor/` only) — `tests/architecture.test.ts` guards, extended to
  `src/ui/speed/`.
- Pure math in model modules — no Python/Pyodide/SciPy. `src/model/rate-analysis.ts`
  is DOM-free and on the PURE list.
- The raw `MotionRun` is **never modified**. `RateAnalysis` is derived,
  session-only, never persisted.
- Speed Lab works **with the sensor unplugged** (from a saved run) and with
  `?fake`.

---

## 1. Sources — one workspace, three entry points

**One** Speed Lab workspace consumes a single `MotionRun`.

- **`#/speed`** — the current run: `controller.lastCompletedRun()`.
  - null + a sensor present → empty state with `[ Connect sensor ]` (scrolls the
    shared acquisition bar into view / no-ops if already connected) and
    `[ Open saved runs ]`.
  - null + no sensor (`!hid && !fake`) → same empty state; `[ Connect sensor ]`
    still shown (the bar reports "not supported"), `[ Open saved runs ]` is the
    real path.
- **`#/speed/<runId>`** — a saved run: `runStore.get(id)` → `deserializeRun`. No
  sensor needed. Reached from **Runs → View → "Open in Speed Lab"**.

Mirrors Snapshot Lab exactly (`SnapshotLabDeps` → `SpeedLabDeps`: `controller`,
`runStore`, `navigate`, optional `runId`). The in-memory current run is app
state; saved runs use the id in the hash.

### Direct collection inside Speed Lab

Speed Lab does **not** own a second connection. The shared acquisition bar
(shell-level) and the one `AcquisitionController` do all sensor work. Speed Lab:

1. On mount, if `controller.uiState.state === "MEASURING"`, show a **"Collecting…
   the speed result appears when you press Stop"** placeholder (live trace drawn,
   no result — matches "calculate the classroom Speed result after Stop").
2. `controller.subscribeRunComplete(run)` → freeze that run as the workspace
   source, build a **full-run `AnalysisWindow`**, compute `RateAnalysis`
   immediately, render the result.
3. `subscribeSample` while measuring only feeds the live trace (throttled via the
   existing `raf` scheduler), never a live speed number.

No new `navigator.hid` call, no `adapter` access — `controller` only.

---

## 2. Rate analysis — `src/model/rate-analysis.ts` (pure)

```ts
export type MotionDirection = "away" | "toward" | "stationary";

export interface RateAnalysis {
  readonly slopeMetersPerSecond: number;   // signed OLS slope m
  readonly interceptMeters: number;        // OLS intercept b
  readonly rSquared: number;               // 0..1, clamped ≥ 0
  readonly speedMetersPerSecond: number;   // |m|
  readonly speedMilesPerHour: number;      // |m| × MPH_PER_MPS
  readonly direction: MotionDirection;
  readonly sampleCount: number;            // samples used in the fit
}

export interface RateAnalysisFailure {
  readonly ok: false;
  readonly reason: string;
}
export type RateAnalysisResult =
  | ({ readonly ok: true } & RateAnalysis)
  | RateAnalysisFailure;

export const MPH_PER_MPS = 2.2369362920544;      // centralized + tested
export const STATIONARY_SPEED_MPS = 0.05;          // |m| below this ⇒ "stationary"

export function analyzeRate(run: MotionRun, window: AnalysisWindow): RateAnalysisResult;
```

### OLS — the actual calculation

- Points: `activeSamples(window, run)` (start-inclusive / end-inclusive, the
  existing `AnalysisWindow` semantics). **x = `timestampSeconds`,
  y = `positionMeters`.** No resampling, no interpolation, all real samples.
- Fit `y = m·t + b` by closed-form least squares:
  ```
  n   = points.length
  Sx  = Σ tᵢ      Sy  = Σ yᵢ
  Sxx = Σ tᵢ²     Sxy = Σ tᵢ yᵢ
  denom = n·Sxx − Sx²
  m = (n·Sxy − Sx·Sy) / denom
  b = (Sy − m·Sx) / n
  ```
  Compute `Sx` etc. against a shifted origin `t₀ = points[0].t` for float
  conditioning (mathematically identical; keeps `denom` well away from
  cancellation on runs that start at large timestamps). `b` is then re-expressed
  at absolute `t`.
- `rSquared`: `1 − SS_res/SS_tot`, `SS_tot = Σ(yᵢ − ȳ)²`. If `SS_tot == 0`
  (perfectly flat) → `rSquared = 1`. Clamp to `≥ 0` (a worse-than-mean fit can't
  happen for OLS but guards float noise). Never NaN/Infinity out.

### Direction

| condition                          | direction    |
|------------------------------------|--------------|
| `|m| < STATIONARY_SPEED_MPS`       | `stationary` |
| `m ≥ STATIONARY_SPEED_MPS`         | `away`       |
| `m ≤ −STATIONARY_SPEED_MPS`        | `toward`     |

Positive slope = position increasing = **away from sensor**. Rationale: Vernier
Go!Motion / CBR report distance-from-sensor; larger = farther.

### Refusal (`{ ok: false }`)

`analyzeRate` refuses — no partial/NaN result — when:

- fewer than **2** usable samples in the window,
- window duration effectively zero (`< 1e-6 s`) OR all sample timestamps equal
  (`denom ≤ 0`),
- any used timestamp/position is non-finite, or timestamps are not
  non-decreasing across the used samples.

`reason` is classroom-plain: `"Select at least two samples over a bit of time to
measure speed."` / `"These samples don't have valid timestamps."` The view shows
the reason where the result would be; it never renders `NaN`/`Infinity`/`−0`.

---

## 3. Speed-limit comparison — `src/model/speed-limit.ts` (pure)

```ts
export const SPEED_LIMIT_PRESETS_MPH = [2, 5, 10] as const;
export const DEFAULT_SPEED_LIMIT_MPH = 5;
export type SpeedLimitStanding = "under" | "over" | "at";

export interface SpeedLimitComparison {
  readonly limitMph: number;
  readonly speedMph: number;
  readonly standing: SpeedLimitStanding;
  readonly marginMph: number;   // always ≥ 0 — |speed − limit|
}

export function compareToSpeedLimit(speedMph: number, limitMph: number): SpeedLimitComparison;
```

- `at` when `|speed − limit| < AT_TOLERANCE_MPH` (`0.05` mph) — avoids a jittery
  "0.0 mph over" line. Otherwise `under` / `over`.
- `marginMph` is unsigned; the view composes "0.4 mph **under** the 5 mph limit"
  / "1.1 mph **over** the 5 mph limit" / "right at the 5 mph limit".
- Purely a comparison. No judgement language, no colour = pass/fail semantics
  (the view may tint "over" with the existing warning token, but there is no
  score).

---

## 4. Two-point teaching slope — `src/model/endpoint-slope.ts` (pure)

Used **only** by the teaching overlay, never for the headline number.

```ts
export interface EndpointSlope {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly startMeters: number;   // positionAt(run, window.startSeconds)
  readonly endMeters: number;     // positionAt(run, window.endSeconds)
  readonly deltaSeconds: number;  // end − start
  readonly deltaMeters: number;   // end − start
  readonly slopeMetersPerSecond: number; // deltaMeters / deltaSeconds
}
export function endpointSlope(run: MotionRun, window: AnalysisWindow): EndpointSlope | null;
```

- Endpoints come from `positionAt` (existing `run-interpolation.ts`), so they sit
  exactly on the measured trace at the window's chosen boundary times even when
  those fall between samples.
- Returns `null` when `deltaSeconds < 1e-6` (overlay then shows only the OLS
  explanation).

---

## 5. Speed workspace — `src/model/speed-workspace.ts` (pure)

Same shape/discipline as `snapshot-workspace.ts`. Session-only; source run never
mutated; every window change recomputes the analysis (there is no stale-state
window because the result is always derived, not cached across an inconsistent
edit).

```ts
export interface SpeedWorkspace {
  readonly run: MotionRun;
  readonly window: AnalysisWindow;
  readonly limitMph: number;
  readonly analysis: RateAnalysisResult;
  readonly comparison: SpeedLimitComparison | null;  // null when analysis failed
  readonly endpoint: EndpointSlope | null;
}

startSpeedWorkspace(run: MotionRun): SpeedWorkspace      // full-run window, default limit
setSpeedWindow(ws, startSeconds, endSeconds): SpeedWorkspace
useAllSpeed(ws): SpeedWorkspace
setSpeedLimit(ws, limitMph): SpeedWorkspace
withSpeedRun(ws, run): SpeedWorkspace                    // Open-in-Speed-Lab reset
```

Every transition rebuilds `analysis` / `comparison` / `endpoint` from the pure
functions above. `comparison` uses `analysis.speedMilesPerHour` when
`analysis.ok`, else `null`.

---

## 6. Position graph (reuses `src/ui/chart/time-series-chart.ts`)

**POSITION vs. TIME** · X: `Time (s)` · Y: `Position (m)`.

- `series` = every raw sample (the measured trace).
- `selection` = the `AnalysisWindow`, **editable** (`onChange` → `setSpeedWindow`).
  Same web-native interval selector Snapshot uses — drag band / drag either
  handle. Plus `[ Select window ]` / `[ Use all ]` / start-end steppers for
  keyboard/projector use.
- **Best-fit line across the selected interval only** — via `functionOverlay`:
  ```ts
  functionOverlay: (t) =>
    t >= win.startSeconds && t <= win.endSeconds ? m * t + b : NaN
  ```
  The chart already breaks the `.model-curve` path on non-finite y, so the line
  is drawn *only* over the selection. `xDomain: "auto-grow"`, `yDomain: "auto"`
  (this is the raw trace, not a fixed classroom domain).
- No markers, no motion-trace layer (those are Snapshot's classroom view).

---

## 7. Result panel — hierarchy

```
YOUR SPEED
  4.6 mph                    ← large (reuses the big-number treatment)
  Away from sensor           ← secondary
  0.4 mph under the 5 mph limit
  Velocity: +2.06 m/s        ← smaller
  best-fit r² = 0.98 · 128 samples over 2.10 s   ← smallest, honest provenance

SPEED LIMIT   [ 2 mph ] [ 5 mph ] [ 10 mph ]     ← 5 selected by default

[ How was this speed calculated? ]
```

- "mph" is primary because that's the classroom hook; m/s is always there.
- `stationary` → headline reads `0.0 mph` / `Not moving` / hides the velocity
  sign line's emphasis (still shows `Velocity: +0.01 m/s` small). The limit line
  becomes "well under the 5 mph limit".
- Numbers: mph to 1 dp, m/s to 2 dp, r² to 2 dp, durations to 2 dp. `−0` is
  normalized to `0`.
- Failure → the panel shows the refusal `reason` and the limit presets + graph
  stay usable so a teacher can widen the interval.

---

## 8. "How was this speed calculated?" overlay — `src/ui/speed/speed-explainer-overlay.ts`

Projector-focused, same Esc/backdrop-close pattern as `show-large-overlay.ts`
(that component is equation-specific; Speed Lab gets its own, sharing the
`.show-large` overlay CSS shell).

Sections:

1. **Two-point slope (the idea).**
   `m = Δposition ÷ Δtime`
   then substituted with the **actual endpoint values**:
   `(0.67 m − 0.19 m) ÷ (1.04 s − 0.56 s)  =  0.48 m ÷ 0.48 s  =  1.00 m/s`
   with a one-line "Δ (delta) means 'the change in' — the end value minus the
   start value." Endpoints = `positionAt(run, window.start/​end)`.
2. **What Motion World actually uses (the honest part).**
   "Two points can be noisy. Motion World uses the **best-fit slope of every
   sample** in the selected interval — the straight line that comes closest to
   all of them at once (least squares)." Shows the OLS `m`, `b`, `r²`, sample
   count. If the two slopes differ by more than ~10% it adds "(the best-fit slope
   is the one shown above)".
3. **From slope to speed.**
   `speed = |slope|` · `mph = |slope| × 2.2369` · direction from the sign.

All values injected as pre-formatted strings; the overlay does no math.

---

## 9. Routing / shell / home

- `router.ts`: add `"speed"` to `Route`; `#/speed` → `HASH_TO_ROUTE`;
  `ROUTE_TO_HASH.speed = "#/speed"`; `locationFromHash` handles `#/speed/<id>`
  exactly like `#/snapshot/<id>` (param route, `navigate("speed", id)` builds
  `#/speed/<id>` — extend the `route === "run" || route === "snapshot"` guard to
  include `"speed"`).
- `app.ts`: `case "speed":` → `mountSpeedLabView(main, { controller, runStore,
  navigate, ...(param ? { runId: param } : {}) })`. Add `"speed"` to the
  nav-away `TOOLS` set so an in-progress run started in Speed Lab is frozen +
  saved (reason `"navigation"`) on leaving.
- `home-view.ts`: Speed Lab tile → `route: "speed"`, note
  `"Turn a run into a speed"`. Sequence Lab stays `route: null` / "Coming next".
  Home stays **six** peer tiles; **five** active.
- `run-detail-view.ts`: add `[ Open in Speed Lab ]` (secondary button) next to
  "Open in Snapshot" → `navigate("speed", stored.id)`.
- `tests/app/router.test.ts`: the "unknown hash → home" case currently uses
  `#/speed`; switch it to a genuinely unknown hash (`#/nope`).

---

## 10. Tests (TDD)

**Model — `tests/model/rate-analysis.test.ts`:**
- OLS slope of a clean `y = 0.5t + 1` run over a sub-window ⇒ `m ≈ 0.5`,
  `b ≈ 1`, `r² ≈ 1`, `speedMps ≈ 0.5`, `speedMph ≈ 0.5 × 2.2369…`.
- OLS uses **all** samples, not endpoints: a run that is linear except for one
  yanked interior sample ⇒ slope shifts toward the cloud, ≠ endpoint slope.
- Noisy-but-linear run ⇒ slope within tolerance of the true slope; `r² < 1`.
- Direction: positive slope ⇒ `away`; negative ⇒ `toward`; `|m| < 0.05` ⇒
  `stationary`.
- `MPH_PER_MPS` is exactly `2.2369362920544`; `speedMph === speedMps *
  MPH_PER_MPS`.
- Never "negative speed": a toward run has `speedMps > 0`, `slope < 0`.
- Refuses: 0/1 samples in window; zero-duration window; equal timestamps;
  non-finite sample. No NaN/Infinity in any returned field.
- Does not mutate the run (frozen samples unchanged).

**Model — `tests/model/speed-limit.test.ts`:** presets/default; under/over/at
with the tolerance; `marginMph ≥ 0`; boundary at exactly the limit ⇒ `at`.

**Model — `tests/model/endpoint-slope.test.ts`:** endpoints from `positionAt`;
`deltaMeters/deltaSeconds`; `null` on ~zero duration; between-sample window
boundaries interpolate.

**Model — `tests/model/speed-workspace.test.ts`:** full-run window on start;
`setSpeedWindow` recomputes analysis + comparison; `setSpeedLimit` recomputes
only the comparison; failed analysis ⇒ `comparison === null`; `withSpeedRun`
resets.

**UI — `tests/ui/speed-lab-view.test.ts` (jsdom):**
- No run ⇒ empty state, `[ Connect sensor ]` + `[ Open saved runs ]` navigate.
- Current run ⇒ "YOUR SPEED", an mph number, a direction phrase, a limit line, a
  `Velocity:` m/s line, the best-fit line present in the SVG only over the
  selection (a `.model-curve` path whose x-extent ⊂ the selection band).
- Preset buttons change the limit line; `5 mph` selected by default.
- "How was this speed calculated?" opens the overlay (two-point substitution
  with real numbers + the OLS explanation), Esc closes it.
- Editing the selection (drag handle) recomputes the headline number.
- Saved-run route (`runId`) renders with a null controller run and never writes
  to the store.
- Failure copy shown for a degenerate window; no `NaN` text anywhere in `host`.

**Architecture — `tests/architecture.test.ts`:** `src/model/rate-analysis.ts`,
`speed-limit.ts`, `endpoint-slope.ts`, `speed-workspace.ts` added to the PURE
list (no `document`, no `/ui/` import). `src/ui/speed/**` must not reference
`navigator.hid` / `sendReport` / `indexedDB`.

**Portable — `tests/portable/artifact.test.mjs`:** add `"Speed Lab"` and
`"YOUR SPEED"` (or the empty-state head) to the bundled-strings assertion; still
one file, no external refs.

---

## 11. Out of scope (V1)

- Acceleration / second derivative, multi-segment speed, average vs instantaneous
  distinction beyond the overlay note.
- Persisting `RateAnalysis`.
- Any scoring, streak, or "beat the limit" game.
- Sequence Lab (not started).
