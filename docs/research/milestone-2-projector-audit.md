# Milestone 2 — projector / responsive audit

Manual (jsdom has no layout). Chrome/Edge, `?fake`. Resize / DevTools device toolbar.

## Widths
1024×768 · 1280×720 · 1366×768 · 1440×900 · 1920×1080

## Screens / states
- **Home** — 6 tiles (3×2), a **Runs** link in the header (secondary — must not
  compete with the tiles)
- **Walk — default** (Stand Still, offset 0)
- **Walk — shifted Stand Still** (`+ 0.5 m` a few times → "Target height: 3.0 m")
- **Walk — dragging** the target line vertically
- **Walk — at a shift limit** (`+` disabled, label at 3.5 m / 0.5 m)
- **Walk — collecting** (offset controls + nav all disabled; target fixed while
  the student trace draws)
- **Runs — empty** ("NO SAVED RUNS YET")
- **Runs — populated** (rows newest-first: date, duration, samples)
- **Runs — interrupted entry** (an "interrupted — …" chip)
- **Run detail** (graph + Saved / Duration / Samples + analysis-window line)
- **Storage-fallback banner** (open the portable `MotionWorld.html` in a browser
  where IndexedDB is blocked, or force the fallback — the amber "Temporary
  storage…" banner in Runs)

## Checks (every screen × every width)
- [ ] no horizontal page scrollbar; nothing clipped
- [ ] the graph is the dominant element on Walk / Run detail
- [ ] the **drag affordance** is understandable — the cursor changes to a
      vertical-resize over the target line
- [ ] `− 0.5 m` · offset label · `+ 0.5 m` · Reset Position all visible and not
      wrapped mid-control
- [ ] target vs student trace still distinguishable (dash vs solid, weight, colour)
- [ ] axis titles + tick labels readable from ~3 m
- [ ] Runs list rows readable; the interrupted chip legible; actions (View /
      Delete) reachable
- [ ] Clear All Runs shows its two-step confirm without layout jump
- [ ] Run detail chart + stats fit without clipping at 1024×768
- [ ] the header "Runs" link reads as a utility, not a 7th tool

## Result log
| date | browser | widths ok | issues |
|---|---|---|---|
| _pending first run_ | | | |
