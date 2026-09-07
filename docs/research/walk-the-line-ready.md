# MOTION WORLD WEB — WALK THE LINE READY (Milestone 1.5)

A focused module on the working Milestone 1 architecture: a **visual graph-match**
instrument. Fixed target position-vs-time graph + the student's **real sensor
trace** drawn live on top, same coordinate system. **No scoring.** Software
green and deployed; physical acceptance below is the next gate.

## HOME — six-tool layout

Balanced **3 × 2** grid at projector widths (2-up < 900 px, 1-up < 560 px).

| tile | state |
|---|---|
| Live Lab | active |
| Data Display | active |
| **Walk the Line** | **active** |
| Snapshot Lab | disabled — "Coming next" |
| Speed Lab | disabled — "Coming next" |
| Sequence Lab | disabled — "Coming next" |

No roadmap row, no Activity Library, no Standards.

## TARGETS — 8 canonical walks (`src/model/walk-target.ts`, data-driven)

| # | id | title | duration | y-range (m) | shape |
|---|---|---|---|---|---|
| 1 | `stand-still` | Stand Still | 6 s | 0.5–2.5 | flat at 1.5 |
| 2 | `walk-away` | Walk Away | 6 s | 0.5–3.5 | 1.0 → 3.0 |
| 3 | `walk-toward` | Walk Toward | 6 s | 0.5–3.5 | 3.0 → 1.0 |
| 4 | `positive-constant-rate` | Positive Constant Rate | 5 s | 0.5–3.5 | 1.0 → 3.5 (0.5 m/s) |
| 5 | `negative-constant-rate` | Negative Constant Rate | 5 s | 0.5–3.5 | 3.5 → 1.0 (0.5 m/s) |
| 6 | `stop-then-move` | Stop → Move | 7 s | 0.5–3.5 | hold 1.0 (3 s), then → 3.0 |
| 7 | `stop-move-stop` | Stop → Move → Stop | 8 s | 0.5–3.5 | hold 1.0, → 3.0, hold 3.0 |
| 8 | `away-pause-toward` | Away → Pause → Toward | 8 s | 0.5–3.5 | 1.0 → 3.0, hold, → 1.0 |

All durations 5–8 s, all positions 0.5–3.5 m, **no target starts inside the
sensor's unreliable near zone** (first point ≥ 0.5 m; every point ≥ 0.4 m).
Piecewise-linear — idealized classroom graphs, sharp vertices allowed. Each
target carries a stable `id`, `title`, `prompt`, `durationSeconds`,
`positionRange`, and `points`. **No rendering logic in the data.**

## GRAPH — target/student architecture, fixed axes

- **One chart implementation**, extended: `src/ui/chart/time-series-chart.ts`
  gained `ChartInput.target { t, x }` — a reference curve drawn in the **same
  scales** as the student `series`, **behind** it, styled distinctly by
  **stroke weight + dash + colour** (not colour alone): target = `--ink-dim`,
  3 px, `dasharray 9 7`; student "You" trace = `--trace` green, 2.5 px solid.
  An on-screen **"Target / You" legend**.
- **Fixed axes:** Walk the Line passes explicit `xDomain: [0, durationSeconds]`
  and `yDomain: positionRange`. The chart already supports explicit `[lo,hi]`
  domains, so **no new auto-scale path** — the target defines the challenge
  coordinate system and does **not** move while the student walks.
- **Plot clipping:** a per-instance `<clipPath>` on the plot rect — a student
  trace that leaves the target's y-range **clips at the graph edge** instead of
  painting over the axes or rescaling the target away.
- Live Lab's chart usage is unchanged (regression-tested).

## CONTROLS

- **Target navigation:** `[ Previous ] [ Change Target ] [ Next ]`. Previous/Next
  **wrap** through the canonical sequence. **Change Target** opens a compact
  inline picker — 8 miniature target previews (reusing the chart's `makeScale` /
  `buildPathD` geometry) + titles, current one outlined; Esc / backdrop closes.
  All three are **disabled while `MEASURING`** and re-enabled after Stop.
  Changing target clears the student trace and keeps the sensor connected/armed.
