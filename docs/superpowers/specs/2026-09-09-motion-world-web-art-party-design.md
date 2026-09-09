# Art Party V1 — design spec

2026-09-09

## 0. Scope

Product decisions (purpose, effect list, home placement, silence, no
persistence, strobe-safety, control-fade behavior, etc.) are **human-approved**
in the parent prompt and are not re-litigated here. This spec resolves the
*technical* shape: how Art Party plugs into the existing acquisition/router/
theme architecture, the exact signal math, the effect contract, and the
lifecycle rules — the things the parent prompt explicitly asked this document
to pin down before implementation.

Everything here is additive. Live Lab, Data Display, Walk the Line, Snapshot
Lab, Speed Lab, Sequence Lab, RunStore, the router's existing routes, and the
acquisition state machine are untouched except for the two small, closed-set
additions in §2 and §9.

## 1. File layout

```
src/model/art-signal.ts          pure: MotionSample -> ArtSignal (no DOM)
src/art/art-types.ts             ArtSignal, ArtFrame, ArtEffect, ArtDimensions
src/art/seeded-random.ts         deterministic PRNG (mulberry32-style)
src/art/art-engine.ts            effect selection + per-frame drive (no DOM canvas calls itself — see §7)
src/art/effects/color-wash.ts
src/art/effects/neon-rings.ts
src/art/effects/particle-burst.ts
src/art/effects/wave-field.ts
src/art/effects/radial-geometry.ts
src/art/effects/confetti-party.ts
src/art/effects/index.ts         EFFECT_FACTORIES: readonly ArtEffectFactory[]
src/screens/art-party-view.ts    route/DOM/canvas/lifecycle binding (the only DOM-touching art file)
```

`src/screens/` is a new top-level directory (existing views live under
`src/ui/<lab>/`, but Art Party is deliberately not a classroom lab — see
§13 — so it does not join that naming family). `mountArtPartyView` follows
the same `mount*View(host, deps): () => void` shape every other screen uses.

## 2. Router

Add one route, following the existing flat-hash convention (no params — V1
has nothing to deep-link):

```ts
export type Route = ... | "sequence" | "art" | "runs" | ...;
HASH_TO_ROUTE["#/art"] = "art";
ROUTE_TO_HASH.art = "#/art";
```

No special-case parsing needed (unlike `run`/`snapshot`/`speed`/`sequence`,
which carry an id param). `#/art` works identically under GitHub Pages and
`file://` — the router only ever reads `location.hash`.

## 3. Composition root (`src/app/app.ts`)

One `mountRoute` case:

```ts
case "art":
  return mountArtPartyView(main, { controller, navigate: router.navigate });
```

`TOOLS` (the set that triggers `controller.stopForNavigation()` on route-away
while measuring) gains `"art"`. This is the *only* reason Art Party needs to
touch `app.ts` — everything else is registration, not new logic. Art Party
reuses the one `AcquisitionController` instance exactly like every other tool;
it is constructed once in `startApp` and injected everywhere.

## 4. Shell — minimal overlay instead of the classroom header

`mountShell` (`src/ui/shell.ts`) currently always renders the full
`<header class="app-header">` (wordmark, acquisition bar, Runs link, theme
picker, dev link) above `<main class="app-main">`. Per §16 of the parent
prompt, Art Party should not carry that chrome if it costs immersion — and a
docked header eats the same vertical budget that Phase A just fought to
reclaim for Speed Lab, which is the wrong direction for a full-bleed canvas.

Minimal, closed-set change to `shell.ts`:

```ts
renderLocation(location) {
  teardownView?.();
  main.replaceChildren();
  const immersive = location.route === "art";
  header.hidden = immersive;
  main.classList.toggle("app-main--immersive", immersive);
  teardownView = deps.mountRoute(location, main);
},
```

CSS addition (`layout.css`):

```css
.app-header[hidden] { display: none; }
.app-main--immersive { padding: 0; }
```

