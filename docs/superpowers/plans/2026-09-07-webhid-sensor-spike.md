# Milestone Zero — WebHID Sensor Spike — Implementation Plan

**Date:** 2026-09-07
**Spec:** `docs/superpowers/specs/2026-09-06-motion-world-web-v1-design.md` (approved),
especially §4 (sensor boundary), §5 (acquisition state), §15 (feasibility spike),
§15.5 (pairing/reconnect/secure-context contract).
**Protocol research:** `docs/research/go-motion-webhid-protocol.md`.
**Scope:** ONLY the sensor feasibility spike. No five-tool Home, no labs, no
polished graphs, no IndexedDB, no theming. Ugly-but-useful diagnostic page.

## Purpose

Answer one question on the user's Windows work PC with a real CBR 2 / Go!Motion:

> Can current Chrome / Edge directly operate this actual Vernier CBR 2 / Go!Motion
> reliably enough for Motion World — no native helper, no driver install, no
> Python, no local server, no backend?

The software half of Milestone Zero: build a small, correct, tested browser app
that is ready to carry to that PC and that captures enough diagnostics for the
physical test to be conclusive (including if it *fails*).

## Hard constraints (from the spec — do not violate)

- No native helper, no Python service, no local web server for deployed use, no
  driver installer, no account/backend, no telemetry, no remote data.
- No React / Vue / Svelte / Pyodide / SciPy / backend framework.
- Strict TypeScript. Minimal dependencies. Focused modules, not one big `main.ts`.
- WebHID calls live **only** inside `src/sensor/go-motion-webhid.ts`. UI event
  handlers never touch HID reports.
- The native repo `/Users/sine/Desktop/GoIO_SDK` is READ-ONLY protocol reference.
- Do **not** create or push a GitHub repo / remote. Local commits only.

## Success criteria (software, before the Windows test)

- [ ] `npm ci` reproducible from `package-lock.json`
- [ ] `npm run typecheck` (`tsc --noEmit`, strict) clean
- [ ] `npm run lint` clean (if lint configured)
- [ ] `npm test` — all green
- [ ] `npm run build` — clean production build
- [ ] `FakeSensorAdapter` drives the full state machine in tests
- [ ] unsupported-browser flow rendered + tested
- [ ] permission-cancel flow modelled + tested
- [ ] device-lost flow modelled + tested
- [ ] bounded diagnostic log + bounded raw-report ring verified by test
- [ ] no backend, no forbidden deps, native repo untouched (`git -C … status` clean)
- [ ] a browser smoke screenshot of the spike with `FakeSensorAdapter`

---

## Architecture (locked by the spec, refined here)

```
src/
  main.ts                     wiring only: capability check → build adapter → build controller → mount view

  sensor/
    types.ts                  SensorStatus, MotionSample re-export, TriggerEvent, SensorError, Unsubscribe, SensorAdapter
    sensor-adapter.ts         SensorAdapter interface + tiny typed emitter helper (no HID)
    hid.ts                    NARROW structural interfaces over WebHID (HidLike, HidDeviceLike, HidInputReportEventLike) — the only file that names navigator.hid
    go-motion-protocol.ts     PURE codec: command encoders + report decoders + micron→metre scaling. No I/O. Byte-fixture tested.
    go-motion-webhid.ts       THE ONLY production module that does HID I/O. Implements SensorAdapter using hid.ts + go-motion-protocol.ts
    hid-diagnostics.ts        pure: HIDDevice metadata → structured, copyable text report
    fake-sensor-adapter.ts    implements SensorAdapter with scripted samples/triggers/lost; for dev + tests (not "webhid verified")

  acquisition/
    acquisition-state.ts      pure state machine: states + transition function + guards (canArm/canStart/canStop). No adapter refs.
    acquisition-controller.ts owns ONE adapter, subscribes to it, drives acquisition-state, exposes AcquisitionUiState + sample stream + run completion

  model/
    motion-sample.ts          makeMotionSample(): frozen { timestampSeconds, positionMeters }
    motion-run.ts             makeMotionRun(): frozen completed-run value object + basic metadata (count, duration, samplerHz, source)
    sample-timing.ts          pure diagnostics: count, elapsed, mean Hz, last/mean/stdev/min/max interval

  spike/
    diagnostic-log.ts         bounded line log (timestamped), CLEAR, subscribe
    raw-report-ring.ts        bounded ring (default 200) of { reportId, lengthBytes, hex, tMs }, PAUSE, CLEAR
    spike-view.ts             the ugly DOM UI; renders from AcquisitionUiState + logs; buttons raise controller intents
    unsupported-view.ts       "WebHID is not available" screen

  styles/
    tokens.css                a handful of CSS variables
    app.css                   minimal layout

index.html
tests/
  sensor/    go-motion-protocol.test.ts, hid-diagnostics.test.ts, fake-sensor-adapter.test.ts, go-motion-webhid.test.ts (mock HidLike)
  acquisition/ acquisition-state.test.ts, acquisition-controller.test.ts
  model/     motion-sample.test.ts, motion-run.test.ts, sample-timing.test.ts
```

