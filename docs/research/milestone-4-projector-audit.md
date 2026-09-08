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

---

## Next pass — Speed Lab projector polish + theme system

### Speed Lab layout
- [ ] the position-vs-time graph is the **dominant** element (grid `1fr` row,
      `min-height 340px` / `height 60vh`); order stays graph → controls →
      result → speed-limit presets
- [ ] **YOUR SPEED** (uppercase, `--type-h2`) and the mph value
      (`--type-speed`, `clamp(3rem … 6.5rem)`) read from the back of the room
- [ ] direction sits directly below the value at `--type-h1`
- [ ] speed-limit line is `--type-body`; velocity + `r² · samples · duration`
      provenance are `--type-label` faint — clear descending hierarchy
- [ ] "Collecting…" state: graph fills, no result number until Stop

### "How was this speed calculated?" modal
- [ ] the slope calculation is the **hero**: `m = Δposition ÷ Δtime`
      (`clamp(1.8rem … 3.4rem)`), then the substituted endpoint values, then the
      simplified fraction / two-point slope in accent colour
- [ ] below, smaller: "Motion World uses the best-fit slope of every sample in
      the selected interval" — the honest OLS note, still projector-readable
- [ ] "THE NUMBERS" block: best-fit velocity, speed `|m|`, mph conversion with
      the `× 2.2369362920544` factor, direction, samples, r², intercept
- [ ] the two-point *teaching estimate* and the OLS *calculation* stay clearly
      distinct; when they disagree >10 % the modal says which one the result uses
- [ ] never crops; Esc + backdrop close

### Themes (Home · Live Lab · Data Display · Walk the Line · Runs · Snapshot · Speed)
- [ ] header **Theme** `<select>`: Midnight (default) · Daylight · Dusk ·
      Kusama Dots; choice persists across reloads (localStorage
      `motion-world-theme`); applied as `data-theme` on `<html>` before paint
- [ ] every view re-themes with no layout shift — tokens only, no per-view rules
- [ ] **Daylight** — light surfaces, dark ink, green trace / blue accent; chart
      grid + labels legible on the lighter inset
- [ ] **Dusk** — violet twilight; warm-orange trace on the dark plot
- [ ] **Kusama Dots** — warm cream page with a subtle two-layer red/ink
      polka-dot field on `<body>` (`background-attachment: fixed`); the
      **plot area, axis labels, tables, panels and result text all sit on their
      own opaque surfaces** — dots never touch data. Kusama red accent, near-black
      trace on a clean near-white plot. Artful, not noisy.
- [ ] no external asset / font / CDN in any theme; portable `MotionWorld.html`
      offers all four themes offline
