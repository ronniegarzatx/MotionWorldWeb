# Motion World Web — Sequence Lab (Bounce + Pendulum) Design (Milestone 5)

**Date:** 2026-09-08 · **Human-approved direction.** Builds on M1–M4 + themes +
the portable build. Parent spec: `docs/superpowers/specs/2026-09-06-motion-world-web-v1-design.md`.
This resolves architecture; it does not re-open the approved product decisions.

## What Sequence Lab V1 is

A **physical-cycle sequence instrument** with exactly two optimised modes:

- **Bounce** — a bouncing object's position-vs-time run → `n` vs **bounce
  height** → approximate geometric decay → **common ratio**.
- **Pendulum** — a swinging run → `n` vs **turning-point amplitude** *or* **full
  period** → discrete sequence → approximate ratio / approximate constancy.

Story: real motion → detect repeating physical events → discrete terms → graph by
index `n` → inspect the pattern. **Analysis is retrospective (after Stop).**

### Explicitly NOT built
Timed/manual capture, Fibonacci, generic arithmetic/geometric switching,
index-start controls, Array Focus, prediction, a broad sequence framework,
sinusoid/pendulum-equation fitting, a separate Bounce Lab or Pendulum Lab, live
classification.

## Locked constraints (unchanged)
- Portability: `npm run build` + `npm run build:portable` green; one runtime file
  `dist-portable/MotionWorld.html`; no CDN / backend / runtime fetch / remote
  font / remote JS / remote math renderer / downloaded WASM. **All cycle
  detection + sequence analysis is bundled TypeScript.**
- `MotionRun` is immutable truth. Every derived event / term / ratio is a pure,
  session-only transform. Nothing in Sequence Lab rewrites raw samples. Derived
  results are **not persisted** in V1.
- No lab imports IndexedDB (`src/store/` only) or WebHID internals (`src/sensor/`
  only). `src/model/cycle-analysis.ts` and `src/model/sequence-workspace.ts` are
  DOM-free and on the architecture pure-list.
- Same acquisition flow (System Ready → Sensor Ready → Start → Stop), the one
  `AcquisitionController`, the ordinary dense `MotionRun` at 25 Hz. No
  mode-specific sensor period, no extra HID, no second controller/loop.

---

## 1. Sources — one workspace, three entry points

Mirrors Snapshot / Speed Lab.

- **`#/sequence`** — the current run (`controller.lastCompletedRun()`). If null:
  empty state → `[ Connect sensor ]` / `[ Open saved runs ]`. Never silently pick
  an old run.
- **`#/sequence/<runId>`** — a saved run (`runStore.get` → `deserializeRun`), no
  sensor. Reached from **Runs → Open in Sequence Lab**.
- **Direct collection** — collect in Sequence Lab; after `subscribeRunComplete`
  the run is analysed. While `MEASURING`: a "Collecting…" placeholder (dense live
  trace, no terms) until Stop.

`SpeedLabDeps`-shaped: `{ controller, runStore, navigate, runId? }`.

---

## 2. `src/model/cycle-analysis.ts` (pure) — the detector core

Index-based (samples are ~uniform at 25 Hz; irregular timestamps are tolerated —
smoothing/extrema work on the value array, all *times* read from the real sample
timestamps). No resampling of the raw data.

### Primitive helpers (each unit-tested in isolation)
```ts
movingAverage(values: readonly number[], halfWindow: number): number[]   // centred, edge-clamped
median(values: readonly number[]): number
mad(values: readonly number[]): number                 // 1.4826 · median(|v − median|)
estimateNoise(values: readonly number[]): number       // 1.4826 · median(|2nd difference|) / √6  → σ of white noise
diff(values: readonly number[]): number[]
coefficientOfVariation(values: readonly number[]): number   // std / |mean|, 0 when mean≈0
```