(`[hidden]` alone is not enough — `.app-header{display:flex}` is an
author-origin rule and beats the UA-origin `[hidden]{display:none}` default,
so the override must be explicit.) `.app-shell`'s `grid-template-rows: auto
1fr` already gives `main` the full height once the header row collapses — no
other shell change needed. Art Party's own view renders **all** of the
required minimal controls (§8) inside its own overlay; nothing observable is
lost by hiding the classroom header on this one route.

This is a two-line, testable, reversible change scoped to exactly one route
check. No other view is affected.

## 5. Acquisition integration — LOCKED, reused as-is

```
Go!Motion / CBR 2
  -> GoMotionWebHIDAdapter        (existing, src/sensor/)
  -> AcquisitionController        (existing, ONE instance, app lifetime)
  -> art-party-view.ts subscribes:
       controller.subscribeUiState(...)     minimal overlay state
       controller.subscribeSample(...)      -> ArtEngine.onSample(sample)
       controller.subscribeRunComplete(...) -> ArtEngine.onRunComplete() (calms state; no other effect — RunStore autosave is unchanged and untouched)
  -> ArtEngine (art-engine.ts)     signal reduction + effect drive
  -> active ArtEffect              Canvas 2D paint
```

Art Party issues intents through the controller's existing guarded API only:
`connect()`, `arm()`, `start()`, `stop()`, `reconnect()`, and reads
`controller.uiState` for `state`/`canConnect`/`canArm`/`canStart`/`canStop`/
`connecting`/`lastError`. It never touches `navigator.hid`,
`GoMotionWebHIDAdapter`, or constructs a second `AcquisitionController`. It
never calls `adapter.*` directly. This is enforced by an architecture guard
(§14) identical in spirit to the existing sensor-boundary guard in
`tests/architecture.test.ts`.

`controller.subscribeSample` already only fires while `state === "MEASURING"`
(`AcquisitionController.onSample` gates on this internally) — Art Party does
not need to re-check state before forwarding a sample to the engine.

Physical blue-button start/stop already flows through the adapter's trigger
→ controller state machine → the *same* `subscribeUiState`/`subscribeSample`
callbacks Art Party uses. No Art-specific handling required — it "just
works" identically to every other tool the moment the overlay reflects
`controller.uiState`.

## 6. `ArtSignal` — pure model (`src/model/art-signal.ts`)

No DOM, no canvas, no timers — importable and testable in Node, matching the
`PURE` architecture guard list already enforced in
`tests/architecture.test.ts` (Art Party adds `model/art-signal.ts` to that
list).

### 6.1 Public shape

```ts
export interface ArtSignal {
  readonly position01: number;      // 0..1, smoothed, clamped
  readonly speed01: number;         // 0..1, smoothed |velocity| / reference
  readonly signedVelocity: number;  // m/s, smoothed, signed
  readonly direction: -1 | 0 | 1;   // sign of signedVelocity with a deadband
  readonly energy: number;          // 0..1, fast-rise / slow-decay envelope of speed01
  readonly stillness: number;       // 1 - energy
  readonly impulse: number;         // 0..1, decaying pulse; 1 on a fresh debounced trigger
}
```

### 6.2 Internal state (engine-visible, not exported to effects)

```ts
interface ArtSignalState {
  readonly rawPositionMeters: number | null; // last valid clamped position
  readonly lastSampleAtSeconds: number | null; // sample-clock time of last valid sample
  readonly targetVelocityMPerS: number;      // instantaneous finite-difference target
  readonly secondsSinceSample: number;       // frame-clock accumulator (drives idle decay)
  readonly position01: number;
  readonly signedVelocity: number;
  readonly energy: number;
  readonly impulse: number;
  readonly impulseArmed: boolean;
  readonly impulseSeq: number; // bumps on each fresh fire — edge detection for the engine
}
export const INITIAL_ART_SIGNAL_STATE: ArtSignalState;
export function toArtSignal(state: ArtSignalState): ArtSignal;
```

Two pure reducers, deliberately separate because they run on different
clocks:

**`onArtSample(state, sample: MotionSample): ArtSignalState`** — runs once
per incoming sensor sample (sample-clock time, ~25 Hz while measuring).
Ingests raw sensor data; does **not** do the frame-smoothing math.

1. Reject non-finite input: if `!Number.isFinite(sample.positionMeters) ||
   !Number.isFinite(sample.timestampSeconds)`, return `state` unchanged
   (covers "no NaN/Infinity", "invalid input" from §29/§54).
2. Clamp: `clampedM = clamp(sample.positionMeters, POSITION_MIN_M,
   POSITION_MAX_M)` (see §6.3 for the constants).
3. Compute `dt = state.lastSampleAtSeconds == null ? null :
   sample.timestampSeconds - state.lastSampleAtSeconds`.
4. If `dt !== null && dt >= MIN_DT_SECONDS && dt <= MAX_DT_SECONDS`:
   `targetVelocityMPerS = (clampedM - state.rawPositionMeters!) / dt`.
   Otherwise (first sample ever, duplicate/non-monotonic timestamp
   `dt <= 0`, or an irregularly large gap) leave `targetVelocityMPerS`
   unchanged — this is what makes duplicate and irregular timestamps stable
   instead of dividing by zero or spiking (§29/§54).
5. Impulse detection (hysteresis + refractory, both on the *sample* clock so
   it is deterministic given a sample sequence — no wall-clock dependency):
   - `speed01Now = clamp(Math.abs(targetVelocityMPerS) / SPEED_REFERENCE_MPS, 0, 1)`
   - if `state.impulseArmed && speed01Now >= IMPULSE_FIRE_THRESHOLD`: fire —
     `impulse = 1`, `impulseArmed = false`, `impulseSeq += 1`.
   - if `!state.impulseArmed && speed01Now <= IMPULSE_REARM_THRESHOLD`:
     re-arm — `impulseArmed = true`.
   - otherwise `impulse`/`impulseArmed` pass through unchanged from `state`
     (the per-frame `advanceArtSignal` decays `impulse` — see below).
   - `IMPULSE_FIRE_THRESHOLD (0.55) > IMPULSE_REARM_THRESHOLD (0.3)` is the
     hysteresis band: one sustained fast motion fires once, not every
     sample above threshold, and noisy dithering around one value can't
     retrigger it either (§28/§54 "does not fire every noisy frame").
6. Update `rawPositionMeters = clampedM`, `lastSampleAtSeconds =
   sample.timestampSeconds`, `secondsSinceSample = 0`.
7. `position01`/`signedVelocity`/`energy` are **not** touched here — they are
   smoothed values owned by `advanceArtSignal`.

**`advanceArtSignal(state, dtSeconds: number): ArtSignalState`** — runs once
per rendered animation frame (frame-clock time), *regardless* of whether a
new sample arrived this frame. This is what makes "stop moving → visuals
calm gradually" and "device lost → smoothly calm" work: the decay is driven
by real elapsed time, not by sample arrival, so it keeps running even when
samples stop entirely.

1. Clamp `dtSeconds` to `[0, MAX_FRAME_DT_SECONDS]` (0.1 s) — a stalled tab
   or a huge gap between frames must not produce one giant smoothing jump.
2. `secondsSinceSample' = state.secondsSinceSample + dtSeconds`.
3. `idle = secondsSinceSample' > IDLE_AFTER_SECONDS` (0.5 s with no fresh
   valid sample). `velocityTarget = idle ? 0 : state.targetVelocityMPerS`.