### `SensorAdapter` contract (`src/sensor/sensor-adapter.ts`)

```ts
export type SensorStatus =
  | "no_device"      // nothing granted / not opened
  | "connecting"     // requestDevice / open / init in flight
  | "reconnecting"   // getDevices() found a grant, reopen in flight
  | "system_ready"   // opened + INIT ok (device identified, not armed)
  | "sensor_ready"   // period set + START(button) sent — armed, waiting for trigger
  | "measuring"      // streaming samples
  | "device_lost"    // was connected, unplugged / gone
  | "error";         // see lastError

export interface TriggerEvent {
  readonly kind: "start" | "stop";
  readonly source: "button" | "ui" | "immediate";
  readonly tMs: number;              // performance.now() at detection (diagnostic)
}

export interface SensorError {
  readonly code:
    | "unsupported_api" | "permission_denied" | "no_device_selected"
    | "open_failed" | "protocol_init_failed" | "send_report_unsupported"
    | "device_disconnected" | "policy_blocked" | "unknown";
  readonly message: string;
  readonly cause?: unknown;
}

export type Unsubscribe = () => void;

export interface SensorAdapter {
  readonly kind: string;                       // "go-motion-webhid" | "fake"
  readonly status: SensorStatus;
  readonly deviceLabel: string | null;
  readonly lastError: SensorError | null;

  connect(): Promise<void>;                    // user-gesture entry: requestDevice + open + init + report descriptor capture
  reconnect(): Promise<boolean>;               // getDevices() path; resolves false if nothing to reconnect
  disconnect(): Promise<void>;

  setReady(ready: boolean): Promise<void>;     // true: SET_PERIOD + START(button) -> sensor_ready ; false: STOP -> system_ready
  start(): Promise<void>;                      // UI Start: STOP + START(immediate); trigger edge confirms -> measuring
  stop(): Promise<void>;                       // UI Stop: STOP + re-arm START(button) -> sensor_ready

  subscribeSamples(listener: (s: MotionSample) => void): Unsubscribe;
  subscribeTrigger(listener: (e: TriggerEvent) => void): Unsubscribe;
  subscribeStatus(listener: (s: SensorStatus) => void): Unsubscribe;
  subscribeRawReport(listener: (r: RawReport) => void): Unsubscribe;  // spike diagnostics only
}
```

> Names may be tuned during implementation if a cleaner TS shape emerges; the
> **locked boundary**: nothing outside `go-motion-webhid.ts` (+ its pure helpers
> `go-motion-protocol.ts`, `hid.ts`, `hid-diagnostics.ts`) references HID bytes,
> report IDs, or `navigator.hid`.

### Acquisition state (`src/acquisition/acquisition-state.ts`)

States: `NO_DEVICE`, `SYSTEM_READY`, `SENSOR_READY`, `MEASURING`, `DEVICE_LOST`, `ERROR`.

Ordinary path:

```
NO_DEVICE --connect--> SYSTEM_READY --arm--> SENSOR_READY --start|trigger.start--> MEASURING
   ^                        ^                     ^   ^                                |
   |                        |  <--disarm----------+   +----- stop | trigger.stop <-----+
   +--------- lost ---------+---------- lost ---------------------- lost ---------------+
```

