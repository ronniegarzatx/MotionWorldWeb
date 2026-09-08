# Sequence Lab (Bounce + Pendulum) — Milestone 5 — readiness report

**Date:** 2026-09-08 · **Status: shipped to `main`, deployed, live.**
Commit range `1f7f0e6..<head>` (design `f66d1b5` batch). Live:
<https://ronniegarzatx.github.io/MotionWorldWeb/#/sequence>

## What shipped

A stripped-down Sequence Lab with exactly two optimised modes — **Bounce** and
**Pendulum** — activating the sixth and final Home tool. Everything is derived
from the immutable raw `MotionRun`, **after Stop**; nothing rewrites raw samples;
derived results are session-only and not persisted.

### Pure model (all DOM-free, on the architecture pure-list)
- **`cycle-analysis.ts`** — numeric primitives (`movingAverage`, `median`, `mad`,
  `estimateNoise` = robust white-noise σ from the second differences, `diff`,
  `coefficientOfVariation`); `findLocalExtrema` (plateau-safe, ends excluded);
  `computeProminence` (bounded topographic prominence, min via negation);
  `refineVertex` (sub-sample parabola vertex); `detectExtrema` — a two-stage
  noise-aware detector (smooth to localise → refine on raw samples) with a
  prominence gate (noise·factor, with a relative floor) and a minimum-separation
  dedup. `SENSITIVITY_PROFILES` (low/standard/high: halfWindow, promFactor,
  minSeparation) — centralised, documented tunable on real hardware.
- **`sequence-ratio.ts`** — `sequenceRatio` = median of consecutive ratios
  (near-zero denominators skipped) + a relative-tolerance "consistent vs varies"
  verdict. `RATIO_TOLERANCE = 0.18`.
- **`bounce-analysis.ts`** — `estimateBounceReference` cross-checks a settled-tail
  estimate (`std ≤ 0.03 m`) against the tight contact-extrema cluster
  (agreement `≤ 0.05 m`) and **refuses** (`"Couldn't find a stable resting
  level…"`) otherwise; orientation-agnostic (apex = max **or** min).
  `detectBouncePeaks` → `BouncePeak[]` with `abs(apex − reference)` heights and
  `sampleIndex` provenance; refuses below `MIN_BOUNCE_PEAKS = 3`.
- **`pendulum-analysis.ts`** — `estimatePendulumMidline` = `(median(highs) +
  median(lows)) / 2`; `detectPendulumExtrema`; `pendulumAmplitudeSequence` (one
  term per turning point, `|value − midline|`, needs `MIN_PENDULUM_EXTREMA = 4`);
  `choosePeriodSide` — **deterministic**: more valid periods wins → tie: lower CV
  → total tie: maxima (every branch tested); `pendulumPeriodSeries` (full periods
  from like extrema, mean + CV-based consistency, `PERIOD_TOLERANCE = 0.18`,
  needs `MIN_FULL_PERIODS = 2`).
- **`sequence-range.ts`** — 1-based inclusive, non-destructive term cleanup
  (`fullRange`/`clampRange`/`withStart`/`withEnd`/`applyRange`). Excluded events
  never deleted.
- **`sequence-workspace.ts`** — one `SequenceAnalysis` shape for all three series
  (bounce height / turning-point amplitude / period). Every transition
  (`setMode`, `setPendulumMeasure`, `setSensitivity`, `setRange*`, `useAllRange`,
  `withSequenceRun`) recomputes from the detectors; any change to the detected
  set resets the term range to full. Failures return a well-formed
  `{ ok: false, reason }` analysis so the view still draws the raw trace.

