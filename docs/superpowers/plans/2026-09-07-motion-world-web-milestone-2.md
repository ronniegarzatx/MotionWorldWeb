# Milestone 2 — Movable Walk Target + Local Runs + AnalysisWindow — Plan

**Date:** 2026-09-07 · **Design:**
`docs/superpowers/specs/2026-09-07-motion-world-web-milestone-2-design.md`
Builds on M1 / M1.5 / portable build (HEAD `adcf53e`). **216 tests stay green.**
TDD every task. Both `npm run build` and `npm run build:portable` stay green.

Not building: Snapshot Lab, classroom transform, model fitting, point drawer.

---

## Task 1 — `motion-run.ts`: `stopReason` field (additive)

- Tests: `makeMotionRun` accepts `stopReason`, defaults `null`, stays frozen;
  existing run tests unaffected.
- `AcquisitionController.finishRun()` passes `this.snap.lastStopReason`.
- Controller test: a device-lost run's `MotionRun.stopReason === "device_lost"`;
  a UI stop → `"trigger"` (fake adapter path) / navigation → `"navigation"`.
- **Commit:** `feat(model): MotionRun carries its stop reason`.

## Task 2 — `model/analysis-window.ts` (pure)

- **Tests first** (`tests/model/analysis-window.test.ts`):
  full window; `withStart`/`withEnd`/`withRange` clamp into
  `[runStart, runEnd]` and keep `start < end`; `useAll`; `windowContains`
  inclusive both ends; `activeSamples` start+end inclusive with an epsilon;
  irregular timestamps; degenerate run (0/1 sample) → valid full window, no
  NaN/Infinity; **the `MotionRun` is frozen and deep-equal before/after every
  op**; `windowDurationSeconds` ≥ 0.
- Implement pure functions.
- **Commit:** `feat(model): immutable AnalysisWindow foundation`.

## Task 3 — `model/stored-run.ts` (pure serialize/deserialize)

- **Tests first** (`tests/model/stored-run.test.ts`):
  `serializeRun` → `schemaVersion === 1`, exact `{t,x}` samples (no rounding —
  feed awkward floats and assert identity), `stopReason` carried, `interrupted`
  derived; `deserializeRun` → a **frozen** `MotionRun`, `Object.isFrozen`,
  samples frozen, round-trips `serialize→deserialize→serialize` byte-identical;
  `summarizeStored` fields; a run with `stopReason: null` → `interrupted: false`.
- Implement via `makeMotionSample` + `makeMotionRun`.
- **Commit:** `feat(model): versioned StoredRun serialization`.

## Task 4 — `store/run-store.ts` + `store/memory-run-store.ts`

- **Tests first** (`tests/store/memory-run-store.test.ts`):
  save/get/list/delete/clear; `get` unknown → null; overwrite by id;
  `listSummaries` **newest-first** by `savedAtEpochMs`; `clear` empties;
  `kind === "memory"`.
- Implement.
- **Commit:** `feat(store): RunStore interface + MemoryRunStore`.

## Task 5 — `store/indexeddb-run-store.ts` + `create-run-store.ts`

- devDependency: **`fake-indexeddb`** (test-only; native IDB is absent in
  Node/jsdom — justified, standard).
- **Tests first** (`tests/store/indexeddb-run-store.test.ts`, `import
  "fake-indexeddb/auto"`):
  same CRUD contract as MemoryRunStore; **close + reopen the store → data
  remains**; `onupgradeneeded` creates the `runs` store (fresh DB works);
  `openRunStore()` rejects when `indexedDB` is undefined →
  `createRunStore()` returns a `MemoryRunStore` (kind check).
- Implement native IDB with promise wrappers; DB `motion-world` v1, store `runs`,
  in-line key `id`, `getAll()` + sort desc for summaries.
- **Commit:** `feat(store): IndexedDbRunStore + createRunStore fallback`.

## Task 6 — `store/run-persistence.ts` (coordinator)

- **Tests first** (`tests/store/run-persistence.test.ts`, `FakeSensorAdapter` +
  real `AcquisitionController` + `MemoryRunStore`):
  one completed run → **exactly one** `store.save`; three runs → three saves,
  distinct ids; a device-lost partial run **is saved** with
  `stopReason: "device_lost"`, `interrupted: true`; a `stopForNavigation` run is
  saved with `"navigation"`; **`store.save` rejecting does not throw out of the
  controller** and `onError` fires; the same run id is never saved twice (Set
  guard) even if `subscribeRunComplete` is driven twice.
