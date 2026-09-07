# Motion World Web — Milestone 2 Design

**Date:** 2026-09-07 · **Human-approved.** Builds on M1 + M1.5 + the portable
build. **Parent spec:** `docs/superpowers/specs/2026-09-06-motion-world-web-v1-design.md`.
This resolves architecture; it does not re-open the approved product decisions.

Two parts:
- **A** — a bounded Walk the Line enhancement: a **movable target position**.
- **B** — the substantial infrastructure: **persistent local Runs** (IndexedDB
  + fallback) and an **immutable `AnalysisWindow`** — the foundation Snapshot Lab
  will consume next.

## Locked constraints (all of M2 must satisfy)

- **Portability is permanent.** `npm run build` (→ `dist/`) and
  `npm run build:portable` (→ `dist-portable/MotionWorld.html`, one file) both
  work after M2. No CDN, no remote fonts/JS, no runtime API, no backend, no
  accounts, no network dependency for ordinary lab operation. **IndexedDB is
  allowed** — it is browser-local. The app must remain functional offline.
- No lab/view touches IndexedDB directly — only the persistence layer.
- No lab/view touches WebHID — only `src/sensor/`.
- `MotionRun` stays immutable; raw normalized samples are the durable truth.

---

# PART A — Walk the Line: movable target

## A1. Model — offset, not mutation

`WALK_TARGETS` and every `points` array stay **immutable**. Movement is a display
offset applied at render:

```
displayedPosition = canonicalPosition + offsetMeters
```

Shape, timing and slopes are unchanged. Each target has its **own** offset for
the session; switching away and back restores it. **No persistence** for offsets.

**New pure helpers in `src/model/walk-target.ts`:**

```ts
export const DISPLAY_MIN_METERS = 0.5;
export const DISPLAY_MAX_METERS = 3.5;

isFlat(target): boolean                       // all canonical positions equal
canonicalYRange(target): [min, max]
offsetLimits(target): { min: number; max: number }   // legal offset so every
  // displayed point ∈ [DISPLAY_MIN, DISPLAY_MAX]; empty range -> {min:x, max:x}
clampOffset(target, desired): number          // desired clamped into offsetLimits
displayedPoints(target, offset): readonly TargetPoint[]   // canonical + offset (pure)
targetOffsetLabel(target, offset): string     // flat: "Target height: 2.0 m"
  //                                              non-flat: "Target shift: +0.5 m"
```

**Session offset store** — `src/ui/walk/target-offsets.ts`, a small class
(`TargetOffsets`) holding `Map<id, number>`: `get(id) -> 0` default,
`set(id, m)`, `reset(id)`. **One instance built in the composition root
(`app.ts`)** and passed to the Walk view, so it survives view remounts without
module-global state. Not persisted.

## A2 / A3. Two adjustment methods

**Precision buttons** — `[ − 0.5 m ]  <offset label>  [ + 0.5 m ]` and
`RESET POSITION`. Each ± moves the whole target by exactly 0.5 m (then
`clampOffset`). Keyboard-accessible (real `<button>`s). Disabled at the legal
extreme (`offset === offsetLimits.min` / `.max`) and while `MEASURING`.

**Direct vertical drag** — Pointer Events on a **generous invisible hit region**
along the target path (transparent wide stroke; visible stroke unchanged).
Continuous (not stepped). `pointerdown` → the view calls
`chartHost.setPointerCapture(pointerId)` (the host `<div>` persists across chart
redraws) and listens for `pointermove` / `pointerup` on it. Only **Y** changes;
X/time never moves. On release: optional snap to the nearest 0.1 m.
Live label updates to ~0.1 m precision while dragging.

## A4. Safe range / clamping

`offsetLimits(target)` = `[DISPLAY_MIN − canonicalMin, DISPLAY_MAX − canonicalMax]`.
Every displayed point stays in `[0.5, 3.5]`. A target already touching 3.5 m
can't shift up. The shape is **never distorted** to fit — only translated, then
clamped. ± buttons disable at limits.

## A5. Axes stay fixed

