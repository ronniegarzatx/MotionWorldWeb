# Milestone 5 — Sequence Lab (Bounce + Pendulum) — projector / responsive audit

Manual (jsdom has no layout). Chrome/Edge, `?fake` or a saved run. Resize /
DevTools device toolbar. All four themes.

## Widths
1024×768 · 1280×720 · 1366×768 · 1440×900 · 1920×1080

## States
- **Bounce fresh** (a clean synthetic / real bounce run just analysed)
- **Bounce detected** — markers on the apexes, dashed reference line, `n`-vs-height points
- **Bounce bad-reference failure** — "Couldn't find a stable resting level" (collapses to the single raw graph)
- **Bounce trimmed** — first/last event excluded (muted), ratio recomputed
- **Pendulum amplitude** — maxima + minima markers, midline, TURNING-POINT AMPLITUDE sequence
- **Pendulum period** — PERIOD SEQUENCE, AVERAGE PERIOD headline
- **Pendulum too-short failure** — "Collect a few more complete swings."
- **Sensitivity Low / Standard / High** — reruns on the same run
- **saved run** (Runs → Open in Sequence Lab, no sensor)

## Checks (every state × every width × every theme)
- [ ] the **RAW MOTION** graph is large and readable; dense trace clearly visible
- [ ] detected event markers are **large and obvious**; the dashed reference /
      midline line is visible and physically plausible
- [ ] pendulum: maxima (`.marker`) and minima (`.marker--alt`) are visually
      distinguishable; the midline sits between them
- [ ] the **sequence graph** reads as *discrete* — large points, `n` on the x
      axis, the connecting line is clearly a subtle guide, not the encoding
- [ ] excluded terms render **muted** on both graphs, never removed
- [ ] the headline (`COMMON RATIO` / `AMPLITUDE RATIO` / `AVERAGE PERIOD`) is the
      largest result text; status + formula are subordinate
- [ ] on failure the reason replaces the headline; MODE + SENSITIVITY (+ MEASURE)
      stay clickable; the view drops to one full-width raw graph
- [ ] the deck is minimal — `MODE` always; `AMPLITUDE|PERIOD` only in Pendulum;
      `SENS`; a folded term-range readout that opens to Start/End steppers with a
      contextual `Use all`; controls recede until selected/hovered/focused
- [ ] wide: the two graphs sit **side-by-side** and each stays large; below
      ~1100px they **stack** and the raw trace keeps a real height (never tiny)
- [ ] Kusama: both plot areas stay opaque and clean; dots never touch a trace,
      a marker, an axis label or the sequence points
- [ ] no horizontal page overflow; nothing clipped at any width

## Honesty checks
- [ ] no sequence classification is forced — poor ratios say "RATIO VARIES",
      poor periods say "PERIOD VARIES"
- [ ] the reference / midline is a robust estimate (settled tail + contact
      cluster for bounce; median-of-medians for pendulum), and a bad reference
      **fails** rather than fabricating heights
- [ ] `aₙ ≈ a₁·rⁿ⁻¹` only appears with ≥ 3 usable terms; period mode shows no
      arithmetic formula
- [ ] changing sensitivity reruns detection on the **same** immutable MotionRun —
      no recollection, raw samples unchanged
- [ ] `#/sequence/<runId>` analyses a saved run with **no sensor** and never
      writes it back; derived results are not persisted

## Result log
| date | browser | widths ok | issues |
|---|---|---|---|
| _pending first run_ | | | |