4. Frame-rate-independent exponential smoothing toward each target, e.g.
   `next = lerp(prev, target, 1 - Math.exp(-RATE * dtSeconds))`:
   - `position01' ~ toward positionFromMeters(state.rawPositionMeters)` at
     `POSITION_SMOOTH_RATE`.
   - `signedVelocity' ~ toward velocityTarget` at `VELOCITY_SMOOTH_RATE`.
5. `speed01 = clamp(Math.abs(signedVelocity') / SPEED_REFERENCE_MPS, 0, 1)`.
6. `energy'` — fast attack / slow release toward `speed01`: use
   `ENERGY_RISE_RATE` when `speed01 > energy` and the much smaller
   `ENERGY_DECAY_RATE` otherwise, both run through the same
   frame-rate-independent lerp. This is the "move → energetic, stop →
   settle" envelope (§27), and it decays on its own even with zero
   incoming samples (idle/device-lost).
7. `impulse' = state.impulse * Math.exp(-IMPULSE_DECAY_RATE * dtSeconds)`,
   snapped to `0` below a small epsilon.
8. `direction = Math.abs(signedVelocity') < DIRECTION_DEADBAND_MPS ? 0 :
   Math.sign(signedVelocity')` — cast to `-1 | 0 | 1`.

Effects never see `ArtSignalState`, only the narrow `ArtSignal` projection
from `toArtSignal`.

### 6.3 Constants (all named, all in one place at the top of the file)

