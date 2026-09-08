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

---

## Final UI polish — spare projector layout

### Main screen
- [ ] top row: **Speed Lab** + one-line instruction on the left, **YOUR SPEED /
      big mph value / direction** on the right; the result block has a stable
      min-width so a changing value / direction never reflows the row
- [ ] the result block is **above** the graph, never below it
- [ ] the graph is the dominant object (`1fr` row, `min-height 340px` /
      `height 62vh`), full practical width; not shrunk to fit text
- [ ] interval controls (`Use all` · `Start − v +` · `End − v +`) directly under
      the graph, behaviour unchanged
- [ ] bottom row: `SPEED LIMIT [2][5][10]` on the left, one prominent
      **HOW WAS THIS SPEED CALCULATED?** button on the right; wraps cleanly at
      narrow widths, neither group clips
- [ ] the main screen shows **nothing else** — no under/over sentence, no signed
      velocity, no r², no sample count, no interval duration, no intercept

### Calculation modal (the single place for all detail)
- [ ] hero = the slope formula as a **real fraction**: `m = Δposition / Δtime`,
      then the interval's endpoint values substituted into a fraction, then
      `m = Δpos / Δtime` numerically, then `TWO-POINT SLOPE ≈ ±v m/s` — large,
      readable across a classroom; the modal scrolls (`max-height: 92vh`) rather
      than shrinking the formula
- [ ] Δ explanation below it, subordinate: Δ = "change in", `final − initial`,
      "slope = velocity"
- [ ] **ACTUAL MOTION WORLD CALCULATION** section: best-fit velocity, speed
      `|v|`, mph conversion with `× 2.2369362920544`, direction, speed-limit
      comparison, interval, intercept, and a `m · r² · N samples` summary line
- [ ] honesty line always present — "two-point slope = intuitive check /
      best-fit slope = actual calculation"; when the two differ >10% an amber
      callout names both and says the result uses the best-fit slope
- [ ] too-short interval: the two-point hero is replaced by the best-fit slope;
      the calculation section still renders
- [ ] no clipped math at any width; Esc / backdrop close

---

## Window zoom (graph-only viewport)

Three separate concepts: **MotionRun** (immutable), **AnalysisWindow** (the OLS
interval), **graph viewport** (`full` / `window`). Zoom changes only the viewport.

### States to check (each × 1024–1920)
- full 20 s run · small selected window · zoomed small window · flat/stationary
  zoom · noisy zoom · toward · away · Full Run return · interval changed while
  zoomed · Use All while zoomed

### Requirements
- [ ] `Zoom to window` shows in full mode; `Full run` shows in window mode
      (`aria-pressed` + accent border cue). Button sits at the right of the
      interval-control row (`margin-left:auto`), wraps left under 720px.
- [ ] full mode unchanged: whole run, shaded window, both handles + band draggable,
      Start/End steppers, Use All, OLS line across the selection, speed
      recalculates on every window change
- [ ] zoom mode: x viewport = `window.start → window.end`; y viewport derived from
      the active samples in the window (+ OLS endpoints), with ≥ 0.3 m minimum
      span so flat motion isn't a compressed line
- [ ] the zoomed slope is visually obvious — the segment fills the plot
- [ ] axis tick labels stay sensible at the zoomed scale; **Time (s)** /
      **Position (m)** labels unchanged
- [ ] OLS fit line stays restricted to the AnalysisWindow (which now fills the x
      viewport); regression is never drawn outside the selection
- [ ] editing Start / End / a handle while zoomed: the viewport follows the new
      window and re-derives its y-domain; **handles clamp to the current viewport
      so they shrink-only in zoom mode — the numeric ± steppers (which clamp to
      the run) and `Full run` are the way to widen.** The teacher is never trapped.
- [ ] `Full run` returns the viewport to the whole run; the selected window and
      the speed result are byte-for-byte unchanged
- [ ] `Use All` while zoomed: window becomes the full run **and** the viewport
      returns to `full` (least-surprising)
- [ ] a new acquisition / opening a different saved run resets the viewport to
      `full` (never carries a zoom across runs)
- [ ] zoom works for current real / fake / saved runs; no sensor, no persistence
- [ ] **calculation invariance:** velocity / speed / direction / speed-limit /
      modal numbers identical before zoom, while zoomed, and after `Full run`
- [ ] no horizontal overflow, no clipping, graph stays dominant, in every theme

---

## Minimal control deck

The top region is: title + subtitle (left), `YOUR SPEED` result (right), and a
single quiet control deck below them. **Nothing sits below the graph.**

### Layout / states (each × 1024–1920, each theme)
- full run · trimmed window · interval editor expanded · zoomed · toward · away ·
  stationary · 2 / 5 / 10 selected · Δ modal open

### Requirements
- [ ] visual priority top-to-bottom: **speed result → graph → title → deck**; the
      deck never competes with the graph or the speed value
- [ ] the deck controls recede by default — transparent fill, muted text,
      restrained border — and gain contrast on hover / focus; the selected limit
      and an active `Full run` use the accent
- [ ] **speed-limit** is a compact segmented control `LIMIT 2 5 10`; real buttons,
      `aria-pressed`, `aria-label="N mph limit"`, 32 px min hit height
- [ ] **interval** shows one readout `WINDOW 0.00–4.00 s ▸`; clicking it folds
      open the `Start [−] v [+]` / `End [−] v [+]` editor (chevron flips); it
      folds shut on a second click, on a click outside (real `mousedown`), on
      `Use all`, and on any view reset. No permanent steppers.
- [ ] the **graph drag handles are the primary** window edit and keep working
      with the editor open or shut
- [ ] **Use all** is shown only inside the editor and only when the window is
      trimmed; hidden at full run; clicking it restores the full run (and, if
      zoomed, the full viewport)
- [ ] **Zoom** is shown only when the window is trimmed and the viewport is full;
      `Full run` replaces it while zoomed; it is the only persistent viewport
      control and never appears at full-run window
- [ ] **Δ** is the calculation trigger — text `Δ`, `title` / `aria-label`
      "How was this speed calculated?"; subtle by default, clear on hover/focus;
      opens the unchanged modal
- [ ] result block stays `YOUR SPEED` / big mph / direction only — no supporting
      metrics leak back onto the main view
- [ ] wide: title+deck left, result right, graph full-width below; narrow: the
      head may stack (result under title) and the deck wraps — the speed value
      never shrinks to keep one row; no horizontal overflow
- [ ] Kusama: the deck's segmented control, interval editor and Δ sit on their
      own surfaces / borders and stay readable over the dot field