- Connection persists across ordinary start/stop cycles.
- A single input never both arms and starts: `SENSOR_READY → MEASURING` only on a
  trigger event (UI Start and physical button both raise `TriggerEvent{kind:"start"}`).
- `AcquisitionUiState = { state, connected, deviceLabel, canConnect, canReconnect,
  canArm, canDisarm, canStart, canStop, lastStopReason, lastError }` — immutable,
  re-emitted on every change; the view is a pure function of it (+ the logs).
- Stop reasons: `"ui"`, `"trigger"`, `"device_lost"`, `"error"`.

### Timestamps

`MotionSample.timestampSeconds = tickIndex * periodSeconds`, tickIndex reset to 0
at each `trigger.start`. `performance.now()` arrival time is recorded **only** in
`RawReport.tMs` / timing diagnostics, never as the sample x-value.

---

## Task sequence (TDD — write the test first, watch it fail, implement, green, refactor)

Each task ends with `npm test && npm run typecheck` green and a focused commit.

### Task 1 — Scaffold

- `npm create vite@latest` → **vanilla-ts** template, in place.
- Prune the template demo (`counter.ts`, Vite logo assets, boilerplate CSS).
- `package.json` scripts: `dev`, `build`, `preview`, `test` (`vitest run`),
  `test:watch`, `typecheck` (`tsc --noEmit`), `lint` (`eslint` if added — keep
  it lightweight; acceptable to skip ESLint and rely on strict `tsc`).
- `tsconfig.json`: `"strict": true`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`,
  `lib: ["ES2022","DOM","DOM.Iterable"]`. Add `"types": []` so Node types don't
  leak `navigator` globals — we type WebHID ourselves.
- Add `vitest` (jsdom environment for the view test only; node for the rest).
- Add `@types/w3c-web-hid` as a **devDependency** for editor help, but in
  `hid.ts` define our own narrow structural interfaces so tests never need the
  global `navigator.hid`.
- `index.html`: single `<div id="app">`, `<script type="module" src="/src/main.ts">`,
  a `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'">`
  (Vite dev needs `'unsafe-inline'` style; revisit for build).
- `.gitignore`: `node_modules`, `dist`, `.vite`.
- **Verify:** `npm run build` produces `dist/`; `npm test` runs 0 tests OK;
  `npm run typecheck` clean.
- **Commit:** `chore: scaffold Vite + TypeScript spike project`.

### Task 2 — `model/motion-sample.ts` + `model/motion-run.ts`

- **Tests first** (`tests/model/motion-sample.test.ts`, `motion-run.test.ts`):
  - `makeMotionSample(t, x)` returns object frozen (`Object.isFrozen`), fields
    exact, rejects non-finite input (throws `RangeError`).
  - `makeMotionRun({ samples, samplerHz, source, deviceLabel })`:
    frozen, `samples` frozen array, `sampleCount`, `durationSeconds =
    last.t - first.t` (0 for <2 samples), `startedAtEpochMs` recorded,
    empty-samples allowed (duration 0).
- Implement minimal.
- **Commit:** `feat(model): immutable MotionSample and MotionRun value objects`.

### Task 3 — `model/sample-timing.ts`

- **Tests first:** table-driven. Given arrays of arrival times (ms):
  - `sampleCount`, `elapsedSeconds`.
  - `observedRateHz = (count-1) / elapsedSeconds` (0/NaN guarded → `null`).
  - `lastIntervalMs`, `meanIntervalMs`, `stdevIntervalMs` (population),
    `minIntervalMs`, `maxIntervalMs`.
  - `< 2` samples → all interval stats `null`, never throws.
  - Known fixture: 25 Hz perfect (40 ms spacing) → rate 25.0, stdev 0.
  - Jittered fixture → stdev matches hand-computed value within 1e-9.
- Implement as one pure function `summariseTiming(arrivalMsList): TimingSummary`.
- **Commit:** `feat(model): pure sample-timing diagnostics`.

### Task 4 — `sensor/types.ts` + `sensor/sensor-adapter.ts`

- Types + interface exactly as above. Tiny `createEmitter<T>()` helper
  (add/remove listener, emit, `clear`), unit-tested for unsubscribe correctness
  and no-throw on double-unsubscribe.
