# Art Party V1 — Plan

**Design:** `docs/superpowers/specs/2026-09-09-motion-world-web-art-party-design.md`
Baseline after Phase A (caret + Speed projector fixes), HEAD `8072f25`, **562
tests green**, tsc clean, both builds green, portable 135.5 kB. TDD every
task; each ends `npm test -- --run && npx tsc --noEmit` green + a focused
commit. Both builds stay green throughout; run `npm run build && npm run
build:portable` at least once per task that touches `src/`.

Not building: sound, mouse-driven canvas interaction, saved
artwork/palettes/screenshots, fullscreen requirement, automatic effect
sequencing, any second acquisition path. See design §0/§16.

---

## T1 — `src/art/seeded-random.ts`
- **Tests first:** same seed → identical sequence across two instances;
  different seeds → (almost certainly) diverge; `next()` stays in `[0, 1)`
  over many draws; `range(min, max)` stays within bounds and hits both ends
  over enough draws; `int(min, maxExclusive)` never returns `maxExclusive`;
  `pick` only returns elements from the given array (single-element array →
  always that element).
- **Commit:** `feat(art): seeded PRNG for deterministic art effects`.

## T2 — `src/model/art-signal.ts`
The core pure signal layer — no DOM, no canvas. Constants and both reducers
exactly as designed in spec §6.
- **Tests first (design §6.4, all pure, no jsdom):**
  - `onArtSample`: first sample → `rawPositionMeters` set, `targetVelocityMPerS`
    unchanged (still `0`); a clean steady walk-away sequence → `direction`
    settles to `1` after `advanceArtSignal` runs; walk-toward → `-1`; a faster
    sequence produces a higher `speed01`/`energy` (via `toArtSignal` after
    advancing) than an equally-long slower one; non-finite
    `positionMeters`/`timestampSeconds` → state unchanged, next
    `toArtSignal` has no `NaN`/`Infinity` anywhere; duplicate timestamp
    (`dt <= 0`) → `targetVelocityMPerS` unchanged, no throw; a huge irregular
    gap (`dt > MAX_DT_SECONDS`) → unchanged, not a spike; position far outside
    `[POSITION_MIN_M, POSITION_MAX_M]` → `position01` clamps to `0`/`1`
    (via `advanceArtSignal`, since `onArtSample` only stores the raw target).
  - impulse: a sustained fast run of samples fires exactly once
    (`impulseSeq` bumps by `1`); a sequence dithering around the fire
    threshold without dropping below the rearm threshold does **not**
    refire; dropping below rearm then exceeding fire again → a second bump.
  - `advanceArtSignal` alone (no samples, repeated frame ticks): `energy`
    and `impulse` decay toward `0`; after an idle gap (`> IDLE_AFTER_SECONDS`
    with no new sample) `signedVelocity` relaxes toward `0` even though the
    last real sample implied motion; one call with a huge `dtSeconds` is
    clamped (`MAX_FRAME_DT_SECONDS`), not a jump.
  - purity: the input `MotionSample` (already `Object.freeze`d at the
    source) is never written to — call `onArtSample` and re-assert the
    sample's own fields are unchanged (freeze already throws in strict mode
    on an attempted write, so this also guards against a silent no-op
    swallow by asserting the *values*, not just "no throw").
  - `toArtSignal` never returns `NaN`/`Infinity` for any state reachable
    through the above sequences (a small property-style sweep over the
    fixtures above, not exhaustive fuzzing).
- **Commit:** `feat(model): pure ArtSignal — sensor motion to art parameters`.