### Extrema
```ts
interface RawExtremum {
  readonly index: number;          // sample index of the turning point
  readonly kind: "max" | "min";
  readonly timeSeconds: number;    // refined (parabolic) time
  readonly valueMeters: number;    // refined (parabolic) position
  readonly rawValueMeters: number; // the sample's own position (provenance)
  readonly prominence: number;
}

findLocalExtrema(values: readonly number[]): { index: number; kind: "max" | "min" }[]
  // strict turning points with plateau handling; first/last sample never an extremum
computeProminence(values, index, kind): number
  // drop from the extremum to the higher of the two bounding "cols"
  // (the most extreme opposite-direction value on each side before a higher same-kind extremum),
  // searched within a bounded window
refineVertex(values, index): { deltaIndex: number; value: number }   // parabola through i−1,i,i+1

detectExtrema(run, { sensitivity }): RawExtremum[]
  // 1. v = positions; s = movingAverage(v, k(sensitivity)); noise = estimateNoise(v)
  // 2. cand = findLocalExtrema(s)
  // 3. keep if computeProminence(s, i, kind) ≥ noise · promFactor(sensitivity)
  // 4. enforce minSeparationSamples(sensitivity): within a run of too-close same-direction
  //    candidates, keep the most prominent; drop the rest (no duplicate detection per cycle)
  // 5. for survivors, refineVertex on the RAW v around i for time+value; keep rawValue for provenance
  // 6. sorted by index; order preserved
```

### Sensitivity table (centralised; documented as tunable on real hardware)
| sensitivity | `k` half-window | `promFactor` | `minSeparationSamples` |
|---|---|---|---|
| low       | 4 | 4.0 | 9 |
| standard  | 3 | 2.5 | 6 |
| high      | 2 | 1.5 | 4 |

Constant block `SENSITIVITY_PROFILES` in the module; `SEQUENCE_SENSITIVITIES = ["low","standard","high"]`, default `"standard"`.

---

## 3. Bounce analysis

### Reference / resting level — `estimateBounceReference(run, extrema)`
A bounce trace has two families of turning points: **apexes** (decaying, far from
the floor) and **floor contacts** (≈ constant, near the resting level). We do not
assume which is `max`.

1. Split `extrema` by `kind` → `maxes`, `mins` (need ≥ 2 of each; else the
   settled-tail path below).
2. `spread(kind) = mad(values of that kind)`; `contactSide` = the kind with the
   **smaller** spread (constant), `apexSide` = the other.
3. `referenceFromExtrema = median(values of contactSide)`.
4. `settledTail`: the last `TAIL_FRACTION = 0.15` of samples. `tailStd` = its
   std; `referenceFromTail = median(tail)`.
5. **Cross-check:** require `tailStd ≤ TAIL_STABLE_STD` (`0.03 m`, tunable) **and**
   `|referenceFromExtrema − referenceFromTail| ≤ REFERENCE_AGREEMENT` (`0.05 m`,
   tunable). If both hold → `referenceMeters = referenceFromTail`, `orientation`
   from step 2, `ok`.
6. If the extrema split is unavailable but the tail is stable → use
   `referenceFromTail` and infer `orientation` from whether the bulk of the trace
   sits above or below it.
7. Otherwise → **fail**: `"Couldn't find a stable resting level. Let the ball
   settle before stopping."`

### Peaks — `detectBouncePeaks(run, { sensitivity }): BounceDetection`
```ts
interface BouncePeak {
  readonly timeSeconds: number;
  readonly rawPositionMeters: number;
  readonly referenceMeters: number;
  readonly heightMeters: number;      // |refinedApexPosition − referenceMeters|
  readonly prominence: number;
  readonly sampleIndex: number;       // provenance → raw-run mapping
}
type BounceDetection =
  | { ok: true; peaks: readonly BouncePeak[]; referenceMeters: number }
  | { ok: false; reason: string };
```
- Run `detectExtrema`; get reference. Peaks = apex-side extrema, time-ordered.
- `heightMeters` uses the **refined** apex position; height is always `abs(...)`
  so orientation (apex = max or apex = min) does not matter.
- **Fail** if `ok` reference but `< MIN_BOUNCE_PEAKS = 3` apexes:
  `"Not enough clean bounces yet — collect 4–6 and let it settle."`

### Ratio — `sequenceRatio(terms: readonly number[]): RatioResult`  (shared with Pendulum)
```ts
interface RatioResult {
  readonly ratio: number | null;       // median of valid consecutive ratios; null if < 2
  readonly ratios: readonly number[];
  readonly consistent: boolean;         // maxRelDev(ratios, ratio) ≤ RATIO_TOLERANCE
  readonly usableTermCount: number;
}
export const RATIO_TOLERANCE = 0.18;    // provisional — real hardware may tune
```
- `ratios[i] = terms[i+1] / terms[i]` for `terms[i] > RATIO_EPS` (`1e-4`); others skipped.
- `ratio = median(ratios)`; `consistent` when every ratio is within
  `RATIO_TOLERANCE` **relative** of `ratio`.
- Copy shown: `RATIO LOOKS CONSISTENT` / `RATIO VARIES`.