- **Tests first:** emitter subscribe/emit/unsubscribe, listener added during
  emit is not called this round, listener removed during emit is respected.
- **Commit:** `feat(sensor): transport-agnostic SensorAdapter contract`.

### Task 5 — `sensor/go-motion-protocol.ts` (PURE codec) — the heart of the byte work

- **Tests first** (`tests/sensor/go-motion-protocol.test.ts`), byte fixtures from
  the research doc §10:
  - `encodeInit()` → `1A 02 00 00 00 00 00 00`
  - `encodeSetPeriod(0.040)` → `1B 28 00 00 00 00 00 00`; `encodeSetPeriod(0.02)` →
    20 ticks; clamps below min / above max; rounds to nearest tick.
  - `encodeStart({ trigger: "button", measType: "distance" })` → `18 01 00 00 00 00 00 00`
  - `encodeStart({ trigger: "immediate" })` → `18 00 …`
  - `encodeStop()` → `19 00 …`
  - `encodeGetMeasurementStatus()` → `30 00 …`
  - `classifyReport(bytes)`:
    - `[0x00,0x01, …]` → `{ kind: "measurement" }`
    - `[0x40, 0x18, …]` → `{ kind: "cmd_response", cmd: 0x18, error: false }`
    - `[0x60, 0x18, 0x36,…]` (0x20 set) → `{ kind: "cmd_response", error: true, status: 0x36 }`
    - `[0x80, …]` → `{ kind: "init_response", error: … }`
    - `[0xC0, …]` → `{ kind: "idle" }`
  - `decodeMeasurement(bytes)` for Cyclops packet:
    - counter byte extracted
    - `[.., .., 0x40,0x0D,0x03,0x00, ..]` → int32 LE `0x00030D40` = 200000 µm →
      `positionMeters === 0.2`
    - negative: `[.., .., 0x00,0x00,0xFF,0xFF]` → `-65536 µm` → `-0.065536 m`
      (documents sign handling — flag as "confirm on hardware")
    - `positionFeet` helper = `metres * 3.2808399`
  - `decodeMeasurementStatus(payloadBytes)` → `{ triggered, realtimeEnabled,
    nonRealtimeEnabled, batteryState, triggerType, dataRunSignature, filterType }`
    - `flags = 0xA0` → `triggered: true, realtimeEnabled: true`
    - `flags = 0x80` → `triggered: false, realtimeEnabled: true`
  - malformed: wrong length, empty → `classifyReport` returns `{ kind: "unknown" }`,
    decoders throw a typed `ProtocolError` (asserted).
- Implement. Constants block at top with **symbolic name = value + `// evidence:
  file:line`** for every magic number (no cargo-culting — spec §8).
- **Commit:** `feat(sensor): pure Go!Motion protocol codec with byte-fixture tests`.

### Task 6 — `sensor/hid.ts` (narrow WebHID surface) + `sensor/hid-diagnostics.ts`

- `hid.ts`: structural interfaces only —
  `HidLike { getDevices(); requestDevice(opts); addEventListener("connect"|"disconnect", …) }`,
  `HidDeviceLike { productName; vendorId; productId; opened; collections;
  open(); close(); sendReport(id, data); sendFeatureReport(id, data);
  addEventListener("inputreport", …); removeEventListener(...) }`,
  `HidInputReportEventLike { device; reportId; data: DataView }`.
  Plus `getHid(nav?): HidLike | null` = `("hid" in navigator) ? navigator.hid : null`
  (the ONLY `navigator.hid` reference in the codebase).
- `hid-diagnostics.ts`: **pure** `describeDevice(dev: HidDeviceLike):
  DeviceReport` and `formatDeviceReport(DeviceReport): string` →
  structured copyable text:
  ```
  productName : Go!Motion
  vendorId    : 0x08F7 (2295)
  productId   : 0x0004 (4)
  opened      : true
  collections : 1
    [0] usagePage 0xFF00  usage 0x01
        inputReports  : id 0  (8 bytes)  items: 1×8bit
        outputReports : id 0  (8 bytes)
        featureReports: (none)
  ```
- **Tests first:** feed a fake `HidDeviceLike` with a representative `collections`
  shape → assert the formatted string (snapshot-style, exact) and the structured
  object (report-id lists, byte lengths). Include a device with **no output
  report** → the report clearly says `outputReports: (none)` (this is the
  predicted failure mode we most need visible).
