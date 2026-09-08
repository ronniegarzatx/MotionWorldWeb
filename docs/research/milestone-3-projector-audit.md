# Milestone 3 — Snapshot Lab — projector / responsive audit

Manual (jsdom has no layout). Chrome/Edge, `?fake`. Resize / DevTools device toolbar.

## Widths
1024×768 · 1280×720 · 1366×768 · 1440×900 · 1920×1080

## States
- **Snapshot — no run** ("NO RUN TO SNAPSHOT" + Go to Live Lab / Open Saved Runs)
- **Raw Run** (Time (s) / Position (m) axes, "Select Window")
- **window selection** (band + LEFT/RIGHT handles + Start/End steppers + Use All)
- **trimmed selection** (a middle interval)
- **Classroom Snapshot — 3 points / 5 points / 10 points**
- **flat motion / linear motion / curved motion** (the dense trace shape must be obvious)
- **POINTS closed** (default) / **POINTS open** (X | Y table)
- **Linear / Quadratic / Cubic / Absolute Value / Square Root / Exponential** fits
- **Suggest**
- **Show Large** (projector overlay)
- **saved-run Snapshot** (opened from Runs → Open in Snapshot)
- **resize narrow→wide** mid-workspace

## Checks (every state × every width)
- [ ] **the classroom graph no longer looks blank** — the dense Motion trace shows the shape
- [ ] the Motion trace, the Points, and the Model curve are **easy to distinguish**
      (weight + dash + marker size, not colour alone); render order Motion → Model → Points
- [ ] the sampled Points are **clearly visible from projector distance** (larger markers)
      and don't overlap even at 10 points
- [ ] the compact **Motion / Points / (Model)** legend is readable and doesn't eat graph space
- [ ] the classroom y-axis is **stable** — fitting a model does not jump the axes
- [ ] no horizontal page overflow; nothing clipped
- [ ] the classroom equation `f(x) ≈ …` is the largest text and readable from the back
- [ ] `precise fit: f(x) = …` and `r² = …` are readable but subordinate
- [ ] **Show Large never crops** — a long cubic wraps onto continuation lines
- [ ] model controls (Choose model… / Suggest / Show Large) stay visible
- [ ] Raw Run is unchanged (Time (s) / Position (m), full-resolution measured data)

## Result log
| date | browser | widths ok | issues |
|---|---|---|---|
| _pending first run_ | | | |