### Formula
When `usableTermCount ≥ 3` and a finite ratio exists:
`aₙ ≈ a₁ · r^(n−1)` with `a₁` and `r` shown at 2 dp (Unicode superscript via a
tiny `sup` helper; CSS only).

---

## 4. Pendulum analysis

### Midline — `estimatePendulumMidline(extrema): number | null`
`(median(max values) + median(min values)) / 2`. Needs ≥ 1 of each; robust — no
single max/min pair. Shown as a dashed line on the raw graph.

### Amplitude mode
- Term per **turning point**, time-ordered: `amplitude = |extremum.valueMeters −
  midline|`. Labelled **TURNING-POINT AMPLITUDE**.
- **Fail** if `< MIN_PENDULUM_EXTREMA = 4` turning points: `"Collect a few more
  complete swings."`
- `sequenceRatio(amplitudes)` → **AMPLITUDE RATIO r ≈ …**; if ratios are poor,
  the status just says `RATIO VARIES` (no forced "geometric" language).

### Period mode — `derivePendulumPeriods(extrema): PeriodResult`
```ts
interface PeriodResult {
  readonly periods: readonly number[];      // full periods, seconds
  readonly source: "maxima" | "minima";
  readonly averageSeconds: number;
  readonly consistent: boolean;             // CV ≤ PERIOD_TOLERANCE
  readonly cv: number;
}
export const PERIOD_TOLERANCE = 0.18;
```
- `periodsMax = diff(maxTimes)`, `periodsMin = diff(minTimes)`.
- **Side-selection rule (deterministic, tested):**
  1. prefer the side with **more** valid periods (`period > 0`);
  2. if the counts tie, prefer the side with the **lower coefficient of
     variation**;
  3. if still tied, prefer `"maxima"`.
- `averageSeconds = mean(chosen periods)`; `consistent = cv ≤ PERIOD_TOLERANCE`.
- **Fail** if the chosen side has `< MIN_FULL_PERIODS = 2` periods (i.e. `< 3`
  like extrema): `"Collect a few more complete swings."`
- Main result **AVERAGE PERIOD T ≈ … s**; status `PERIOD LOOKS CONSISTENT` /
  `PERIOD VARIES`. No arithmetic-sequence formula — the point is approximate
  constancy.

---

## 5. `SequenceRange` — lightweight non-destructive term cleanup

```ts
interface SequenceRange { readonly start: number; readonly end: number }  // 1-based, inclusive
fullRange(count): SequenceRange
clampRange(r, count): SequenceRange       // 1 ≤ start ≤ end ≤ count; empty run → {1,0}
withStart(r, count, n) / withEnd(r, count, n)
includedIndices(r): the 1-based n's kept
applyRange<T>(events: readonly T[], r): { included: T[]; excluded: T[] }   // excluded keeps order + original n
```
Purpose: drop a poor first/last detected event only. **Excluded events stay
visible, muted, never deleted.** No general `SequenceAnalysisRange` UI.

---

## 6. `src/model/sequence-workspace.ts` (pure)

```ts
type SequenceMode = "bounce" | "pendulum";
type PendulumMeasure = "amplitude" | "period";
type Sensitivity = "low" | "standard" | "high";

interface SequenceTerm {
  readonly n: number;              // 1-based index (of the FULL detected series)
  readonly value: number;          // height / amplitude / period
  readonly timeSeconds: number;    // provenance: the event's time on the raw run
  readonly rawPositionMeters: number;
  readonly included: boolean;      // false when the term-range excludes it
}

interface SequenceAnalysis {
  readonly ok: boolean;
  readonly reason?: string;                       // when !ok
  readonly rawMarkers: readonly RawMarker[];      // {timeSeconds, positionMeters, kind, included}
  readonly referenceMeters: number | null;        // bounce reference / pendulum midline
  readonly terms: readonly SequenceTerm[];
  readonly yLabel: string;                         // "Bounce height (m)" | "Amplitude (m)" | "Period (s)"
  readonly headline: { readonly label: string; readonly value: string };  // "COMMON RATIO" / "r ≈ 0.72"
  readonly status: string | null;                 // "RATIO LOOKS CONSISTENT" | "PERIOD VARIES" | …
  readonly formula: string | null;                // "aₙ ≈ a₁ r^(n−1)" | null
}

interface SequenceWorkspace {
  readonly run: MotionRun;
  readonly mode: SequenceMode;
  readonly pendulumMeasure: PendulumMeasure;
  readonly sensitivity: Sensitivity;
  readonly range: SequenceRange;      // over the current mode's full detected series
  readonly analysis: SequenceAnalysis;
}

startSequenceWorkspace(run): SequenceWorkspace              // bounce, amplitude, standard, full range
setMode(ws, mode)             // → range reset to full (event set changes)
setPendulumMeasure(ws, m)     // → range reset to full
setSensitivity(ws, s)         // → range reset to full (event count changes)
setRange(ws, start, end) / useAllRange(ws)
withSequenceRun(ws, run)      // new run → full reset
```
Every transition recomputes `analysis` from the pure detectors. Any change that
alters the detected event set resets the term range to full (least-surprising).