- **Commit:** `feat(sensor): narrow WebHID interface + pure HID descriptor diagnostics`.

### Task 7 — `spike/diagnostic-log.ts` + `spike/raw-report-ring.ts`

- **Tests first:**
  - `DiagnosticLog(max=500)`: `add(msg)` prepends timestamped line; length
    capped at `max` (oldest dropped); `clear()`; `subscribe` fires on change;
    `toText()` newline-joined for copy.
  - `RawReportRing(max=200)`: `push({reportId,bytes,tMs})` stores
    `{reportId, lengthBytes, hex, tMs}`; capped at `max`; `paused` flag makes
    `push` a no-op; `clear()`; `snapshot()` returns newest-first copy.
    Assert memory bound: push 10_000 → length stays `max`.
- Implement.
- **Commit:** `feat(spike): bounded diagnostic log and raw-report ring`.

### Task 8 — `acquisition/acquisition-state.ts` (pure machine)

- **Tests first** (`tests/acquisition/acquisition-state.test.ts`), exhaustive:
  - initial `NO_DEVICE`.
  - `NO_DEVICE + connected → SYSTEM_READY`; `+ arm` ignored (stays, no throw).
  - `SYSTEM_READY + arm → SENSOR_READY`; `+ disarm → SYSTEM_READY`.
  - `SENSOR_READY + trigger.start → MEASURING`; `+ start → MEASURING`.
  - `MEASURING + trigger.stop → SENSOR_READY (reason trigger)`;
    `+ stop → SENSOR_READY (reason ui)`.
  - `lost` from `SYSTEM_READY | SENSOR_READY | MEASURING → DEVICE_LOST`
    (records `lastStopReason: device_lost` when leaving `MEASURING`).
  - `DEVICE_LOST + connected → SYSTEM_READY`; `+ reconnected → SYSTEM_READY`.
  - `error(e)` from any state → `ERROR` carrying the error; `+ connect` path recovers.
  - `deriveUiState(machineState)` → the `canArm/canStart/...` booleans table
    (one assertion per state).
  - Property: no input ever throws; unknown transitions are no-ops.
- Implement as `reduce(state, event): state` + `deriveUiState`.
- **Commit:** `feat(acquisition): pure acquisition state machine`.

### Task 9 — `sensor/fake-sensor-adapter.ts`

- Implements `SensorAdapter`. Config: `{ script?: ... , sampleHz?: 25,
  synthetic?: (tSec) => metres }`. Methods resolve async and drive `status` +
  emit through the same emitters a real adapter would.
- `start()` begins a `setInterval`-driven synthetic sample stream (default
  `x(t) = 1.5 + 0.5·sin(2π·0.2·t)`), emits a `trigger.start` first.
- Helpers for tests: `emitDeviceLost()`, `failNextConnect(error)`,
  `cancelNextConnect()` (→ `no_device_selected`).
- **Tests first** (`tests/sensor/fake-sensor-adapter.test.ts`):
  connect→system_ready; setReady(true)→sensor_ready; start→measuring + samples
  arrive frozen and monotonic in t; stop→sensor_ready; repeat 3×; disconnect
  cleans up all timers/listeners (assert no samples after); `emitDeviceLost`
  → status `device_lost` + no further samples; `failNextConnect` → status
  `error` + `lastError.code`.
- **Commit:** `feat(sensor): FakeSensorAdapter for hardware-free testing`.

### Task 10 — `acquisition/acquisition-controller.ts`

- Owns one `SensorAdapter` (injected). Subscribes to status/samples/trigger.
  Feeds events into `acquisition-state`. Exposes:
  `uiState: AcquisitionUiState`, `subscribeUiState`, `subscribeSample`
  (pass-through of the authoritative stream), `subscribeRunComplete`
  (frozen `MotionRun` emitted when `MEASURING → not MEASURING`),
  and intents `connect() reconnect() disconnect() arm() disarm() start() stop()`
  that call the adapter and are **guarded by `deriveUiState`** (a disallowed
  intent is a logged no-op, never an adapter call).