## T3 — `src/art/art-types.ts` + `src/art/art-engine.ts`
Types have no runtime behavior to test directly; engine tests use a tiny
recording stub effect (`{ name, reset, render, destroy }` that just logs
calls) plus 1–2 real effects once T4 lands (add those assertions in T4's
commit instead — see below) to avoid a forward reference.
- **Tests first (`art-engine.test.ts`, pure — a stub 2D-context object with
  no real `HTMLCanvasElement`, since `render` only calls context methods):**
  - constructs with a default effect set; `activeEffectName` is one of the
    provided factories' names.
  - `onSample` forwards into the internal signal reducer — `tick(dt)` after
    a sample-heavy sequence returns a `speed01 > 0` `ArtSignal`.
  - `render` calls the active effect's `render` with an `ArtFrame` whose
    `elapsedSeconds` grows call-over-call and resets to `~0` right after
    `changeEffect()`.
  - `changeEffect()` with ≥2 factories never reselects the same family twice
    in a row (deterministic with an injected `seed`/`randomSource`); calls
    the outgoing effect's `destroy()` if present and the incoming effect's
    `reset()`.
  - `changeEffect()` with exactly 1 factory (test-only single-effect
    engine) resets the same effect rather than throwing.
  - `impulseTriggered` is `true` on exactly one `render` call per debounced
    impulse (drive `onSample` with a fast burst, then several idle
    `tick`/`render` pairs — only the first carries `true`).
  - `reducedMotion` passed into `render` is forwarded verbatim onto every
    `ArtFrame`.
  - `destroy()` calls the active effect's `destroy()` once.
- **Commit:** `feat(art): ArtEngine — effect selection and per-frame drive`.

## T4 — `src/art/effects/*.ts` (all six) + `src/art/effects/index.ts`
One file per family (color-wash, neon-rings, particle-burst, wave-field,
radial-geometry, confetti-party), each a small, focused `ArtEffect`
implementation per design §7/§11, each with a local `MAX_*` cap and a
`frame.reducedMotion` scale-down. `index.ts` exports `EFFECT_FACTORIES` (all
six) in a fixed order.
- **Tests first (`tests/art/effects.test.ts`, table-driven over
  `EFFECT_FACTORIES` using a recording 2D-context stub — no real canvas):**
  - every effect's `name` is a non-empty, distinct string (6 distinct names).
  - every effect renders without throwing across a spread of `ArtSignal`
    values (stationary, fast-away, fast-toward, mid-impulse) and both
    `reducedMotion: false/true`.
  - every effect paints an opaque full-canvas background every frame (the
    stub records whether a `fillRect`/`clearRect+fill` covering the full
    dimensions happened) — the Kusama-dots-must-not-show-through
    requirement (design §7/§12).
  - every effect respects its own object cap: drive many frames of
    sustained high `energy`/repeated `impulseTriggered` and assert the
    stub's per-frame draw-call count for particle/ring/confetti-style calls
    never exceeds a documented ceiling.
  - `reducedMotion: true` measurably lowers intensity vs. `false` for the
    same signal sequence (fewer draw calls, or a smaller motion delta
    between frames — whichever is the natural signal for that effect).
  - strobe guard (design §12): across two consecutive rendered frames with a
    fired impulse, the effect's full-canvas background fill color does not
    swing by a large luminance delta frame-to-frame (a coarse guard, not a
    certification).
  - `reset()` with the same seed twice produces the same first-frame draw
    sequence (determinism); two different seeds are not required to differ
    on every single draw call, but the *overall* recorded call sequence
    must differ at least once across a short render run (guards against an
    effect ignoring the RNG entirely).
  - no effect file calls `Math.random(` — a source-text grep test
    alongside the behavioral ones (this doubles as an early instance of the
    T7 architecture guard, kept here too since it's effect-specific and
    cheap to check right where the effects are written).
- **Commit:** `feat(art): six Canvas 2D effect families`.