- **Shared acquisition:** the Milestone 1 acquisition bar in the shell header —
  System Ready → Sensor Ready → Collecting; on-screen Start/Stop; the physical
  blue trigger flows through the same `AcquisitionController`. **Walk the Line
  imports no HID / WebHID / trigger-polling code** (enforced by
  `tests/architecture.test.ts`).
- **Run Again** appears after a completed run → clears the **student trace only**,
  retains the target, does not touch the sensor (stays `SENSOR_READY`), no new
  USB session.
- **Navigation away mid-run** → `controller.stopForNavigation()` freezes the
  partial run; returning preserves the **target** (module-scoped index);
  a completed trace is intentionally not preserved (optional for M1.5).
- Live student trace = the authoritative `AcquisitionController` sample stream,
  acquisition-relative `t` (no rewrite), redraw coalesced to one animation frame
  (same as Live Lab; `requestAnimationFrame` bound to `globalThis`).

## COPY

"Walk the Line" · "Match the target graph with your motion. Move toward or away
from the sensor to trace the shape." · plus each target's one-line prompt. No
paragraphs of pedagogy.

## TESTING

- **192 tests, 31 files — all green** (163 at M1 end → **+29**). `tsc --noEmit`
  clean. `vite build` clean — **47.6 kB JS / 15.4 kB gzip**, 9.4 kB CSS.
  `npm audit`: 0 vulnerabilities. `npm ci` reproducible.
- New: target catalog (ids unique, times strictly monotonic, durations positive,
  positions finite + safe range + no near-zone start, the 8 titles, wrap nav);
  chart target overlay (separate path, target behind student, **fixed axes hold
  when the student walks out of range**, clip group); `targetPreviewPathD`;
  target picker (8 previews, pick+close, Esc/backdrop, teardown); the Walk the
  Line view (fresh / Start appends / Stop freezes both / Run Again clears student
  only / new run clears / nav blocked while measuring / picker swaps + clears +
  keeps sensor / target persists across remount / no acquisition restart / live
  restore on remount); Home 6 tiles (3 active / 3 disabled); `#/walk` routing +
  shared controller + `stopForNavigation` on leave.
- **No scoring anywhere** — no %, RMSE, stars, grades, pass/fail, rewards,
  leaderboards. `grep` the tree: none.
- Works in **`?fake`** (synthetic 25 Hz stream drives the overlay); targets are
  not tuned to flatter fake data.
- No test claims physical-hardware behaviour.

## PROJECTOR

Manual audit checklist: `docs/research/milestone-1_5-projector-audit.md`
(5 widths × Home-6 / Walk fresh / ready / collecting / stopped / picker /
Run Again / resize). No browser-automation tool in this environment — the visual
pass is the human's; structure + the sensor boundary are guarded in CI.

## GITHUB

- repo `https://github.com/ronniegarzatx/MotionWorldWeb` (public)
- final commit **`8145267`** on `main` (`ed09f6d..8145267`, 8 commits, no force)
- Pages: GitHub Actions → Pages, run `101831863491` **success**
- **live URL: https://ronniegarzatx.github.io/MotionWorldWeb/** — verified 200,
  assets 200, bundle carries Walk the Line, CSP `connect-src 'self'`.

## NEXT PHYSICAL CHECK (Windows PC, Chrome/Edge, the live URL, hard-refresh)

1. Open **Walk the Line** from Home.
2. Pick **Stand Still** (it's the default). Click **Sensor Ready**, then the
   on-screen **Start**.
3. Stand still ~1.5 m from the sensor → confirm the green **"You"** trace draws
   live and overlays the dashed **Target** line. **Stop** → both freeze.
4. **Run Again**, then **Change Target → Walk Away**; Start and walk steadily
   away → the trace should climb along the target. Repeat with **Walk Toward**.
5. Try one piecewise target — **Stop → Move → Stop** — stand still, walk away,
   stand still.
6. Test the **physical blue button**: at "Sensor Ready" press it → confirm it
   starts collecting; press again → stops. (Blue-button START is the one path
   still unverified on hardware.)
7. Report whether the **target and student lines are easy to tell apart on the
   projector** (dash vs solid, weight, colour) at your resolution.

**Do not begin Snapshot Lab.** Milestone 2 (AnalysisWindow + IndexedDB run store
+ Runs panel) is next, after this and the M1 acceptance.