### UI
- `src/ui/sequence/sequence-lab-view.ts` — a minimal contextual deck (reuses the
  Speed Lab deck patterns): `MODE [Bounce|Pendulum]` always; Pendulum adds
  `[Amplitude|Period]`; `SENS [Low|Standard|High]`; a folded term-range readout
  (`BOUNCES/TERMS/PERIODS n–n ▸`) opening to `Start`/`End` steppers + a
  contextual `Use all`. Two charts side-by-side above ~1100px, stacked below (raw
  trace keeps a real min-height): **RAW MOTION** (dense trace + event markers +
  dashed reference/midline; pendulum minima as a distinct second marker set) and
  the discrete **`n`-vs-value** graph (large points, subtle dashed guide line,
  excluded terms muted). Result block: headline (`COMMON RATIO` / `AMPLITUDE
  RATIO` / `AVERAGE PERIOD`) large, status + `aₙ ≈ a₁·rⁿ⁻¹` formula subordinate;
  a failure reason replaces the headline and the view drops to one raw graph.
  Empty / collecting / saved-run states like Speed Lab.
- Chart: `markers` gained optional `muted` (subdued, smaller); new `markersAlt`
  (a visually distinct second set). Additive — every existing chart test green.

### Wiring
- `#/sequence` + `#/sequence/<runId>` routes; **six active Home tiles, no
  "Coming next"**; shared `AcquisitionController`; `"sequence"` in the nav-away
  stop set; Runs detail gains **Open in Sequence Lab**.

## Verification

- `npm ci` · `npm test -- --run` — **554 tests, all green** (68 files). New:
  `cycle-analysis` (15) + `cycle-analysis-extrema` (13), `bounce-analysis` (13),
  `pendulum-analysis` (13), `sequence-range` (6), `sequence-workspace` (9),
  `sequence-lab-view` (9), plus chart / home / router / app / run-detail /
  portable / architecture updates.
- `npx tsc --noEmit` clean (strict). `npm run build` clean (`dist/`, 115 kB JS).
- `npm run build:portable` clean — **one file** `dist-portable/MotionWorld.html`
  (135.2 kB), no CDN / backend / runtime fetch / remote font / remote JS /
  remote math renderer / downloaded WASM. Asserted by
  `tests/portable/artifact.test.mjs` (Sequence Lab + RAW MOTION + COMMON RATIO +
  AVERAGE PERIOD + TURNING-POINT AMPLITUDE bundled; no scipy/pyodide/mathjax).
- `npm audit` 0 vulnerabilities. `git diff --check` clean.
- CI (`deploy-pages.yml`) green; deployed; live URL 200; bundle contains the
  Sequence Lab strings.

## Not done / next (do NOT start without a prompt)

- **Real-sensor physical acceptance** — the checklist below. These synthetic
  tests do **not** validate classroom robustness; the detector thresholds
  (`SENSITIVITY_PROFILES`, `TAIL_STABLE_STD`, `REFERENCE_AGREEMENT`,
  `RATIO_TOLERANCE`, `PERIOD_TOLERANCE`) are flagged tunable.
- Projector / responsive pass — `docs/research/milestone-5-projector-audit.md`.
- **Do not begin another major module** (no Inverse Lab, no full Pendulum Lab).

## Physical acceptance checklist

**BOUNCE**
1. Hard ball (a bouncy/super ball), 4–6 clean bounces onto a hard floor.
2. Let it come to rest **before** pressing Stop.
3. Confirm the raw-graph markers land on the bounce turning points.
4. Confirm the dashed reference line sits at the physical resting level.
5. Inspect the `n` vs bounce-height sequence — should step down geometrically.
6. Inspect `r` (`COMMON RATIO`) — a hard ball is typically ~0.6–0.8; expect
   `RATIO LOOKS CONSISTENT` on a clean run.
7. Change `PEAK SENSITIVITY` — it must rerun on the same run (no recollection,
   the raw trace unchanged).

**PENDULUM**
1. Collect 5–8 full swings.
2. Confirm maxima and minima markers (visually distinct) on the raw graph.
3. Confirm the midline sits between them.
4. **Amplitude** mode → inspect the damped turning-point-amplitude sequence.
5. **Period** mode → inspect the `T` sequence and `AVERAGE PERIOD`; a short
   pendulum should read `PERIOD LOOKS CONSISTENT`.
6. Change sensitivity → reruns without recollecting.
7. A 1–2 swing run should give the honest "Collect a few more complete swings."