Walk the Line already passes explicit `xDomain: [0, durationSeconds]`,
`yDomain: positionRange`. **The y-domain does not change with the offset** — the
pedagogical point is seeing the same shape translated within one coordinate
system. (If a large offset pushes the target near an edge, that's the intended
visual.) Student trace stays in physical metres.

## A6. Lock while measuring

While `MEASURING`: drag disabled, ±0.5 disabled, Reset disabled (Previous / Next
/ Change Target already disabled). After `STOP` they return. **Run Again** keeps
the current offset. **Changing target** restores that target's own session offset.

## A7. Chart geometry (no coordinate math in the view)

`src/ui/chart/time-series-chart.ts` gains:
- `ChartInput.onTargetPointerDown?: (e: PointerEvent) => void` — wired to the
  invisible hit path each render.
- `ChartHandle.yGeometry(): YGeometry | null` — `{ domain: [lo,hi], pixelTop,
  pixelBottom }` from the last render.
- pure exports `metresPerPixelY(g)` and `pixelYToMetres(g, py)` (via `makeScale`
  inverse). **Unit-tested.** The Walk view does no raw pixel↔metre arithmetic.

## A8. Walk tests

Canonical data never mutated; displayed = canonical + offset; Stand Still moves
vertically; slope/piecewise shape unchanged after translation; independent
per-target offsets; +0.5 / −0.5 / reset; clamp; buttons disabled at extremes;
locked while measuring; drag changes only Y (X/times unchanged); Run Again keeps
offset; target switch restores offsets; chart y-domain unchanged by offset;
geometry conversion.

---

# PART B — Local Runs

## B1. `RunStore` boundary — `src/store/`

```ts
export interface RunStore {
  readonly kind: "indexeddb" | "memory";
  save(run: StoredRun): Promise<void>;              // put (overwrite by id)
  get(id: string): Promise<StoredRun | null>;
  listSummaries(): Promise<readonly StoredRunSummary[]>;   // newest-first
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}
```

- **`MemoryRunStore`** — a `Map`; sorts summaries by `savedAtEpochMs` desc.
  Test double **and** the graceful fallback.
- **`IndexedDbRunStore`** — native IndexedDB, no library. `openRunStore()` async
  factory; rejects if IDB is absent or the open fails.
- **`createRunStore()`** — try `openRunStore()`, on any failure return
  `new MemoryRunStore()`. Built once in `app.ts`.
- Views receive a `RunStore`; they never import `indexeddb-run-store.ts`.

## B2 / B3. `StoredRun` schema — `src/model/stored-run.ts`

```ts
export const RUN_SCHEMA_VERSION = 1;

export interface StoredSample { readonly t: number; readonly x: number; }  // exact, unrounded

export interface StoredRun {
  readonly schemaVersion: number;      // RUN_SCHEMA_VERSION
  readonly id: string;
  readonly savedAtEpochMs: number;
  readonly startedAtEpochMs: number;
  readonly durationSeconds: number;
  readonly sampleCount: number;
  readonly samplerHz: number;
  readonly source: MotionRunSource;    // "sensor" | "fake" | "replay" | "synthetic"
  readonly deviceLabel: string | null;
  readonly stopReason: StopReason;     // "ui" | "trigger" | "navigation" | "device_lost" | "error" | null
  readonly interrupted: boolean;       // stopReason ∈ {navigation, device_lost, error}
  readonly samples: readonly StoredSample[];
}

serializeRun(run: MotionRun, savedAtEpochMs?): StoredRun    // pure
deserializeRun(stored: StoredRun): MotionRun                // pure; rebuilds the
  // frozen MotionRun via makeMotionSample + makeMotionRun — NOT an editable substitute
summarizeStored(stored: StoredRun): StoredRunSummary
```

- **`MotionRun` gains `stopReason: StopReason`** (additive; `makeMotionRun` takes
  it, defaults `null`). `AcquisitionController.finishRun()` passes
  `this.snap.lastStopReason`. This removes the need for a separate meta channel.
- No rounding of samples for storage. No HID packets. No diagnostic logs.
- `schemaVersion` is explicit; no migration engine in V1, but future migration
  is possible (a `migrateStoredRun` stub can be added when v2 exists).