- During `MEASURING` it appends samples to a mutable buffer; on exit it freezes
  a `MotionRun` (samplerHz from configured period, `source` from `adapter.kind`)
  and clears the buffer.
- Time base: assigns `tickIndex` from a counter reset on `trigger.start`.
- **Tests first** (`tests/acquisition/acquisition-controller.test.ts`) with
  `FakeSensorAdapter`:
  - full happy path emits the expected `uiState` sequence.
  - a `MotionRun` is produced with the right sample count + duration after a
    start/stop; three sequential runs each produce a distinct frozen run.
  - device-lost during `MEASURING` → `uiState.state DEVICE_LOST`,
    `lastStopReason device_lost`, and the partial run is still emitted (frozen,
    preserved).
  - Start intent while `SYSTEM_READY` (not armed) → no-op, adapter `.start` not
    called (spy).
  - `disconnect()` unsubscribes everything (adapter emits after → controller
    ignores; assert no `uiState` change).
- **Commit:** `feat(acquisition): AcquisitionController over SensorAdapter`.

### Task 11 — `sensor/go-motion-webhid.ts` (real adapter) + mock-`HidLike` tests

- Implements `SensorAdapter` using `hid.ts` + `go-motion-protocol.ts`.
- `connect()`: `requestDevice({ filters: [{ vendorId: 0x08F7, productId: 0x0004 }] })`
  (+ a `DEV_BROAD_CHOOSER` build flag / `?broad` query that widens to
  `[{ vendorId: 0x08F7 }]` then `[]` for identification only — logged loudly,
  never in the default path — spec §8/§18). Then `open()`, attach `inputreport`
  listener, capture + log `hid-diagnostics` report, send `INIT`, await init
  response, `GET_STATUS` for versions (best-effort). On `sendReport` throwing
  → try `sendFeatureReport`; if that also throws → `SensorError
  send_report_unsupported` and status `error` (this is the key feasibility
  finding path).
- `reconnect()`: `getDevices()`, pick the first matching filter, `open()` if not
  open, re-attach, `INIT`. Resolve `false` if none.
- `setReady(true)`: `encodeSetPeriod(0.040)` then `encodeStart({trigger:"button"})`.
- `start()`: `encodeStop()` then `encodeStart({trigger:"immediate"})`.
- `stop()`: `encodeStop()` then re-arm `encodeStart({trigger:"button"})`.
- Status polling: a `GET_MEASUREMENT_STATUS` loop (~10 Hz) while armed/measuring;
  `0→1` on `triggered` → emit `TriggerEvent{start, button|immediate}` + status
  `measuring`; `1→0` → `TriggerEvent{stop}` + `sensor_ready`. N consecutive
  status failures (~1 s) → `device_lost`.
- `inputreport` handler: classify; measurement → decode → assign tickIndex →
  emit `MotionSample` + push `RawReport`; cmd-response → resolve the pending
  command promise; everything → push to raw ring.
- `navigator.hid` `disconnect` event for this device → `device_lost`.
- **Tests first** (`tests/sensor/go-motion-webhid.test.ts`) with a hand-written
  `FakeHid` / `FakeHidDevice` implementing `HidLike` / `HidDeviceLike`
  (record `sendReport` calls, let the test push synthetic `inputreport`s):
  - `connect()` sends `INIT` bytes and reaches `system_ready` after the fake
    emits an init response.
  - `connect()` when `getHid()` returns null → `SensorError unsupported_api`.
  - `requestDevice` rejects with `NotFoundError`/no selection → `no_device_selected`;
    `SecurityError` → `permission_denied` / `policy_blocked` (message-based).
  - `sendReport` throws → falls back to `sendFeatureReport`; both throw →
    `send_report_unsupported`.
  - `setReady(true)` sends `SET_PERIOD` + `START(button)` bytes (asserted hex).
  - a synthetic measurement `inputreport` → one frozen `MotionSample` with the
    expected metres; a run of 100 → tickIndex 0..99, `t = i*0.040`.
  - synthetic status flip `0x80 → 0xA0` → `TriggerEvent{kind:start}` + status
    `measuring`.
  - 12 consecutive status-poll failures → `device_lost`.
  - `disconnect` event → `device_lost`; `disconnect()` closes the device + clears timers.