---

## 7. Chart — minimal extension of `src/ui/chart/time-series-chart.ts`

- `markers` items gain optional `muted?: boolean` → `.marker--muted` (lower
  opacity, smaller). Backward compatible (Snapshot/Speed unaffected).
- New `markersAlt?: readonly { t; x; muted? }[]` → `.marker--alt` (a second
  visually distinct set). Pendulum raw graph: `markers` = maxima, `markersAlt` =
  minima.
- Reference / midline line: **reuse `target`** with two points
  `{ t: [t0, tN], x: [ref, ref] }` (already dashed, already clipped).
- The discrete **sequence graph** is a second `mountChart` instance:
  `xDomain: [0.5, count+0.5]`, integer x, `markerRadius` large, an optional subtle
  `series` guide line through the included terms; excluded terms rendered
  `muted`. `xLabel: "n"`.

No other chart change.

---

## 8. UI — `src/ui/sequence/sequence-lab-view.ts` + minimal deck

Carries the Speed Lab control philosophy: **graphs permanent, controls
contextual, minimal chrome.**

```
SEQUENCE LAB                                   COMMON RATIO
subtitle                                          r ≈ 0.72
                                             RATIO LOOKS CONSISTENT

MODE [ Bounce ] [ Pendulum ]   (Pendulum: AMPLITUDE | PERIOD)   SENS [ Low ][ Standard ][ High ]   BOUNCES 1–6 ▸

┌── RAW MOTION ─────────────┐   ┌── BOUNCE HEIGHT SEQUENCE ──┐
│ dense trace + markers +   │   │  ●        n vs height       │
│ dashed reference line     │   │     ●   ●                   │
└───────────────────────────┘   └────────────────────────────┘   (stacked at ≤ ~1100px)
```

- **Always visible:** `MODE [ Bounce ] [ Pendulum ]` segmented control.
- **Contextual:** Pendulum adds `AMPLITUDE | PERIOD`; both modes show
  `SENSITIVITY [ Low ][ Standard ][ High ]` and the folded term-range readout
  (`BOUNCES 1–6 ▸` / `TERMS 1–8 ▸`) → opens `Start [−] n [+]` / `End [−] n [+]` /
  `Use all` (Use all only when the range is trimmed), exactly like Speed Lab's
  interval editor.
- **Results hierarchy:** the `headline` (COMMON RATIO / AMPLITUDE RATIO / AVERAGE
  PERIOD) is large top-right; `status` smaller under it; `formula` smallest.
  Failure → the `reason` replaces the headline; graphs + mode/sensitivity stay
  usable so the teacher can retry.
- **Dual-graph layout:** CSS grid — side-by-side `1fr 1fr` above `~1100px`,
  stacked below. The raw graph keeps a real minimum height (`min-height: 300px`);
  prefer stacking over shrinking it.
- Deck styling reuses `.speed-deck*` tokens/patterns (rename-free: a shared
  `.deck` set, or Sequence-scoped `.seq-deck*` mirroring them).

Collecting state: title + "Collecting… the sequence appears when you press Stop."
+ a live dense raw trace.

---

## 9. Routing / Home / Runs / app

- `router.ts`: `Route` gains `"sequence"`; `#/sequence` in `HASH_TO_ROUTE`;
  `ROUTE_TO_HASH.sequence`; `#/sequence/<id>` param branch (like `#/speed/`);
  `navigate` builds `#/sequence/<id>` (extend the run/snapshot/speed guard).
- `home-view.ts`: Sequence Lab tile → `route: "sequence"`, note
  `"Bounce & pendulum → a sequence"`. **Six active tiles, no "Coming next".**
- `app.ts`: `case "sequence"` → `mountSequenceLabView({ controller, runStore,
  navigate, runId? })`; add `"sequence"` to the nav-away stop set.
- `run-detail-view.ts`: `[ Open in Sequence Lab ]` → `navigate("sequence",
  stored.id)`.
