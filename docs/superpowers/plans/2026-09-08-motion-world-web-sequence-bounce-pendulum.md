# Milestone 5 — Sequence Lab (Bounce + Pendulum) — Plan

**Design:** `docs/superpowers/specs/2026-09-08-motion-world-web-sequence-bounce-pendulum-design.md`
Baseline HEAD `1f7f0e6`, **471 tests green**, portable 116 kB, 0 vulns. TDD every
task; each ends `npm test -- --run && npx tsc --noEmit` green + a focused commit.
Both builds stay green throughout.

Not building: everything in the design's "Explicitly NOT built" list. No Sequence
persistence. Do not touch native `GoIO_SDK` / MotionLab.

---

## T1 — `model/cycle-analysis.ts` primitives
- **Tests first:** `movingAverage` (centred, edge-clamp, halfWindow 0 = identity);
  `median` (odd/even/single); `mad` (known set, scale 1.4826); `estimateNoise`
  (flat → ~0; white noise → ≈ σ; robust to a spike); `diff`;
  `coefficientOfVariation` (constant → 0, mean≈0 → 0, known set).
- **Commit:** `feat(model): cycle-analysis numeric primitives`.

## T2 — `model/cycle-analysis.ts` extrema
- **Tests first:** `findLocalExtrema` — pure sine indices; plateau (keep one);
  monotone → none; ends never extrema. `computeProminence` — isolated peak = its
  height above the surrounding cols; a tiny wiggle on a slope → small.
  `refineVertex` — exact parabola `y=(x−2.3)²` → deltaIndex ≈ 0.3.
  `detectExtrema` — clean sine (right count, alternating kind); + white noise
  (same count within tolerance); irregular timestamps (times read from samples);
  min-separation removes a close lower twin; Low/Standard/High monotonic in count.
- **Commit:** `feat(model): cycle-analysis extrema + prominence + vertex refine`.

## T3 — `model/bounce-analysis.ts`
- **Tests first:** synthetic decaying-bounce generator (apex = max). `estimateBounceReference`
  — clean → reference ≈ floor, orientation "up"; **reversed** (apex = min) →
  reference ≈ ceiling, orientation "down"; unstable tail → `{ok:false}`.
  `detectBouncePeaks` — clean geometric (heights ≈ `h₁ r^(n−1)`, r recovered
  within RATIO_TOLERANCE); noisy; reversed orientation gives the same heights
  (abs); `< 3` peaks → fail; noise wiggles rejected; each peak carries
  `sampleIndex` provenance; **raw run frozen + deep-equal**. `sequenceRatio` —
  median of consecutive; skips near-zero denominators; `consistent` true for
  clean geometric, false for a jittered series; `RATIO_TOLERANCE === 0.18`.
- **Commit:** `feat(model): bounce detector — reference, peaks, common ratio`.

## T4 — `model/pendulum-analysis.ts`
- **Tests first:** damped-sinusoid generator with an offset midline.
  `estimatePendulumMidline` — recovers the offset within noise; needs ≥1 max &
  ≥1 min. Amplitude sequence — one term per turning point, `|value − midline|`,
  time-ordered, decaying. `derivePendulumPeriods` — clean → periods ≈ true `T`,
  `source` per the rule; **side-selection**: more-valid wins; equal counts →
  lower-CV side; total tie → "maxima"; each asserted with a crafted input.
  `averageSeconds` = mean; `consistent` via CV ≤ `PERIOD_TOLERANCE (0.18)`.
  Failures: `< 4` extrema (amplitude) / `< 2` full periods (period) → honest
  reason. Irregular timestamps; noisy; sensitivity rerun; **raw run unchanged**.
- **Commit:** `feat(model): pendulum detector — extrema, midline, amplitude/period`.

## T5 — `model/sequence-range.ts`
- **Tests first:** `fullRange`, `clampRange` (bounds, empty count 0 → {1,0}),
  `withStart`/`withEnd` (can't cross), `applyRange` (included/excluded partition,
  original order + n preserved), `includedIndices`.
- **Commit:** `feat(model): SequenceRange — non-destructive term cleanup`.

## T6 — `model/sequence-workspace.ts`
- **Tests first:** `startSequenceWorkspace` → bounce / amplitude / standard / full
  range / `analysis` computed. `setMode` bounce↔pendulum recomputes + resets
  range; `setPendulumMeasure` amplitude↔period recomputes + resets; `setSensitivity`
  recomputes + resets range; `setRange`/`useAllRange` re-partition terms (analysis
  ratio/status follow); `withSequenceRun` full reset, same id = no-op. Failure
  run → `analysis.ok === false` with `reason`, `terms`/`rawMarkers` still present
  for the graphs. Raw run never mutated across all transitions.
- **Commit:** `feat(model): pure SequenceWorkspace`.

## T7 — chart: `muted` markers + `markersAlt`
- **Tests first:** `markers` with `muted:true` → a `.marker--muted`; `markersAlt`
  → `.marker--alt` circles at mapped coords; both honour `markerRadius`; existing
  marker / Snapshot / Speed chart tests unchanged; render order (motion → model →
  markersAlt → markers) keeps primary markers on top.
- **Commit:** `feat(ui): chart muted markers + second marker set`.