## T5 — `src/screens/art-party-view.ts` + CSS
The DOM/canvas/lifecycle binding. Reuses `createFrameScheduler`
(`src/ui/raf.ts`), `el`/`button` (`src/ui/components/dom.ts`).
- **Tests first (jsdom, `FakeSensorAdapter` + a real `AcquisitionController`,
  per the existing lab-view test pattern in e.g.
  `tests/ui/speed-lab-view.test.ts`):**
  - mounts a `canvas.art-party__canvas` filling the host; no `.chart-host`,
    no element with a `%`/numeric-position/speed textContent pattern
    anywhere in the view (the "no educational graph, no numbers" guard).
  - `NO_DEVICE` → status text + a Connect action wired to
    `controller.connect()`.
  - `SENSOR_READY` → status + Start wired to `controller.start()`; no
    numeric readout.
  - `MEASURING` → Stop wired to `controller.stop()`; samples pushed via
    `controller.subscribeSample` reach the engine (assert indirectly: spy on
    a test-injected `ArtEngine`-like seam, or assert the canvas 2D context's
    recorded draw calls change shape once as `MEASURING` samples arrive vs.
    idle — pick whichever is less brittle once the real `render` signature
    is in hand from T3).
  - `DEVICE_LOST`/`ERROR` → Reconnect action present and wired; this
    control's visibility is exempt from fade (`--faded` class never
    applied while in these states even after the inactivity timer fires).
  - Change Effect: click cycles `engine.activeEffectName`-equivalent (assert
    via the transient effect-name label appearing then clearing after its
    timeout — use fake timers, matching the `speed-lab-view.test.ts`
    `vi.useFakeTimers` convention) and never shows two different names
    without a click between them.
  - Exit: click calls `deps.navigate("home")`.
  - control fade: with fake timers, simulate `MEASURING` + no interaction →
    after the inactivity delay the overlay gains the `--faded` class;
    a synthetic `pointermove` clears it immediately; `Escape` clears it too;
    fading never removes/hides the DOM nodes (`el.hidden` stays `false`,
    nodes remain queryable) — only the class/opacity changes.
  - reduced motion: mock `window.matchMedia` to report
    `prefers-reduced-motion: reduce` → the mounted view passes
    `reducedMotion: true` through to rendering (assert via an injected
    engine seam recording the flag it received, to avoid coupling the test
    to any one effect's visual output).
  - route cleanup: mount, teardown, mount again on a fresh host → exactly
    one active RAF chain (use a fake `requestAnimationFrame`/
    `cancelAnimationFrame` pair injected the same way `raf.test.ts` /
    `createFrameScheduler`'s own tests already do, and assert the first
    mount's chain is fully cancelled — no leftover `schedule` after its
    teardown fires).
  - teardown removes pointer/resize/keyboard listeners (assert via a spy on
    `addEventListener`/`removeEventListener` call-count parity on the
    relevant targets, matching the pattern other views already use for
    listener cleanup checks where present).
- **Commit:** `feat(art): Art Party screen — canvas, overlay, lifecycle`.

## T6 — wire it: router + shell + app + Home
- `router.ts`: `Route` gains `"art"`; `HASH_TO_ROUTE["#/art"]`;
  `ROUTE_TO_HASH.art`.
- `shell.ts`: the two-line immersive-route change from design §4
  (`header.hidden`, `.app-main--immersive`); `layout.css` gets the
  `.app-header[hidden]` and `.app-main--immersive` rules.
- `app.ts`: `case "art"` mount; `"art"` added to the nav-away `TOOLS` set.
- `home-view.ts`: the special-mode control from design §13, below
  `.home-grid`; `layout.css`/`components.css` styling with existing
  semantic tokens only.
- **Tests:**
  - `router.test.ts`: `#/art` round-trips; unknown hash still falls back to
    home (existing behavior unchanged).
  - `shell.test.ts` (or a new small test alongside it if none exists yet —
    check first): navigating to `"art"` hides `.app-header` and adds
    `.app-main--immersive`; navigating to any other route shows the header
    and removes the class again (regression guard — every other route's
    header must stay untouched).
  - `home-view.test.ts`: still exactly six `.tile` elements in
    `.home-grid`; a new assertion that `.home-special` exists as a sibling
    of `.home-grid`, is not itself a `.tile`, and its button navigates to
    `"art"`.
  - `app.test.ts` (or wherever route-mount wiring is asserted for other
    labs): `#/art` mounts the Art Party view with the shared controller
    (same instance identity check pattern used for the other tools, if that
    pattern exists — confirm the exact assertion style already used for
    e.g. `"sequence"` before writing this one).
- **Commit:** `feat(app): activate Art Party — route, shell overlay, Home
  special control`.

## T7 — architecture guards + portable + docs
- `tests/architecture.test.ts`:
  - `model/art-signal.ts` added to the existing `PURE` list.
  - new guard: nothing under `src/art/` or
    `src/screens/art-party-view.ts` mentions `navigator.hid`.
  - new guard: nothing under `src/art/` imports
    `sensor/(hid|go-motion-protocol|go-motion-webhid)` or
    `GoMotionWebHIDAdapter`.
  - new guard: nothing under `src/art/` mentions `indexedDB`/`IDBDatabase`
    or imports the IndexedDB run-store implementation.
  - new guard: nothing under `src/art/effects/` calls `Math.random(`
    (promote the T4 inline check here too so it lives with the other
    architecture guards, not just in the effects test file).
- `tests/portable/artifact.test.mjs`: the built single-file HTML contains
  reachable Art Party route content (structural check, not minified
  identifiers — follow the exact assertion style already used there for
  Sequence Lab); no new external `http(s)://` script/link tag; still
  exactly one output file.
- `README.md`: six educational labs list stays as-is; add a "Special Mode"
  line — Art Party, sensor-powered generative visuals, explicitly
  non-educational — matching the minimal-copy instruction in design's
  parent prompt §63.
- **Commit:** `test+docs: Art Party architecture guard, portable check,
  README`.

## T8 — verify + deploy + report
`npm ci` · `npm test -- --run` · `npx tsc --noEmit` · `npm run build` ·
`npm run build:portable` · `npm audit` · `git diff --check` — all green,
portable still exactly one runtime file. Preview smoke with `?fake` (no real
hardware in this environment): Home → Art Party special control → idle
ambient render → Start → fake samples drive visible signal response → Change
Effect cycles through all six → controls fade while "measuring" and restore
on pointer move → Exit returns to Home → re-enter Art Party confirms a
single healthy render loop (no visual/timing acceleration). Push `main` (no
force), watch Pages, verify both the live Home URL and `#/art`. Write the
final report per the parent prompt's exact format, including the three
short physical-acceptance checklists (Art Party / Speed / Caret) verbatim
from the parent prompt §62. Update the project memory file. **Do not begin
another major feature.**

---

## Risks / notes

- **The signal layer is the load-bearing piece.** Everything downstream
  (six effects, the engine, the screen) only ever sees the narrow
  `ArtSignal` projection — if T2's reducers are right and thoroughly tested,
  a bug in any one effect is cosmetic and cheap to fix; a bug in T2 would
  quietly mis-drive every effect at once. Extra test weight belongs there,
  not spread thin across six effect files.
- **`?fake` cannot exercise real classroom feel.** `FakeSensorAdapter`
  proves the wiring (samples flow, states transition, controls work) but
  not whether the art *feels* good in the hand — that's explicitly reserved
  for the human's physical acceptance pass (design §16, parent prompt §62).
  Don't over-claim what the automated smoke test established.
- **Canvas testing in jsdom has no real rendering.** All render-loop
  assertions go through a recording 2D-context stub (log which methods were
  called with which coarse arguments) rather than pixel inspection —
  consistent with "no brittle pixel-perfect assertions" in the parent
  prompt (§11/§55/§56/§61).
- **Two RAF-driving views can never coexist** — `stopForNavigation` already
  stops an active run when leaving any `TOOLS` route (now including
  `"art"`), and each `mountArtPartyView` call is a fresh closure with no
  module-level state, so there is no cross-mount leakage to worry about
  beyond what T5's re-entry test already covers.
- **Shell change touches a shared file.** Keep the diff to the exact
  two-line change in design §4 and re-run every other view's existing tests
  (not just the new ones) in T6 to confirm no other route's header
  regressed.

## Self-review

Every design section maps to a task: seeded RNG (T1), the pure signal core
(T2), engine/effect contract + orchestration (T3), the six effect families
under that contract (T4), the DOM/canvas/lifecycle/overlay/fade/device-lost/
reduced-motion screen (T5), routing/shell/Home wiring (T6), architecture
purity + portable + docs (T7), verify/deploy/report (T8). One controller,
one adapter, one signal reducer pair, one engine, six effects behind one
contract, one screen, one route. No Art-specific persistence, no second
acquisition path, no sound, no strobe, no numeric educational content
anywhere in the route. Caret and Speed Lab fixes from Phase A are already
committed and are not touched again by any task here.