- **No test imports `navigator`.**
- **Commit:** `feat(sensor): GoMotionWebHIDAdapter (WebHID I/O) with mock-HID tests`.

### Task 12 — `spike/unsupported-view.ts` + `spike/spike-view.ts` + `main.ts`

- `unsupported-view.ts`: renders the "WEBHID IS NOT AVAILABLE — Motion World
  requires a current Chrome or Edge with WebHID enabled" screen. Pure
  `(container) => void`.
- `spike-view.ts`: builds the DOM described in the "Milestone Zero product"
  section below; subscribes to `controller.subscribeUiState`, the two logs, and
  the sample stream; buttons call controller intents; renders timing
  diagnostics from `summariseTiming` over recent arrival times; the raw-report
  panel renders from `RawReportRing.snapshot()` with PAUSE / CLEAR; a top-level
  CLEAR LOG. `DEVICE INFO` button copies `formatDeviceReport(...)` to clipboard
  (and always also shows it in a `<pre>`).
- `main.ts`: `const hid = getHid();` → if null, mount `unsupported-view` and
  stop. Else build `GoMotionWebHIDAdapter(hid)` (or `FakeSensorAdapter` when
  `?fake` is in the URL — for the Mac smoke test), build `AcquisitionController`,
  mount `spike-view`. Global `unhandledrejection` handler → append to the
  diagnostic log (never a bare console rejection — spec §7).
- **Tests** (`tests/` jsdom, light): `?fake` path mounts, CONNECT → status text
  becomes "Connected", START renders a changing POSITION, CLEAR LOG empties the
  log element, unsupported path renders the message. Keep these few and robust.
- **Commit:** `feat(spike): diagnostic UI, unsupported-browser screen, app wiring`.

### Task 13 — Verification + docs

- Run the full success-criteria checklist above; fix anything red.
- `npm run build`; `npm run preview` and take a screenshot with `?fake`
  (browser via the `run` skill / Playwright / manual) — save to
  `docs/research/spike-smoke-<date>.png`.
- Write `docs/research/webhid-spike-windows-test.md` — the physical test
  procedure (steps 1–20 from the prompt), a "how to open the page on the work
  PC" section (HTTPS URL if deployed, else the localhost-copy recipe), and a
  "paste this back" diagnostics block.
- Write `README.md` for the spike: what it is, `npm ci && npm run dev`, the
  `?fake` and `?broad` query flags, the architecture boundary rule.
- Decide + document the host: **preferred** = build `dist/` and deploy to an
  HTTPS static host; document exact steps in the Windows-test doc. If no host is
  set up in-session, document the **localhost-on-the-work-PC** fallback
  (copy repo or `dist/`, `npx serve dist` / `python -m http.server` from the
  Windows box — note this needs Node or Python *on the test PC only for
  serving*, which is acceptable for the test but not for deployment; prefer the
  HTTPS host).
- **Commit:** `docs: Milestone Zero verification, Windows test procedure, spike README`.

### Task 14 — Milestone Zero readiness report

- Produce the `MOTION WORLD WEB — MILESTONE ZERO READY` report (git, stack,
  architecture, GoIO/HID research summary, spike UI, automated testing, WebHID
  limitations, physical test steps, next gate) as the final response and as
  `docs/research/milestone-zero-ready.md`.
- **Commit:** `docs: Milestone Zero readiness report`.

---

## Milestone Zero product (the UI to build in Task 12)

```
MOTION WORLD — SENSOR TEST

[ CONNECT SENSOR ]   [ RECONNECT SENSOR ]        (reconnect shown when a grant exists)

Sensor:  Not connected
         └─ after connect ─┐
Sensor:  CBR 2 / Go!Motion
         Connected

[ SENSOR READY ]   [ START ]   [ STOP ]          (enabled per AcquisitionUiState)

POSITION            TIME
1.427 m            3.240 s

Samples: 81   Observed rate: 25.0 Hz   Last interval: 40 ms
Mean interval: 40.1 ms   Stdev: 1.2 ms   Min/Max: 38 / 44 ms

DEVICE INFO   [copy]
┌───────────────────────────────────────────┐
│ productName : Go!Motion                    │
│ vendorId    : 0x08F7 (2295)   …            │
└───────────────────────────────────────────┘

EVENT LOG                                   [ CLEAR LOG ]
12:04:01 device permission granted
12:04:01 device opened
12:04:02 sensor ready
12:04:04 acquisition started
12:04:04 sample 1.427 m
12:04:09 acquisition stopped

RAW HID REPORTS (diagnostic)     [ PAUSE ] [ CLEAR ]   showing 100 of 200
12:04:04.031  id 0  len 8  00 05 8b 15 00 00 00 00
...
```