## T8 — `ui/sequence/sequence-lab-view.ts` (+ deck, CSS)
- **Tests first (jsdom, FakeSensorAdapter + MemoryRunStore, synthetic runs):**
  - no run → empty head + `[ Connect sensor ]` / `[ Open saved runs ]` navigate.
  - Bounce is the default mode (`MODE` segment, Bounce pressed); a synthetic
    bounce run → RAW MOTION chart with `.trace`, bounce `.marker`s, a dashed
    `.target` reference line; a second **BOUNCE HEIGHT SEQUENCE** chart with
    `xLabel` "n" and discrete markers; headline `COMMON RATIO` + `r ≈`.
  - switch to Pendulum → `AMPLITUDE | PERIOD` appears; PERIOD → sequence chart
    yLabel "Period (s)", headline `AVERAGE PERIOD` `T ≈`.
  - `SENSITIVITY` Low/Standard/High rerun on the same run (raw marker count
    changes; no recollection — `lastCompletedRun` spy call count stable).
  - term-range readout collapsed by default; opens to Start/End steppers; `Use
    all` only when trimmed; excluded terms rendered `.marker--muted`, not removed.
  - a too-short synthetic run → the failure `reason` shown where the headline is;
    mode + sensitivity still clickable.
  - saved-run route (`runId`) renders with `lastCompletedRun()` null; `runStore.save`
    never called; store bytes unchanged.
  - MEASURING on mount → "Collecting…" placeholder; a `subscribeRunComplete`
    emission then renders the analysis.
  - teardown clears host + unsubscribes.
- **Commit:** `feat(ui): Sequence Lab — Bounce + Pendulum dual-graph workspace`.

## T9 — wire it: router + Home + app + Runs
- router `"sequence"` + `#/sequence` + `#/sequence/<id>` + navigate builder.
- `home-view.ts`: Sequence Lab active → **6 active, 0 disabled, no "Coming next"**.
- `app.ts`: `case "sequence"` mount; `"sequence"` in nav-away TOOLS set.
- `run-detail-view.ts`: `[ Open in Sequence Lab ]`.
- **Tests:** `home-view.test.ts` (6 active, order, Sequence navigates, "Sequence
  Lab is disabled" test removed); `router.test.ts` (`#/sequence` + `/<id>`);
  `app.test.ts` (`#/sequence` + `/<id>` mount, shared controller);
  `run-detail-view.test.ts` ("Open in Sequence Lab").
- **Commit:** `feat(app): activate Sequence Lab — routes, Home, Runs hand-off`.

## T10 — architecture guard + portable + docs + audit
- `tests/architecture.test.ts`: `cycle-analysis` / `bounce-analysis` /
  `pendulum-analysis` / `sequence-range` / `sequence-workspace` on the PURE list;
  `src/ui/sequence/**` clean of HID / IndexedDB.
- `tests/portable/artifact.test.mjs`: `Sequence Lab`, `RAW MOTION`,
  `COMMON RATIO`, `AVERAGE PERIOD`; one file; no mathjax/katex.
- `docs/research/milestone-5-projector-audit.md` — the state matrix from §38.
- README: 6 active tools, no "Coming next"; Sequence description (Bounce: real
  bounce heights → discrete sequence → approximate ratio; Pendulum:
  turning-point amplitude or full period → discrete sequence; derived from the
  immutable raw MotionRun).
- **Commit:** `test+docs: M5 guard, portable check, projector audit, README`.

## T11 — verify + deploy + report
`npm ci` · `npm test -- --run` · `npx tsc --noEmit` · `npm run build` ·
`npm run build:portable` · `npm audit` · `git diff --check` — all green, portable
one file. Preview smoke (`?fake`: Home → Sequence, Bounce/Pendulum, sensitivity,
term range, saved-run). Push `main` (no force), watch Pages, verify the live URL.
`docs/research/sequence-lab-ready.md` + the final report + the physical-acceptance
checklist. Update the memory file. **Do not begin another major module.**

---

## Risks / notes
- **Bounce reference is the hard part.** Bias toward the honest failure over a
  fabricated series. The two-signal cross-check (extrema-cluster vs settled tail)
  is the guard; thresholds are centralised constants flagged tunable.
- **Synthetic-vs-real:** keep detector tests principled (recover known params
  within a stated tolerance), never hand-tuned to a fixture. Note in the readiness
  doc that only real-sensor testing validates classroom robustness.
- **jsdom:** no layout — assert on marker counts / classes / axis labels / path
  presence, not pixels. Reuse the Speed Lab deck test patterns (aria-labels,
  `.seq-deck__*` classes, `trimEnd`-style helpers).
- **Chart change is additive** — `muted` optional on markers, `markersAlt` new;
  every existing chart test must stay green.
- Two `mountChart` instances in one view — dispose both on teardown.

## Self-review
Every design section maps to a task: primitives+extrema (T1/T2), bounce (T3),
pendulum incl. side-selection rule (T4), term range (T5), workspace (T6), chart
(T7), full view + deck + dual-graph + failure + saved run + collecting (T8),
routing/Home/Runs (T9), purity + portable + audit + README (T10), verify+deploy
(T11). One detector core, one workspace, one analysis shape. No persistence, no
forbidden modes, raw run immutable throughout, all maths bundled TS.