- Implement `startRunPersistence(controller, store, opts)` → `Unsubscribe`.
- **Commit:** `feat(store): central run-persistence coordinator`.

## Task 7 — `walk-target.ts` offset helpers + `ui/walk/target-offsets.ts`

- **Tests first**:
  `isFlat`; `canonicalYRange`; `offsetLimits` (Stand Still wide; a 3.5-m target
  can't go up); `clampOffset`; `displayedPoints` = canonical + offset, **times
  and slopes identical** (compute slope of each segment before/after);
  `WALK_TARGETS` deep-equal before/after a batch of `displayedPoints` calls;
  `targetOffsetLabel` (flat "Target height: 2.0 m"; non-flat "Target shift:
  +0.5 m" / "−0.5 m"); `TargetOffsets` get(default 0)/set/reset, independent
  per id.
- Implement.
- **Commit:** `feat(model): Walk target display-offset helpers + session store`.

## Task 8 — chart: `onTargetPointerDown`, `yGeometry`, geometry exports

- **Tests first** (`tests/ui/time-series-chart-geometry.test.ts`):
  `yGeometry()` null before first render, then `{ domain, pixelTop, pixelBottom }`
  reflecting the last `yDomain`; pure `metresPerPixelY(g)` and `pixelYToMetres(g,
  py)` map endpoints correctly (bottom pixel → domain lo, top pixel → domain hi);
  `onTargetPointerDown` fires a `pointerdown` on the invisible `.target-hit`
  path; the visible `.target` stroke width is unchanged; existing chart +
  chart-target tests still pass.
- Implement (invisible wide hit path with `pointer-events: stroke`; store the
  last Y geometry; wire the callback each render).
- **Commit:** `feat(ui): chart target hit region + Y geometry accessors`.

## Task 9 — Walk the Line view: movable target

- **Tests first** (extend `tests/ui/walk-the-line-view.test.ts`):
  `[ −0.5 ] [ label ] [ +0.5 ]` + `RESET POSITION` render; +0.5 raises the
  displayed target path (compare a sample y in the `.target` `d` before/after) by
  ~0.5 m worth of pixels; −0.5 lowers; reset → offset 0; label text (flat vs
  non-flat); ± disabled at `offsetLimits`; **all four disabled while MEASURING**,
  re-enabled after Stop; a simulated `pointerdown`+`pointermove`+`pointerup` on
  the hit path changes the offset and **only Y** (the `.target` `d` x-coords
  unchanged; the target's `t` values unchanged); **chart `yGeometry().domain`
  unchanged by any offset**; Run Again keeps the offset; switching target and
  back restores each target's offset; `mountWalkTheLineView` now takes
  `{ controller, offsets }`.
- Implement. Drag: `chartHost.setPointerCapture` + `pointermove`/`pointerup` on
  the host; `metresPerPixelY(chart.yGeometry())` for the delta; `clampOffset`;
  snap to 0.1 on release. Offsets via the injected `TargetOffsets`.
- **Commit:** `feat(ui): Walk the Line — movable target (drag + ±0.5 + reset)`.

## Task 10 — router: `runs` + `run/<id>`

- **Tests first** (`tests/app/router.test.ts`): `#/runs` → `{ route: "runs" }`;
  `#/run/abc-123` → `{ route: "run", param: "abc-123" }`; unknown → home;
  `routeFromHash` return shape change threaded through `createRouter`.
- Implement (`routeFromHash` returns `{ route, param? }`).
- **Commit:** `feat(app): routes for Runs list + run detail`.

## Task 11 — `ui/runs/runs-list-view.ts` + `run-detail-view.ts`

- **Tests first** (`tests/ui/runs-list-view.test.ts`, `run-detail-view.test.ts`,
  jsdom + `MemoryRunStore`):
  **empty** → "NO SAVED RUNS YET" + the one-liner; **populated** → newest-first
  rows with date / duration / sample count; an **interrupted** run shows the
  chip; **View** navigates to `#/run/<id>`; **Delete** (confirm) removes the row
  in place, no reload; **Clear All** is two-step (first click arms, second
  clears); `kind: "memory"` store → the "Temporary storage…" banner shows;
  detail view renders a chart with the run's sample count of vertices + duration
  + saved date + interrupted state, **with no controller / no sensor**; a
  full `AnalysisWindow` is created and its duration shown.
- Implement.
- **Commit:** `feat(ui): Runs list + saved-run detail`.

## Task 12 — wire it: `app.ts` + shell + persistence + storage request

- `app.ts`: `const store = await createRunStore()` (or sync build + async open —
  keep boot non-blocking: start with `MemoryRunStore`, swap in IDB when
  `openRunStore()` resolves, OR just `await` a fast open — decide: **await**, it's
  ~1 ms); build `TargetOffsets`; `startRunPersistence(controller, store, { onError:
  log })` once; best-effort `navigator.storage?.persist()`.
- `shell.ts`: a **"Runs"** header link (always visible; secondary styling).
- `mountRoute`: `runs` → `mountRunsListView({ store, navigate, storageKind })`;
  `run` → `mountRunDetailView({ store, runId: param, navigate })`.
- Nav-away guard already covers tool→anywhere; Runs never needs the controller.
- **Tests** (`tests/app/app.test.ts` additions): `#/runs` mounts the list with
  the shared store; a completed fake run then `#/runs` shows it (persistence
  coordinator ran); navigating to `#/runs` does **not** call `adapter.connect`
  / build a 2nd controller; `#/run/<id>` mounts detail; storage failure →
  `MemoryRunStore` + banner, app still boots.
- **Commit:** `feat(app): Runs navigation, persistence coordinator, storage request`.

## Task 13 — architecture guard + portable + docs + audit

- Extend `tests/architecture.test.ts`: nothing outside `src/store/` imports
  `indexeddb-run-store` or mentions `indexedDB`/`IDBDatabase` (except
  `src/store/`); views may import `run-store.ts` (the interface) but not the IDB
  impl.
- Extend `tests/portable/artifact.test.mjs`: the bundle contains `motion-world`
  (the DB name) / `MemoryRunStore` — runs code is in the single file; still one
  runtime file; no new network asset.
- `docs/research/milestone-2-projector-audit.md` — manual checklist (5 widths ×
  Home / Walk default / Walk shifted / Walk dragging / Walk at limit / Walk
  collecting / Runs empty / Runs populated / Runs interrupted / Run detail /
  storage-fallback banner).
- README: tools (Live / Data Display / Walk the Line), utility (Runs), coming
  next (Snapshot / Speed / Sequence); `build` + `build:portable`; honest local-
  run storage language.
- **Commit:** `test+docs: M2 architecture guard, portable check, audit, README`.

## Task 14 — verify + deploy + report

`npm ci` · `npm test -- --run` · `npx tsc --noEmit` · `npm run build` ·
`npm run build:portable` · `npm audit` · `git diff --check`. Preview smoke
(`?fake`: run → Runs shows it → refresh → still there via IDB; open a run
detail; drag a Walk target). Push `main`, watch Pages, verify the live URL.
`docs/research/milestone-2-ready.md` + the final report.

---

## Risks / notes

- **Pointer Events in jsdom**: `PointerEvent` / `setPointerCapture` exist in
  jsdom 25 but are partial. Tests dispatch `new MouseEvent("pointerdown", …)` /
  `PointerEvent` with `clientY`; `setPointerCapture` is a no-op stub — fine, the
  view guards it with `if (typeof host.setPointerCapture === "function")`.
- **`fake-indexeddb`** is devDependency only — never imported by `src/`. The
  portable bundle uses the browser's native IndexedDB.
- **Boot ordering**: `createRunStore()` is `await`ed before mounting so Runs and
  the coordinator have a real store; the unsupported-WebHID path still boots.
- Keep every existing test. `SOFTWARE VERIFIED` vs `HARDWARE VERIFIED` stays.

## Self-review

Spec coverage: A1–A8 (Tasks 7–9), B1–B8 (Tasks 3–6, 12), C1–C4 (Tasks 10–11),
D1–D3 (Task 2), E (Tasks 10, 12), F (Task 13), G (every task), H (Task 13),
J (Task 13). One `RunStore` interface; one coordinator; one `TargetOffsets`
instance; router return-shape change threaded once. No placeholders — every task
names files, cases, a commit.
