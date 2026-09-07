# Milestone 1.5 — Walk the Line — projector audit

Manual (jsdom has no layout engine). Chrome/Edge, `?fake` so no hardware is
needed. Resize the window / use the DevTools device toolbar.

## Widths

1024 × 768 · 1280 × 720 · 1366 × 768 · 1440 × 900 · 1920 × 1080

## States

- **Home (6-tool)** — 3×2 grid; all six tiles legible; Walk the Line active,
  Snapshot/Speed/Sequence "Coming next"
- **Walk — fresh** (armed, no run): target curve visible, no student trace,
  Previous / Change Target / Next enabled, no Run Again
- **Walk — sensor ready**
- **Walk — collecting**: target still visible and **not rescaling**; the green
  "You" trace draws live over the dashed "Target"; nav buttons disabled
- **Walk — stopped**: both lines frozen together; Run Again visible
- **Walk — target picker**: 8 mini-graph previews; current target outlined;
  Esc / backdrop closes
- **Walk — Run Again**: student trace cleared, same target, sensor still ready
- **narrow → wide resize** while a trace is on screen

## Checks (every state × every width)

- [ ] no content clipped; **no horizontal page scrollbar**
- [ ] the graph dominates the screen
- [ ] target curve clearly visible (dashed, thicker, muted)
- [ ] student trace clearly visible (solid, green, dominant) — **distinguishable
      from the target by stroke style/weight, not colour alone**
- [ ] "Target" / "You" legend readable
- [ ] X ("Time (s)") and Y ("Position (m)") axis labels + ticks readable from ~3 m
- [ ] the acquisition bar (in the shell header) is visible and usable
- [ ] Previous / Change Target / Next readable; disabled state obvious while collecting
- [ ] target picker fits on screen at 1024×768 (panel scrolls if needed, no clip)
- [ ] a student trace that leaves the target's y-range **clips at the graph edge**
      and does not push the target off-scale

## Result log

| date | browser | widths ok | issues |
|---|---|---|---|
| _pending first run_ | | | |