- `tests/app/router.test.ts` unknown-hash case already uses `#/totally-unknown`.

---

## 10. Tests

- `tests/model/cycle-analysis.test.ts` — every primitive (movingAverage / median
  / mad / estimateNoise / diff / CV); `findLocalExtrema` (plateaus, ends);
  `computeProminence`; `refineVertex` (exact parabola); `detectExtrema` for clean
  / noisy / irregular-timestamp sinusoids; min-separation dedup; sensitivity
  Low/Standard/High changes the count monotonically.
- `tests/model/bounce-analysis.test.ts` — clean geometric decay (r recovered ±);
  noisy decay; **reversed orientation** (apex = min); stable tail; unstable tail →
  fail; `< 3` peaks → fail; duplicate/noise wiggles rejected; `sequenceRatio`
  median + consistency; term-range mute (raw run unchanged).
- `tests/model/pendulum-analysis.test.ts` — clean / damped / noisy sinusoid;
  irregular timestamps; offset midline recovered; maxima+minima counts; amplitude
  sequence; period sequence; **side-selection rule** (more valid wins; tie → lower
  CV; tie → maxima); `< 4` extrema / `< 2` periods → fail; sensitivity rerun;
  term-range; raw run unchanged.
- `tests/model/sequence-range.test.ts` — clamp, withStart/withEnd, applyRange
  (included/excluded, order, original n), empty.
- `tests/model/sequence-workspace.test.ts` — start defaults; setMode/measure/
  sensitivity reset the range + recompute; setRange; withSequenceRun; run never
  mutated; failure → analysis.ok false with reason, graphs data still present.
- `tests/ui/sequence-lab-view.test.ts` (jsdom) — Bounce default; Pendulum switch
  reveals AMPLITUDE|PERIOD; sensitivity buttons rerun (marker count changes);
  raw graph has trace + markers + reference line; sequence graph has `n` axis +
  discrete markers; term-range readout collapsed, expands to steppers, Use all
  contextual; headline + status render; failure copy for a too-short run;
  saved-run route renders with null controller run and never writes; empty state
  → Connect / Open saved runs; teardown clears + unsubscribes.
- `tests/ui/home-view.test.ts` — 6 active tiles, no disabled, Sequence navigates.
- `tests/app/app.test.ts` — `#/sequence` + `#/sequence/<id>` mount with the
  shared controller.
- `tests/ui/run-detail-view.test.ts` — "Open in Sequence Lab" navigates.
- `tests/ui/time-series-chart*.test.ts` — `muted` markers + `markersAlt` render;
  existing marker tests unaffected.
- `tests/architecture.test.ts` — `cycle-analysis` / `sequence-*` on the pure
  list; `src/ui/sequence/**` free of `navigator.hid` / `sendReport` / IndexedDB.
- `tests/portable/artifact.test.mjs` — bundle contains `Sequence Lab` /
  `RAW MOTION` / `COMMON RATIO`; still one file; no mathjax/katex.

None of these validate real hardware — the design says so explicitly.

---

## 11. Self-review

Coverage of the prompt: modes only Bounce+Pendulum (§1, §7, §18); retrospective
after Stop (§4); pure detector core (§2, §6); reference-level method + cross-check
+ honest failure (§3, §10); orientation-agnostic height via `abs` (§3, §9);
robust prominence / min-separation / dedup (§2); sensitivity Low/Standard/High
reruns on the same run (§2, §6); bounce raw graph (trace + markers + dashed
reference) and discrete `n`-vs-height graph (§7, §13, §14); median common ratio +
`RATIO_TOLERANCE = 0.18` documented tunable + consistency copy (§3, §15);
`aₙ ≈ a₁ r^(n−1)` CSS/Unicode only (§3, §16); lightweight non-destructive term
range, excluded = muted (§5); pendulum extrema + robust midline (§4); amplitude
sequence labelled TURNING-POINT AMPLITUDE (§4); period sequence with the tested
deterministic side-selection rule (§4, §22); AVERAGE PERIOD + consistency (§4);
pendulum failure minimums documented (§4); saved-run `#/sequence/<id>` + Runs
hand-off, no mutation, no persistence (§1, §9); Home six active, no "Coming next"
(§9); minimal contextual deck (§8); dual-graph responsive, raw graph never tiny
(§7); themes incl. Kusama opaque plots (reuse existing tokens); portability — all
analysis bundled TS (locked); full test matrix (§10). One `SequenceAnalysis`
shape, one workspace, one detector core, router param threaded once. No
placeholder maths, no fabricated results.