## B4 / B5. Persistence coordinator — save exactly once, centrally

`src/store/run-persistence.ts`:

```ts
startRunPersistence(controller, store, { onSaved?, onError? }): Unsubscribe
```

- Subscribes **once** to `controller.subscribeRunComplete` — built once in
  `app.ts`, never per-view. Views never save.
- Guards with a `Set<runId>` so a run is saved **exactly once** regardless of
  route remounts or (hypothetical) double-emits.
- **Every** completed/frozen `MotionRun` is retained — ordinary `STOP`,
  `navigation`, `device_lost`. The `stopReason` rides on the run and into
  `StoredRun` so Runs can flag interrupted ones. **Partial runs are never
  auto-deleted.**
- `store.save(...)` rejection is caught → `onError` (a log line) → **acquisition
  is not affected**; the app does not crash.

## B6. IndexedDB specifics

DB `motion-world`, `version: 1`, one object store `runs` keyed by `id`
(in-line key). No secondary index — for classroom scale, `getAll()` + sort by
`savedAtEpochMs` desc is fine. `onupgradeneeded` creates the store.
`schemaVersion` on each record is separate from the IDB `version` and enables a
future record-level migration.

## B7. Durable-storage request

On first successful save (or app start), best-effort:
`navigator.storage?.persisted()` then `navigator.storage?.persist()`. Result
shown honestly **only in Runs / help**, never on Home. Teacher copy:
**"Runs are stored on this device."** Help line: "Runs can be lost if the
browser or site data is cleared." No scary storage essay.

## B8. `file://` / portable behavior

`createRunStore()` tries IndexedDB; if it's unavailable or fails under `file://`,
falls back to **`MemoryRunStore`** — the app still loads, Runs still works for
the session. Runs shows a restrained banner: **"Temporary storage — runs will be
lost when this page closes."** No crash, no local-server requirement.

---

# PART C — Runs interface

**Secondary utility, not a Home tile.** A **"Runs"** link in the persistent
header (with the wordmark / dev Diagnostics link).

## C1. Runs list — `#/runs`