| constant | value | rationale |
|---|---|---|
| `POSITION_MIN_M` | `0.4` | Go!Motion/CBR 2 practical near limit for stable classroom readings |
| `POSITION_MAX_M` | `6.0` | typical classroom-scale usable range before signal quality degrades |
| `SPEED_REFERENCE_MPS` | `2.0` | a brisk walking pace maps to `speed01 = 1`; faster clamps, never exceeds 1 |
| `MIN_DT_SECONDS` | `0.005` | below this, treat as a duplicate/non-monotonic timestamp |
| `MAX_DT_SECONDS` | `1.0` | above this, the gap is too large to trust as one instantaneous rate |
| `MAX_FRAME_DT_SECONDS` | `0.1` | caps one frame's smoothing step after a stalled tab |
| `IDLE_AFTER_SECONDS` | `0.5` | no fresh valid sample for this long → velocity target relaxes to 0 |
| `IMPULSE_FIRE_THRESHOLD` | `0.55` | speed01 level that counts as "substantial sudden movement" |
| `IMPULSE_REARM_THRESHOLD` | `0.3` | must drop below this before a new impulse can fire (hysteresis) |
| `IMPULSE_DECAY_RATE` | `6` | ~0.3 s to visually settle after a fired impulse |
| `DIRECTION_DEADBAND_MPS` | `0.03` | below this, report `direction: 0` ("not moving") instead of jitter |
| `POSITION_SMOOTH_RATE`, `VELOCITY_SMOOTH_RATE`, `ENERGY_RISE_RATE`, `ENERGY_DECAY_RATE` | tuned, documented inline | shape the "organic," non-jittery feel (§25–27); `ENERGY_DECAY_RATE` is deliberately several times smaller than `ENERGY_RISE_RATE` |

Values are conservative/documented rather than exact hardware spec — the
math (clamping, hysteresis, dt-bounding) is what makes bad input safe, not
the exact constant, so tuning any of these later is low-risk.

### 6.4 Test coverage (pure, no DOM) — maps directly to §29/§54

stationary samples (energy settles low, stillness rises); movement away vs.
toward (opposite sign of `direction`/`signedVelocity`); faster vs. slower
movement (greater `energy`); non-finite sample rejected (state unchanged, no
`NaN`/`Infinity` anywhere in the next `toArtSignal` projection); duplicate
timestamp (`dt <= 0`) does not explode/divide; irregular timestamps stay
stable; out-of-range position clamps to `0`/`1`; impulse fires on a
sustained fast sample run and does not re-fire on noisy dithering around the
threshold (hysteresis test with a synthetic oscillating sequence); impulse
debounces (two fast bursts closer together than the rearm condition allows
produce exactly one fire); `advanceArtSignal` alone (no new samples) decays
`energy`/`impulse` toward rest over simulated frame ticks; purity — the
input `MotionSample` object is never mutated (`Object.freeze` already
guarantees this at the source, but the reducer is asserted not to write to
it).

## 7. Effect contract (`src/art/art-types.ts`)

```ts
export interface ArtDimensions {
  readonly width: number;   // CSS pixels
  readonly height: number;  // CSS pixels
  readonly dpr: number;     // capped device pixel ratio actually applied
}

export interface ArtFrame {
  readonly elapsedSeconds: number;   // since this effect's reset()
  readonly dtSeconds: number;        // this frame's delta, already clamped
  readonly impulseTriggered: boolean; // true for exactly one rendered frame per debounced impulse
  readonly reducedMotion: boolean;
}

export interface ArtEffect {
  readonly name: string; // display label, e.g. "Neon Rings" — shown briefly on Change Effect
  reset(rng: SeededRandom): void;
  render(ctx: CanvasRenderingContext2D, frame: ArtFrame, signal: ArtSignal, dims: ArtDimensions): void;
  destroy?(): void;
}

export type ArtEffectFactory = () => ArtEffect;
```

`ArtFrame.impulseTriggered` exists so effects don't each reimplement edge
detection on a continuously-decaying `signal.impulse` value (which would
either miss the pulse or, worse, re-fire every frame it stays above some
per-effect threshold). `ArtEngine` is the single place that watches
`ArtSignalState.impulseSeq` (internal, not on the public `ArtSignal`) and
sets `impulseTriggered = true` for exactly the one frame after a bump.

Every effect **must** paint an opaque background across the full canvas
every frame (even a slow color fade counts) — see §12 (Kusama Dots) for why
this is a hard requirement, not a style choice.

