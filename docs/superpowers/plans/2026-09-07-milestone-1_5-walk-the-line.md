# Milestone 1.5 — Walk the Line — Plan

**Date:** 2026-09-07 · **Design:** approved by the human (this prompt).
Built on the working Milestone 1 architecture. TDD throughout. 163 M1 tests stay green.

## What it is

A visual graph-match instrument: a fixed **target** position-vs-time graph with
the student's **real sensor trace** drawn live on top, in the same coordinate
system. **No scoring** — no %, RMSE, stars, grades, pass/fail, rewards,
leaderboards. The question is just "can you make your motion match this graph?".

## Out of scope

Snapshot Lab, scoring of any kind, curriculum/lesson progression, persistence /
IndexedDB, a second graph implementation, a modal framework.

## Tasks (each: test first → implement → `npm test`/`tsc` green → commit)

### T1 — `model/walk-target.ts` — data-driven target catalog
- `WalkTarget { id, title, prompt?, durationSeconds, positionRange:[lo,hi], points: TargetPoint[] }`,
  `TargetPoint { timeSeconds, positionMeters }`.
- 8 canonical targets (data only, no rendering logic):
  Stand Still · Walk Away · Walk Toward · Positive Constant Rate ·
  Negative Constant Rate · Stop → Move · Stop → Move → Stop · Away → Pause → Toward.
- `WALK_TARGETS` array; `nextIndex`/`prevIndex` (wrap); `targetById`.
- Tests: ids unique; times strictly monotonic per target; durations > 0;
  positions finite; every point ≥ `SAFE_MIN_METERS` (0.4) and ≤ 4.0; first point
  ≥ 0.5 (no start in the near zone); the 8 titles present; wrap navigation.

### T2 — extend `ui/chart/time-series-chart.ts`
- Add `target?: { t: readonly number[]; x: readonly number[] }` to `ChartInput`,
  rendered as `<path class="target">` with the **same scales** as the student
  trace, drawn **before** the trace (student on top).
- Add a `<clipPath>` on the plot rect (unique id per chart instance); wrap
  target + trace + markers in a clipped `<g>` so an out-of-range student trace
  clips at the graph edge instead of painting over axes.
- Explicit `[lo,hi]` domains already supported → Walk passes fixed axes; **no new
  auto-scale path**. Existing `series` / `overlays` / `selection` / `markers`
  unchanged.
- CSS: `.target` = `--ink-dim`, width 3, `stroke-dasharray: 9 7`; `.trace` bumped
  to width 2.5 + `--trace`. Distinct by **weight + dash + colour** (projector /
  a11y).
- Tests: `target` path rendered separately from `.trace`; fixed domains honoured
  (a big student excursion does **not** move the target — assert tick labels
  stable); clip group present.

### T3 — `model/walk-target.ts` preview helper
- `targetPreviewPathD(target, w, h, pad)` using the chart's exported
  `makeScale` + `buildPathD` — a pure `d` string for a thumbnail. No axes.
- Tests: endpoints map to the padded box corners; monotonic.

### T4 — `ui/walk/target-picker.ts`
- Compact inline panel: a grid of 8 buttons, each a mini SVG (`targetPreviewPathD`)
  + title. `mountTargetPicker(host, { current, onPick, onClose })`. Toggle by the
  view. Not a modal framework — one absolutely-positioned `<div>`.
- Tests: 8 previews; clicking one calls `onPick(id)` + `onClose`; `onClose` on
  backdrop / Esc.

### T5 — `ui/walk/walk-the-line-view.ts`
- Title "Walk the Line", instruction "Match the target graph with your motion.",
  a secondary "Move toward or away from the sensor to trace the shape.",
  current target title, the chart (target + live student), and
  `[ Previous ] [ Change Target ] [ Next ]`. `RUN AGAIN` appears after a
  completed run.
- Student trace: `controller.subscribeSample` → append (acquisition-relative t,
  no rewrite) → rAF-coalesced redraw (reuse `createFrameScheduler`).
- Entering `MEASURING` clears the student trace; `subscribeRunComplete` freezes
  it. **Run Again** clears the student trace only (target + sensor untouched).
- Prev/Next/Change **disabled while `MEASURING`**; re-enabled after Stop.
  Changing target clears the student trace, keeps the sensor.
- Target index persists across navigation via a module-level `lastTargetIndex`
  (target preservation is mandatory; completed-trace preservation is optional and
  skipped — no new state architecture).
- No acquisition bar here — the shell's is global. Walk imports **no** HID.
- Tests: fresh = target shown, no student trace; Start → samples append; Stop →
  frozen (both lines); Run Again clears student only, target retained; nav
  blocked while measuring; target change after a run clears student + keeps
  sensor; remount keeps the target.

### T6 — wiring: `router.ts` + `home-view.ts` + `app.ts`
- `Route` gains `"walk"` (`#/walk`).
- Home → 6 tiles, 3×2 grid at projector widths: Live Lab, Data Display, Walk the
  Line (active); Snapshot, Speed, Sequence (disabled "Coming next").
- `app.ts`: `#/walk` → `mountWalkTheLineView({ controller })`; extend the
  nav-away `stopForNavigation()` guard to include `"walk"`.
- Tests: 6 tiles / 3 active / 3 disabled; `#/walk` mounts the view; one
  controller across Home↔Walk; `stopForNavigation` on leaving Walk mid-run.

### T7 — architecture guard + docs + projector audit
- The existing `tests/architecture.test.ts` already covers `src/ui/walk/`.
- `docs/research/milestone-1_5-projector-audit.md` — manual checklist (5 widths ×
  Home-6 / Walk fresh / ready / collecting / stopped / picker / Run Again /
  resize).
- README + `docs/research/milestone-1-ready.md` pointer: Walk the Line = visual
  graph-match, no scoring, 8 canonical targets, live overlay intentional.

### T8 — verify + deploy
`npm ci` · `npm test -- --run` · `npx tsc --noEmit` · `npm run build` · preview
smoke (`?fake` → Walk the Line, pick targets, Start shows overlay) · push `main`
· watch Pages · verify the live URL.

### T9 — readiness report
`docs/research/walk-the-line-ready.md` + the final chat report.
