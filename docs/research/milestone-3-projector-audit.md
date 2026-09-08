# Milestone 3 — Snapshot Lab — projector / responsive audit

Manual (jsdom has no layout). Chrome/Edge, `?fake`. Resize / DevTools device toolbar.

## Widths
1024×768 · 1280×720 · 1366×768 · 1440×900 · 1920×1080

## States
- **Snapshot — no run** ("NO RUN TO SNAPSHOT" + Go to Live Lab / Open Saved Runs)
- **Raw Run** (Time (s) / Position (m) axes, "Select Window")
- **window selection** (band + LEFT/RIGHT handles + Start/End steppers + Use All)
- **trimmed selection** (a middle interval)
- **Classroom Snapshot** (Classroom x / Classroom y axes, 5 markers, fixed domain)
- **POINTS closed** (default) / **POINTS open** (X | Y table)
- **Linear / Quadratic / Cubic / Absolute Value / Square Root / Exponential** fits
- **Suggest**
- **Show Large** (projector overlay)
- **saved-run Snapshot** (opened from Runs → Open in Snapshot)
- **resize narrow→wide** mid-workspace

## Checks (every state × every width)
- [ ] no horizontal page overflow
- [ ] the graph is the dominant element
- [ ] window handles are grabbable (cursor `ew-resize`); the band is grabbable (`grab`)
- [ ] the POINTS table, when open, does not squash the graph (it scrolls, capped height)
- [ ] the classroom equation `f(x) ≈ …` is the largest text and readable from the back
- [ ] `precise fit: f(x) = …` and `r² = …` are readable but subordinate
- [ ] **Show Large never crops** — a long cubic wraps onto continuation lines
- [ ] model controls (Choose model… / Suggest / Show Large) stay visible
- [ ] the mode name + one-line copy make clear whether x means seconds or classroom units
- [ ] markers (POINTS) and the model curve are both visible and distinct

## Result log
| date | browser | widths ok | issues |
|---|---|---|---|
| _pending first run_ | | | |