Effects only use the `SeededRandom` passed into `reset()` — never
`Math.random()` directly (enforced by an architecture guard, §14) — so a
given seed reproduces a given effect's entire visual life deterministically,
including any per-frame jitter (the effect keeps its own reference to the
RNG stream from `reset()` and keeps pulling from it in `render()`).

Each effect owns its own hard caps as local constants (`MAX_PARTICLES`,
`MAX_RINGS`, `MAX_CONFETTI`, etc.) — the contract doesn't centralize this
because the natural cap differs per effect family; §32's six effects each
document their own cap inline.

## 8. `ArtEngine` (`src/art/art-engine.ts`)

Pure orchestration — receives a canvas 2D context and dimensions from the
screen, but does not itself touch `requestAnimationFrame`, resize
listeners, or pointer/keyboard events (those are the screen's job, §9). This
split is what keeps effect-selection/signal-drive logic unit-testable
without `jsdom`.

```ts
export interface ArtEngineOptions {
  readonly effects?: readonly ArtEffectFactory[]; // defaults to EFFECT_FACTORIES
  readonly randomSource?: () => number;           // defaults to Math.random; only used to pick seeds/effect indices, NEVER for rendering
  readonly seed?: number;                          // deterministic override for tests
}

export class ArtEngine {
  constructor(opts?: ArtEngineOptions);
  get activeEffectName(): string;
  onSample(sample: MotionSample): void;      // -> onArtSample
  tick(dtSeconds: number): ArtSignal;        // -> advanceArtSignal; returns the signal for this frame (screen doesn't need it directly, but it's useful for tests)
  render(ctx: CanvasRenderingContext2D, dims: ArtDimensions, reducedMotion: boolean): void; // builds ArtFrame + calls active effect.render
  changeEffect(): void;                       // picks a different family (never the same one when >1 exist), reseeds, resets
  destroy(): void;                            // calls active effect.destroy?.()
}
```

`tick` and `render` are separate calls (not fused) so a test can drive the
signal without a real canvas, and so the screen can call `tick` once per RAF
frame and `render` only when there's an actual 2D context to paint into.

Effect family selection is intentionally stable per §34: `changeEffect()` is
the only thing that swaps the active family; sensor motion and internal
per-effect randomness (via the effect's own `SeededRandom` stream) keep the
*current* effect alive and varied without ever silently switching families.

## 9. Screen / DOM binding (`src/screens/art-party-view.ts`)

```ts
export interface ArtPartyViewDeps {
  readonly controller: AcquisitionController;
  readonly navigate: (route: Route) => void;
}
export function mountArtPartyView(host: HTMLElement, deps: ArtPartyViewDeps): () => void;
```

### 9.1 DOM structure

```
.art-party                          (fills the immersive main — position: relative)
  canvas.art-party__canvas          (absolute, inset: 0)
  .art-party__overlay               (absolute, inset: 0, pointer-events: none on the wrapper;
                                      individual controls re-enable pointer-events)
    .art-party__status              sensor/system state text (no numbers)
    .art-party__actions             Connect / Sensor Ready / Start / Stop / Reconnect (from controller.uiState, same action set as acquisition-bar's model — see §5)
    .art-party__change-effect       button
    .art-party__exit                button, always present
    .art-party__effect-label        transient "NEON RINGS" label, fades after ~1.5s (§40)
```

### 9.2 Canvas lifecycle (§22, §47, §48)

- On mount: create the canvas, a `ResizeObserver` on `host` (falls back to a
  `window resize` listener if `ResizeObserver` is unavailable — not expected
  given the target browsers, but the guard is one line), and start a
  `createFrameScheduler()`-driven loop (the same scheduler primitive every
  other view already uses for its RAF work, `src/ui/raf.ts`) that
  re-schedules itself each frame:

  ```ts
  const loop = (): void => {
    const now = performance.now() / 1000;
    const dt = lastNow == null ? 0 : now - lastNow;
    lastNow = now;
    engine.tick(dt);
    engine.render(ctx, dims, reducedMotion);
    scheduler.schedule(loop);
  };
  scheduler.schedule(loop);
  ```

- Resize handler recomputes `dims` (`clientWidth`/`clientHeight` × capped
  `devicePixelRatio`, cap at `2`), sets `canvas.width`/`canvas.height` to the
  backing-store size, sets `canvas.style.width/height` to the CSS size, and
  calls `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` so drawing code always
  works in CSS pixels. This coordination (CSS size vs. backing-store size)
  is exactly what prevents old bitmap content from stretching grotesquely
  on resize (§47) — the canvas is fully repainted every frame anyway (§7's
  opaque-background requirement), so there's no stale bitmap to stretch in
  the first place.
- Teardown (returned closure, and also called if the route changes away):
  `scheduler.cancel()`, disconnect the `ResizeObserver`, remove pointer/
  keyboard listeners, remove the control-fade timer (§9.4), call
  `engine.destroy()`. Re-entering `#/art` creates one fresh `ArtEngine` and
  one fresh loop — nothing is module-level/singleton, so there is no
  possibility of a duplicate loop across mounts (§22/§48, tested directly —
  mount, teardown, mount again, assert exactly one `requestAnimationFrame`
  chain is alive via a fake scheduler in the test).

### 9.3 Sample flow / state gating

```
controller.subscribeSample(s => engine.onSample(s))
controller.subscribeRunComplete(() => {})   // no numeric display; RunStore autosave already happens via existing run-persistence.ts — untouched
controller.subscribeUiState(ui => renderOverlay(ui))
```

`renderOverlay` maps `controller.uiState` to the same primary-action shape
`acquisition-bar.ts` already uses (`model()` in that file) — Art Party does
not reinvent this mapping; it mirrors it locally (a shared helper would
create a two-way dependency between a "special mode" screen and the
classroom shell's status bar component, which is unnecessary coupling for
one small `switch`). The five states map to the five required minimal
controls from §16:

- `NO_DEVICE` → status "No sensor" + Connect.
- `SYSTEM_READY` → status "System Ready" + "Sensor Ready" (arm).
- `SENSOR_READY` (not yet measuring) → status "Sensor Ready" + Start; canvas
  shows the idle ambient render (§9.5).
- `MEASURING` → status recedes to near-invisible per the fade rules (§9.4);
  Stop stays available; canvas is fully sensor-responsive.
- `DEVICE_LOST` → status "Sensor disconnected" + Reconnect, canvas calms
  (§9.6); this control is exempt from fade (§9.4, "error/device-lost
  controls stay visible").
- `ERROR` → status "Sensor problem" + Reconnect, same fade exemption.

No numeric position/speed/velocity value is ever rendered anywhere in this
view — enforced by a view test asserting the overlay's `textContent` never
matches a bare number pattern beyond the effect name/label strings.

### 9.4 Control auto-fade (§17)

A single `visible: boolean` state on `.art-party__overlay` (toggled via a
CSS class, not `hidden`/removal — accessibility tree stays intact, opacity/
pointer-events only):

```css
.art-party__overlay { opacity: 1; transition: opacity 0.4s ease; }
.art-party__overlay--faded { opacity: 0; }
.art-party__overlay--faded :is(button, a) { pointer-events: none; }
```

Rules (implemented as one small reducer-ish function driven by events, kept
inside the screen file since it's DOM-event glue, not signal math):

- Default: visible.
- A 3s inactivity timer starts/resets on: pointer `move`, pointer `down`,
  `touchstart`, any overlay element receiving keyboard focus, and every
  `controller.uiState` change.
- Timer elapsing sets `visible = false` **only if** `controller.uiState`
  is currently `MEASURING` (successfully collecting) **and** nothing inside
  the overlay currently has focus. Any other state (idle, device-lost,
  error, connecting) keeps the overlay visible — matches "error/device-lost
  controls stay visible" and "connection/start action stays visible when
  required."
- Any of the trigger events above, or a state change out of `MEASURING`,
  sets `visible = true` and resets the timer.
- `Escape` forces `visible = true` (§42).
- Fading is `opacity`/`pointer-events` only — DOM nodes are never removed or
  given `display: none`/`hidden`, so focus and screen-reader semantics are
  unaffected; a `--faded` overlay's buttons are simply not hit-testable
  until visibility returns (no invisible focusable mystery buttons, §17).

### 9.5 Idle / Sensor Ready ambient render (§38)

Before `MEASURING`, the engine still runs `tick`/`render` every frame (so
the canvas is never blank/frozen), but `ArtSignal` is held at a fixed
low-energy rest value by simply never calling `engine.onSample` (no samples
arrive outside `MEASURING`, so the signal naturally sits wherever
`advanceArtSignal`'s idle decay settles it — `energy` decays to ~0,
`impulse` decays to 0, `position01` stays at its last value or `0.5` on
first mount). No special "idle mode" branch is needed in the engine; it
falls out of the same reducers used for the live state.

### 9.6 Device lost (§39)

On `DEVICE_LOST`/`ERROR`, the screen stops calling `engine.onSample`
(nothing new arrives from the controller anyway, since it only emits
samples while `MEASURING`) but keeps calling `engine.tick`/`render` every
frame — `advanceArtSignal`'s idle-after-0.5s decay takes over automatically
and the composition calms on its own, using the exact same mechanism as
"stand still" (§27), not a special code path. This directly satisfies "stop
using stale live motion as though it were current" and "smoothly calm the
canvas" without a bespoke device-lost branch in the render loop — one
mechanism, two triggers (nobody's moving vs. nobody's connected).

### 9.7 Reduced motion (§37)

`window.matchMedia('(prefers-reduced-motion: reduce)').matches`, read once
on mount and on the media query's `change` event, passed into
`engine.render(ctx, dims, reducedMotion)` as a plain boolean — never into
`ArtSignal` (it's a presentation concern, not sensor data). Each effect
reads `frame.reducedMotion` and scales its own speed/particle-count/burst
intensity down (documented per-effect in §32's file, not centralized,
because the right scale-down differs by effect family). This keeps the
signal layer's tests independent of `matchMedia`/DOM entirely.

### 9.8 Pointer / touch / keyboard (§42/§43)

Pointer `move` and `touchstart` on the canvas or overlay only ever restore
control visibility (§9.4) — they do not feed the art itself; the sensor is
the sole live input to `ArtEngine`. `Escape` reveals controls. No other
shortcuts are added (Space already toggles Start/Stop app-wide via
`installStartStopKey`, already installed once in `app.ts` and already
guarding against editable-field focus and native-Space-handling elements —
Art Party gets this for free by not intercepting `keydown` itself).

## 10. Randomness (`src/art/seeded-random.ts`)

A tiny deterministic PRNG (mulberry32), ~15 lines:

```ts
export interface SeededRandom {
  next(): number;              // [0, 1)
  range(min: number, max: number): number;
  int(minInclusive: number, maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
}
export function createSeededRandom(seed: number): SeededRandom;
```

`ArtEngine` owns one `SeededRandom` used only to (a) pick the initial effect
family and (b) pick each subsequent family on `changeEffect()`
(`randomSource`/`seed` overridable for tests, per §8). Each effect receives
its *own* freshly-seeded `SeededRandom` (derived from the engine's stream,
e.g. `createSeededRandom(engineRandom.int(0, 2**31))`) in `reset()`, and
that instance is the *only* randomness source the effect may use for the
rest of its life (palette pick, geometry variation, per-frame jitter) — see
the architecture guard in §14.

## 11. V1 effect families

All six from §32 of the parent prompt, one file each under
`src/art/effects/`, each keeping its own hard object-count cap as a local
`const MAX_* = <n>` and reading `frame.reducedMotion` to scale down
speed/count/burst intensity (not disable — §37 requires the experience stay
functional and sensor-responsive in reduced motion, never blank). None
implement a full-canvas flash: every "burst" (Neon Rings' ring emission,
Particle Burst's burst, Confetti Party's burst) is spatial (shapes/particles/
rings), never a full-canvas luminance flip, per the strobe-safety
requirement in §12 below. Palette selection per effect draws from the
family list in the parent prompt (§35) via the effect's seeded RNG.

Implementation notes are intentionally light here — the effect contract
(§7) and engine (§8) are what need to be nailed down before writing code;
each effect's internals are ordinary Canvas 2D drawing code against that
contract and don't carry cross-cutting design risk.

## 12. Strobe safety (§36)

Enforced two ways:

1. **By construction** — no effect ever fills the entire canvas with a
   single flat high-contrast color as its *only* action in a frame; every
   effect's opaque per-frame background paint (§7) is a smooth
   gradient/fade, never a hard flip, and bursts are spatially localized
   (rings/particles/confetti), not full-canvas.
2. **A machine-checkable guard where practical** — a test renders each
   effect for a simulated fast sensor burst sequence (via `ArtEngine`, no
   real canvas needed — Node's `canvas` isn't a dependency here, so this
   test uses a minimal recording 2D-context stub that just logs
   `fillRect`/`fillStyle` calls) and asserts no effect issues a
   full-canvas-opaque-fill in two consecutive rendered frames whose fill
   colors differ by a large luminance delta. This is a coarse guard against
   the worst case (accidental strobe), not a claim of full photosensitivity
   certification.

## 13. Home placement (§13/§50)

`src/ui/home/home-view.ts`'s `TOOLS` array (the six-tile grid) is
untouched. A second, visually distinct block renders below `.home-grid`:

```ts
const artControl = el(
  "div",
  { className: "home-special" },
  el("button", { className: "home-special__btn", onclick: () => deps.navigate("art") },
    el("span", { className: "home-special__mark", textContent: "✦" }),
    el("span", { className: "home-special__label", textContent: "Art Party" }),
  ),
  el("p", { className: "home-special__note", textContent: "Sensor-powered visuals" }),
);
```

CSS gives it a smaller footprint than a grid tile (no `.tile`/`.tile__name`
classes reused — a visually distinct, smaller shape is the point) using
existing semantic tokens (`--accent`, `--ink-dim`, `--s-*`, `--radius`) —
no new color values. A view test asserts: the grid still renders exactly
six `.tile` elements, the special control is a sibling of `.home-grid` (not
inside it), and it does not have the `tile`/`tile--disabled` class.

## 14. Architecture guards (new, alongside the existing ones in `tests/architecture.test.ts`)

Using the same raw-source-scan technique already established in that file:

- Nothing under `src/art/` or `src/screens/art-party-view.ts` mentions
  `navigator.hid`.
- Nothing under `src/art/` imports `GoMotionWebHIDAdapter` or any
  `sensor/(hid|go-motion-protocol|go-motion-webhid)` module.
- Nothing under `src/art/` mentions `indexedDB`/`IDBDatabase` or imports the
  IndexedDB run-store implementation.
- Nothing under `src/art/effects/` calls `Math.random(` directly (they must
  route through the injected `SeededRandom`).
- `src/model/art-signal.ts` joins the existing `PURE` list (no `document`,
  no `from ".../ui/"` import).

## 15. Portable build compatibility (§60)

Nothing in this design introduces a remote asset, a new build tool, or a
runtime dependency — it's TypeScript + Canvas 2D against existing DOM/CSS
infrastructure, so `npm run build:portable`'s existing inlining pipeline
requires no changes. Portable-build assertions to add:

- The built single-file HTML contains the Art Party route's reachable code
  (a light substring/structural check consistent with how the existing
  portable tests verify other routes — not matching on minified
  identifiers).
- No new `<script src="http...">`/`<link href="http...">` appears.
- Exactly one output file, as today.

## 16. Self-review

Checked against the parent prompt's explicit self-review list (§52):

- **Contradictions**: none found. The one place two prompt requirements
  could appear to pull against each other — "no full classroom header" vs.
  "sensor state must remain understandable and controllable" — is resolved
  by moving the *same* required controls into the route's own overlay
  rather than dropping any of them (§9.1/§9.3).
- **Unbounded arrays**: every effect's particle/ring/confetti-piece array is
  capped by a local `MAX_*` constant (§11); the engine and signal layer
  hold no arrays that grow with sample count (each sample only updates a
  fixed-shape state object, never appends).
- **Duplicated acquisition**: verified against §5 and enforced by the
  architecture guard in §14 — one controller, one adapter, no second
  polling loop; Art Party is a second *subscriber*, never a second
  *acquirer*.
- **Hidden remote dependency**: none — Canvas 2D and existing DOM/CSS only;
  no new npm dependency is introduced by this design.
- **Unclear lifecycle**: §9.2 pins down create/resize/teardown and
  guarantees re-entry doesn't duplicate the RAF loop (module-level state
  free — a fresh `ArtEngine` and closures per mount).
- **Incorrect persistence assumptions**: confirmed RunStore autosave
  (`startRunPersistence`, subscribed once in `app.ts`) already saves any
  completed run regardless of which route was open when it completed —
  Art Party changes nothing there and adds no Art-specific storage (§21).
- **Accessibility holes**: control fade is opacity/pointer-events only,
  never node removal (§9.4); focused/error/device-lost controls are
  exempted from fading; Exit and Change Effect are always in the a11y tree.

No open questions block implementation. The one deliberately-approximate
area is the exact tuning constants in §6.3 — documented as tunable rather
than derived from a hardware datasheet, which is appropriate for a V1
creative mode where "feels right" is a legitimate acceptance bar the human
will apply during physical hardware testing (§62 of the parent prompt).
