# Speed Lab (Milestone 4) — readiness report

**Date:** 2026-09-07 · **Status: shipped to `main`, deployed, live.**
Commit range `695db97..d885bb7`. Live:
<https://ronniegarzatx.github.io/MotionWorldWeb/#/speed>

## What shipped

**Part A — Snapshot precision polish (`695db97`).** The Classroom Snapshot graph
draws its large markers from the precise/unrounded representative points
(`fitPoints`), so every marker sits exactly on the dense motion trace. The POINTS
drawer still shows the rounded classroom coordinates (nearest 0.5) and gained a
caption; the legend gained a one-line note. The classroom transform, `fitPoints`,
`points`, model fitting, and the raw `MotionRun` are unchanged.

**Part B — Speed Lab (Milestone 4).** A new classroom tool: select a section of
position-vs-time motion → an honest speed / velocity calculation.

### Model (pure, DOM-free, on the architecture pure-list)
- `src/model/rate-analysis.ts` — `analyzeRate(run, window)` fits `y = m·t + b` by
  **ordinary least squares over every sample in the `AnalysisWindow`** (sums
  shifted to the first timestamp for float conditioning). Returns signed slope,
  intercept, honest clamped r², `speedMetersPerSecond = |m|`,
  `speedMilesPerHour = |m| × MPH_PER_MPS`, a `MotionDirection`
  (`away` / `toward` / `stationary`, threshold `STATIONARY_SPEED_MPS = 0.05`),
  and `sampleCount`. `MPH_PER_MPS = 2.2369362920544` — one centralized, tested
  constant. Refuses with plain copy (never NaN/Infinity/−0) for <2 samples, zero
  duration, or equal/non-finite timestamps.
- `src/model/speed-limit.ts` — presets `[2, 5, 10]` mph, default 5;
  `compareToSpeedLimit` with an `at` tolerance and an unsigned margin.
  Judgement-free.
- `src/model/endpoint-slope.ts` — the two-point Δposition ÷ Δtime slope using
  `positionAt(run, window.start/end)`. Teaching-overlay only.
- `src/model/speed-workspace.ts` — session-only state over one run; every window
  or limit change re-derives analysis + comparison + endpoint. Run never mutated.

### UI
- `src/ui/speed/speed-lab-view.ts` — orchestrator. Position-vs-time chart with an
  always-editable `AnalysisWindow` band + Use-all / Start-End steppers; the OLS
  best-fit line drawn **only** across the selected interval. Result panel: **YOUR
  SPEED** (mph, large), direction word, speed-limit line, `Velocity:` (signed
  m/s), `best-fit r² · N samples over … s` provenance. Speed-limit presets
  (5 default, `aria-pressed`). Sources: current run, saved run
  (`#/speed/<runId>`, offline), or a fresh collection — the classroom result is
  computed **after Stop**, never live ("Collecting…" placeholder while measuring).
  Empty state: Connect sensor / Open saved runs.
- `src/ui/speed/speed-explainer-overlay.ts` — "How was this speed calculated?"
  projector overlay reusing the `.show-large` shell. Two-point Δ idea with the
  **real** endpoint values substituted + a Δ definition; the honest "Motion World
  uses the best-fit slope of every sample" OLS section (m, b, r², count);
  slope → speed → mph → direction. Esc / backdrop close.
- Chart `functionOverlay` now supports internal/trailing gaps (a `NaN` starts a
  fresh subpath instead of blanking the whole curve) — needed to confine the
  best-fit line to the selection while `xDomain` still shows the full trace.

### Wiring
- `#/speed` and `#/speed/<runId>` routes; Speed Lab is the **5th active** Home
  tile (Sequence Lab still "Coming next"); `app.ts` mounts it with the shared
  `AcquisitionController` and adds `"speed"` to the nav-away stop set; Runs detail
  gains **Open in Speed Lab**.

## Verification

- `npm ci` · `npm test -- --run` — **429 tests, all green** (59 files). New:
  `rate-analysis` (13), `speed-limit` (5), `endpoint-slope` (3),
  `speed-workspace` (7), `speed-lab-view` (8), `speed-explainer-overlay` (4),
  plus updated router / home / app / run-detail / portable / architecture cases.
- `npx tsc --noEmit` — clean (strict).
- `npm run build` — clean (`dist/`, 91.9 kB JS).
- `npm run build:portable` — clean, **one file** `dist-portable/MotionWorld.html`
  (106.5 kB), no external assets / CDN / fonts / network; Speed Lab + the
  calculation overlay bundled; asserted by `tests/portable/artifact.test.mjs`.
- `npm audit` — 0 vulnerabilities. `git diff --check` — clean.
- CI (`deploy-pages.yml`) green; deployed; live URL returns 200 and the bundle
  contains `Speed Lab` / `YOUR SPEED` / `2.2369362920544`.

## The honesty contract (as built)

- The headline number is the **OLS best-fit slope of all samples in the
  interval**, not `(last − first) ÷ Δt`. Proven by a test with a mid-interval
  outlier: the OLS slope moves off both the true line and the endpoint slope.
- The two-point endpoint slope appears **only** in the teaching overlay, labelled
  as the idea, next to the note that Motion World uses the best-fit slope.
- Speed is never negative; velocity carries the sign; direction is a word.
- No score, no stars, no pass/fail.

## Not done / next (do NOT start without a prompt)

- Human physical acceptance on the Windows PC + real sensor (M1–M4): collect in
  Speed Lab → Stop → result; change interval; presets; "How was this
  calculated?"; Open a saved run in Speed Lab offline; the portable file.
- Projector/responsive pass — `docs/research/milestone-4-projector-audit.md`.
- **Sequence Lab — not started.**
