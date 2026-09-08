# Milestone 4 — Speed Lab — projector / responsive audit

Manual (jsdom has no layout). Chrome/Edge, `?fake`. Resize / DevTools device toolbar.

## Widths
1024×768 · 1280×720 · 1366×768 · 1440×900 · 1920×1080

## Sources / entry
- **`#/speed`, no run, sensor present** — "NO RUN TO MEASURE" + Connect sensor / Open saved runs
- **`#/speed`, no run, no sensor** (`?fake` off, unsupported) — same panel, Open saved runs is the path
- **direct collection** — collect in Speed Lab, press Stop → result appears (never a live speed)
- **current run** — the latest completed `MotionRun`
- **`#/speed/<runId>`** — a saved run, sensor unplugged (Runs → Open in Speed Lab)

## States
- **Collecting…** placeholder (live trace, no result)
- **result — away / toward / stationary**
- **result — under / at / over** the limit, for each preset **2 / 5 / 10 mph** (5 default)
- **interval edited** — drag band, drag either handle, Start/End steppers, Use all
- **short / degenerate interval** — refusal copy, presets still usable, no NaN
- **"How was this speed calculated?"** overlay — with and without the two-point section
  (endpoint slope null when the interval is ~0), OLS section always present
- **resize narrow→wide** mid-workspace

## Checks (every state × every width)
- [ ] **YOUR SPEED** in mph is the largest text, readable from the back of the room
- [ ] direction is a **word** ("Away from the sensor"), never a minus sign on a speed
- [ ] the speed-limit line reads plainly ("0.4 mph under the 5 mph limit")
- [ ] `Velocity: +2.06 m/s` is present but subordinate; sign shown for velocity only
- [ ] the provenance line (`best-fit r² = … · N samples over … s`) is smallest, honest
- [ ] the **best-fit line is drawn only across the selected interval**, on top of the
      full measured trace; the shaded `AnalysisWindow` band is obvious
- [ ] editing the interval **immediately** updates the headline number
- [ ] speed-limit presets show which one is active (`aria-pressed` + emphasis)
- [ ] the overlay's two-point line substitutes the **real** endpoint values and the
      OLS section says Motion World uses the best-fit slope of every sample
- [ ] the overlay never crops; Esc and backdrop close it
- [ ] **no NaN / Infinity / "-0"** anywhere, in any state
- [ ] no horizontal page overflow; nothing clipped
- [ ] a **saved run** opens and computes with the sensor unplugged
- [ ] a live collection shows only "Collecting…" until Stop, then the classroom result

## Honesty checks
- [ ] the number on screen is the **OLS slope of all samples in the interval**, not
      `(last − first) / Δt` — confirmed by a run with a mid-interval outlier
- [ ] `mph = |m| × 2.2369362920544` — one centralized constant (`MPH_PER_MPS`)
- [ ] positive slope ⇒ away from sensor; near-zero (|m| < 0.05 m/s) ⇒ stationary
- [ ] no score, no stars, no pass/fail

## Result log
| date | browser | widths ok | issues |
|---|---|---|---|
| _pending first run_ | | | |