Newest first. Each row: saved date/time · duration · sample count · an
**"interrupted"** chip when `stopReason ∈ {navigation, device_lost, error}` ·
source only if `fake` (say "demo"). Actions per row: **View**, **Delete**
(confirm inline). **Clear All Runs** — **two-step** (button → "Really clear N
runs? [Clear] [Cancel]"), never one-click.

## C2. Empty state

**"NO SAVED RUNS YET"** · "Completed collections will appear here automatically."

## C3. Run detail — `#/run/<id>`

`deserializeRun` → a **position-vs-time graph** (reuses the chart, auto domains)
+ duration · sample count · saved date/time · complete/interrupted state.
**Viewable with no sensor connected** — never touches WebHID. Instantiates a
full `AnalysisWindow` internally; a tiny start/end nudge demo appears only under
`?debug=sensor` (D4). No Snapshot transform, no fitting, no point drawer.

## C4. Delete

One run, with confirmation. After delete/clear: update the list in place — **no
app reload**.

---

# PART D — `AnalysisWindow` — `src/model/analysis-window.ts` (pure)

```ts
export interface AnalysisWindow {
  readonly runId: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

fullWindow(run): AnalysisWindow            // [first t, last t]; may be degenerate (start==end) for a 0/1-sample run
withStart(w, run, s): AnalysisWindow       // clamp s ∈ [runStart, endSeconds); if run too short, unchanged
withEnd(w, run, e): AnalysisWindow         // clamp e ∈ (startSeconds, runEnd]
withRange(w, run, s, e): AnalysisWindow    // clamp both, enforce s < e where possible
useAll(w, run): AnalysisWindow             // = fullWindow(run) with same runId
windowDurationSeconds(w): number           // end - start (>= 0)
windowContains(w, t): boolean              // start <= t <= end   (INCLUSIVE both ends — documented)
activeSamples(w, run): readonly MotionSample[]   // samples with start-ε <= t <= end+ε; NO resampling, NO interpolation
```

**D2 range rules:** `runStart ≤ start`, `start < end` (except a degenerate full
window on a run with < 2 distinct timestamps), `end ≤ runEnd`. All inputs
clamped; **never** NaN/Infinity. Works with **irregular** timestamps (no 40 ms
assumption). **D3 boundary:** start-inclusive, end-inclusive, with a tiny float
epsilon. **The `MotionRun` is never touched** (asserted: frozen + deep-equal
before/after).

---

# PART E — App / navigation

Persistent header: **Motion World** (Home) · **Runs** · *Diagnostics* (debug
only). One app-lifetime `AcquisitionController`. Going to Runs / a run detail
**does not** reconnect USB, build another controller, or require a sensor. If
`MEASURING` when navigating away → existing `stopForNavigation()` (the run is
then auto-saved by the coordinator with `stopReason: "navigation"`).

Router gains `runs` and `run` (with an `id` param parsed from `#/run/<id>`).

---

# PART F — Portability contract (LOCKED)

Both builds work after M2. `dist-portable/MotionWorld.html` stays **exactly one
runtime file**, no CDN / remote fonts / remote JS / runtime API / fetched
assets. IndexedDB (browser-local) is fine. `MemoryRunStore` fallback keeps the
portable file working when IDB behaves differently under `file://`. The portable
artifact test additionally asserts the runs code is bundled and no network
asset was introduced.

---

## Module map (new)

```
src/
  model/
    stored-run.ts        StoredRun schema + serialize/deserialize/summarize
    analysis-window.ts   pure AnalysisWindow
    walk-target.ts       (+ displayedPoints / clampOffset / offsetLimits / labels)
    motion-run.ts        (+ stopReason field)
  store/
    run-store.ts             RunStore interface + StoredRunSummary
    memory-run-store.ts      MemoryRunStore
    indexeddb-run-store.ts   IndexedDbRunStore + openRunStore()
    create-run-store.ts      createRunStore() with fallback
    run-persistence.ts       startRunPersistence() coordinator
  ui/
    walk/target-offsets.ts   TargetOffsets session store
    runs/runs-list-view.ts
    runs/run-detail-view.ts
    chart/time-series-chart.ts   (+ onTargetPointerDown, yGeometry, geometry exports)
  acquisition/acquisition-controller.ts   (finishRun passes stopReason)
```

Views consume `RunStore` / `AcquisitionController` / pure models only.

---

## Self-review

- **Portability preserved** — only browser-local IDB added; `MemoryRunStore`
  fallback; portable artifact test extended. §F.
- **Canonical Walk targets immutable** — offset is a render-time translation;
  `displayedPoints` is pure; a test asserts `WALK_TARGETS` deep-equal before/after
  a full session of moves. §A1/A8.
- **Axes fixed under offset** — y-domain still comes from `positionRange`, never
  from the offset. §A5.
- **One save per run** — a single coordinator subscription in `app.ts` + a
  `Set<id>` guard; views never save; `stopForNavigation` runs still saved. §B4/B5.
- **`MotionRun` immutability end-to-end** — `deserializeRun` rebuilds via
  `makeMotionRun` (frozen); `AnalysisWindow` never mutates the run;
  `StoredRun` is a plain DTO, not an editable substitute. §B3/D.
- **No lab imports IDB / WebHID** — enforced by the existing
  `tests/architecture.test.ts` (extended: `src/store/` only for IDB;
  `src/sensor/` only for WebHID; views may import `run-store.ts` the interface
  but not `indexeddb-run-store.ts`).
- **Runs is a utility, not a 7th tile** — header link, `#/runs`; Home stays 6
  tiles. §C.
- **Honest storage language** — "Runs are stored on this device"; the "temporary
  storage" warning only on the memory-fallback path; nothing on Home. §B7/B8.
- **No Snapshot work** — `AnalysisWindow` is pure model only; the run detail
  uses `fullWindow` and (debug-only) a start/end nudge; no transform / fit /
  drawer. §D4.
- Contradiction check: "persist runs" vs "no backend / offline" — resolved:
  IndexedDB is local storage, not a service. "movable target" vs "fixed axes" —
  resolved: the offset translates the curve *within* the fixed coordinate system.
