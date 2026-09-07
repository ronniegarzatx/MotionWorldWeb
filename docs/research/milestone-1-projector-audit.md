# Milestone 1 — projector / responsive audit

Milestone 1 is desktop/projector-first. Not optimised for phones. This is a
**manual** checklist — jsdom has no layout engine, so the automated suite can
only guard structure (`tests/architecture.test.ts`) and the token mechanism.

Run it in Chrome/Edge with the window sized to each width (DevTools device
toolbar → Responsive, or resize the window). Use `?fake` so no hardware is
needed; use `?fake&debug=sensor` to also reach `#/diagnostics`.

## Widths

| | notes |
|---|---|
| 1024 × 768 | oldest classroom projector; the floor Motion World supports |
| 1280 × 720 | common laptop-to-projector |
| 1366 × 768 | most common school laptop panel |
| 1440 × 900 | |
| 1920 × 1080 | modern projector / TV — the Data Display number must be *huge* here |

Below ~1024×640 the app shows a "make the window larger" hint rather than
clipping — that is expected, not a bug.

## Screens × states

Navigate with the URL hash (`#/`, `#/live`, `#/data`) and the acquisition bar
controls (Connect → Sensor Ready → Start → Stop).

- **Home** — (a) no sensor, (b) connecting, (c) system ready
- **Live Lab** — (a) fresh (armed, no run), (b) collecting (trace growing),
  (c) completed (frozen run), (d) after navigating Home and back (trace restored)
- **Data Display** — (a) fresh ("—"), (b) collecting (live number), (c) stopped
  (value retained)
- **Device Lost** — unplug the sensor mid-run (or, with `?fake`, not reproducible
  — check the copy only)

## Checks (every screen × every width)

- [ ] no content clipped at the edges
- [ ] **no horizontal page scrollbar** (`document.body` never wider than the viewport)
- [ ] the acquisition bar status + buttons are fully visible and not wrapped mid-word
- [ ] Home: five tiles legible; the three disabled ones read "Coming next"
- [ ] Live Lab: the graph dominates; **X ("Time (s)") and Y ("Position (m)") axis
      titles and tick labels are readable from ~3 m**
- [ ] Live Lab: the stat strip (Elapsed / Position / Samples) does not overlap the graph
- [ ] Data Display: the POSITION number is the dominant element and is **genuinely
      large** at 1920×1080 (fills most of the width); still fits without clipping at 1024×768
- [ ] Data Display: TIME is clearly secondary
- [ ] focus ring visible when tabbing through controls
- [ ] `Space` toggles Start/Stop when focus is not on a button/field

## Result log

| date | browser | widths ok | issues |
|---|---|---|---|
| _pending first run_ | | | |