- Ugly is fine. No graph. Font-size only for emphasis. No cards, no theme.
- Raw panel default cap 200 reports; never appends unbounded DOM (render from
  `snapshot()` on a throttled tick, cap DOM rows at the cap).

---

## Testability without hardware

- `FakeSensorAdapter` exercises: state transitions, arm, start/stop, sample
  publishing, run formation, device-lost, repeated runs, subscriber cleanup.
- `FakeHid` / `FakeHidDevice` exercise the real adapter's codec + framing +
  status-poll + inputreport handling with synthetic bytes.
- **The tests never prove WebHID works.** The report and the UI both label
  results `SOFTWARE VERIFIED` vs `HARDWARE VERIFIED`. Only the Windows test with
  the real CBR 2 moves anything to `HARDWARE VERIFIED`.

## Security / permissions

- Default HID filter: `{ vendorId: 0x08F7, productId: 0x0004 }` only.
- `?broad` widens the chooser **for identification only**, gated + logged; not in
  the default path; documented in README with the reason (spec §8/§18).
- No telemetry, no analytics, no network calls (CSP `connect-src 'self'`).
- Never read keyboards/mice — the filter and the narrow default prevent it.

## Out of scope (explicit)

Five-tool Home; any lab; polished graphs; IndexedDB / run persistence; light/dark
theme; PWA manifest; `ReplayAdapter` beyond `FakeSensorAdapter`; WebUSB / Web
Serial; deployment automation/credentials; GitHub remote.

---

## Self-review

- **Spec coverage:** §4 boundary (adapter is the only HID module; controller owns
  the connection; UI never touches HID) — Tasks 5/6/10/11/12. §5 acquisition
  states incl. `DEVICE_LOST`/`ERROR` — Task 8. §7 capability detection +
  distinct error codes + no opaque rejection — Tasks 6/11/12 (`SensorError`
  codes, `unhandledrejection` handler). §8 device discovery / no cargo-culted
  IDs — Task 5 constants-with-evidence + research doc + `?broad`. §9 protocol
  research doc — done before this plan. §10 descriptor diagnostics — Task 6.
  §11 raw report inspector, bounded, pause/clear — Task 7. §12 `MotionSample`
  immutable + explicit monotonic time — Tasks 2/10. §13 timing diagnostics,
  real not faked — Task 3. §14 blue button via `TriggerEvent`, detection proven
  + logged, not a sole gate — Tasks 8/11. §15 hardware-free testability —
  Tasks 9/11. §16 unit tests don't depend on `navigator.hid` — Tasks 6/11
  (narrow interfaces). §17 dev serving / HTTPS for the real test — Task 13.
  §15.5 (new) CONNECT vs RECONNECT SENSOR, secure context, class D policy —
  Tasks 11/12/13.
- **Placeholders:** none — every task names concrete files, concrete test cases,
  concrete byte fixtures, and a commit message.
- **Type consistency:** one `SensorStatus` union used by adapter + fakes;
  acquisition machine has its own `AcquisitionState` enum (distinct on purpose —
  the machine adds `ERROR`/`DEVICE_LOST` semantics and stop reasons) with a
  documented mapping in Task 10; `MotionSample` defined once in `model/`,
  re-exported through `sensor/types.ts`; `Unsubscribe` defined once.
- **Contradiction check:** the spike stays inside the locked architecture (no
  HID in UI handlers) *and* stays small — reconciled by the pure-codec split
  (`go-motion-protocol.ts` has zero I/O, so the byte work is cheap to test and
  the I/O module stays thin). "No IndexedDB" vs "form a MotionRun" — reconciled:
  runs are formed in memory and shown, never persisted.
