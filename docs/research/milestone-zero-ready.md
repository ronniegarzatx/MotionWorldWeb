# MOTION WORLD WEB — MILESTONE ZERO READY

The software half of Milestone Zero is complete, verified on the Mac, and ready
to carry to the Windows work PC for the real CBR 2 / Go!Motion test. **No
hardware result is claimed.**

## GIT

| | |
|---|---|
| branch | `main` |
| starting HEAD | `dd0fd6b` — docs: define Motion World Web v1 architecture |
| final HEAD | `0965b88` — docs: spike README, Windows + CBR 2 test procedure |
| working tree | clean |
| native repo `/Users/sine/Desktop/GoIO_SDK` | untouched (clean), read-only reference only |
| remote | none created, none pushed |

Commits (after the design commit):

```
0965b88 docs: spike README, Windows + CBR 2 test procedure
07310c7 chore: upgrade vite 7 / vitest 3 — clears the esbuild dev-server advisory
1720300 feat(spike): diagnostic UI, unsupported-browser screen, app wiring
fb2bc10 feat(sensor): GoMotionWebHIDAdapter — the only WebHID I/O module
c5d6201 feat: FakeSensorAdapter + AcquisitionController
395e7b1 feat: HID diagnostics, bounded spike logs, acquisition state machine
ceab62a feat: scaffold spike + model layer + Go!Motion protocol codec
a9c14ce docs: Milestone Zero plan + WebHID reconnect clarification + GoIO protocol research
```

## STACK

- **Runtime:** none. Static SPA, `base: "./"`, CSP `default-src 'self';
  connect-src 'self'`. Production bundle: **~29 kB JS / ~9.5 kB gzip**, 1.9 kB CSS.
- **Build/dev:** Vite `7.3.6`. **Language:** TypeScript `5.9.3`, `strict` +
  `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`.
- **Tests:** Vitest `3.2.7` (node; jsdom per-file for the 2 view suites), jsdom `25.0.1`.
- **devDependencies (5, all dev-only):** `vite ^7.3.6`, `vitest ^3.2.7`,
  `typescript ^5.6.3`, `jsdom ^25.0.1`, `@types/w3c-web-hid ^1.0.6`.
- **Runtime dependencies: 0.** No React/Vue/Svelte, no Pyodide/SciPy, no backend
  framework, no state library, no CSS framework.
- `npm audit`: **0 vulnerabilities**. `npm ci` reproducible from `package-lock.json`.
- Note: this environment's `npm` gates install scripts; `package.json` has an
  `allowScripts` entry for the pinned `esbuild` build (re-approve on a bump with
  `npm install-scripts approve esbuild`).

## ARCHITECTURE

Locked boundary: **`navigator.hid` appears in exactly one file**
(`src/sensor/hid.ts`); **HID report bytes appear in exactly one production
module** (`src/sensor/go-motion-webhid.ts`) plus pure helpers. The UI issues
intents to the controller and never touches HID.

| Piece | File | Role |
|---|---|---|
| `SensorAdapter` (contract) | `sensor/types.ts` | transport-agnostic: `connect/reconnect/disconnect`, `setReady/start/stop`, `subscribe{Samples,Trigger,Status,RawReport}`, `status`, `deviceLabel`, `lastError`. `SensorStatus` union + `SensorError` codes + `TriggerEvent` + `RawReport`. |
| `GoMotionWebHIDAdapter` | `sensor/go-motion-webhid.ts` | the only WebHID I/O. Narrow filter `{0x08F7,0x0004}`; `open` → capture descriptor → `INIT` → best-effort `GET_STATUS`; `sendReport(0,…)` with `sendFeatureReport` fallback → else `send_report_unsupported`; serialized command/response with timeout; `SET_PERIOD`+`START(button|immediate)`+`STOP` with blue-button re-arm; ~10 Hz `GET_MEASUREMENT_STATUS` poll → TRIGGERED edges → `TriggerEvent` + `measuring`/`sensor_ready`; N failed polls or `navigator.hid` disconnect → `device_lost`; `inputreport` measurement → frozen `MotionSample`. |
| pure protocol codec | `sensor/go-motion-protocol.ts` | no I/O. Encoders/decoders + micron→metre scaling. Every constant carries a `// evidence: GoIO file:line`. |
| narrow WebHID surface | `sensor/hid.ts` | structural `HidLike`/`HidDeviceLike`/`HidInputReportEventLike`; `getHid()`. |
| HID descriptor diagnostics | `sensor/hid-diagnostics.ts` | pure `describeDevice` + `formatDeviceReport` → structured, copyable text; flags "no output report". |
| `FakeSensorAdapter` | `sensor/fake-sensor-adapter.ts` | full contract, synthetic sample stream, `failNextConnect`/`cancelNextConnectSelection`/`emitDeviceLost` hooks. **Not a WebHID validator.** |
| `AcquisitionController` | `acquisition/acquisition-controller.ts` | owns ONE adapter; maps its status/trigger/sample streams onto the pure machine; exposes `AcquisitionUiState`, authoritative sample passthrough, frozen `MotionRun` on completion; intents guarded by `deriveUiFlags` (disallowed intent = logged no-op, never an adapter call); partial run preserved on device-lost. |
| acquisition state machine | `acquisition/acquisition-state.ts` | pure `NO_DEVICE / SYSTEM_READY / SENSOR_READY / MEASURING / DEVICE_LOST / ERROR`; trigger is the sole arm→measure authority; stop reasons `ui/trigger/device_lost/error`. |
| `MotionSample` | `model/motion-sample.ts` | frozen `{timestampSeconds, positionMeters}`; acquisition-relative monotonic time only; rejects non-finite. |
| `MotionRun` | `model/motion-run.ts` | frozen completed run + `sampleCount`, `durationSeconds`, `samplerHz`, `source`. Formed in memory, never persisted (no IndexedDB in the spike). |
| sample-timing diagnostics | `model/sample-timing.ts` | pure: count, elapsed, observed Hz, last/mean/stdev/min/max interval. Reports what the browser delivered — nothing faked. |
| spike UI | `spike/spike-view.ts`, `unsupported-view.ts`, `diagnostic-log.ts`, `raw-report-ring.ts` | ugly-but-useful; bounded log (600) + bounded raw-report ring (200, PAUSE/CLEAR). |

## GOIO / HID RESEARCH  (full: `docs/research/go-motion-webhid-protocol.md`)

**VID / PID:** Vernier `0x08F7`; Go!Motion ("Cyclops") `0x0004`
(`GVernierUSB.h:33,38`). **CBR 2 PID is assumed `0x0004` — the spike's `?broad`
path confirms it if the narrow filter shows nothing.** Windows enumerates it as
plain HID (no custom driver) via `HidD_*`/`ReadFile`/`WriteFile`.

**Framing:** 8-byte application packets over HID **report id 0** (Windows SDK
uses a 9-byte `[0, …8]` report — `GSkipBaseDevice_Win.cpp:45-46`). Inbound: byte
0 header, `& 0xC0` selects stream — `0x00` measurement, `0x40` cmd response,
`0x80` INIT response, `0xC0` idle.

**Commands encoded / decoded by the spike** (`docs/research` §10):

| purpose | bytes |
|---|---|
| INIT (hostType=computer) | `1a 02 00 00 00 00 00 00` |
| SET_PERIOD 0.040 s (40 × 1 ms ticks) | `1b 28 00 00 00 00 00 00` |
| START realtime distance, button-armed | `18 01 00 00 00 00 00 00` |
| START realtime distance, immediate | `18 00 00 00 00 00 00 00` |
| STOP | `19 00 00 00 00 00 00 00` |
| GET_MEASUREMENT_STATUS | `30 00 00 00 00 00 00 00` |
| GET_STATUS (firmware versions) | `10 00 00 00 00 00 00 00` |

**Measurement packet:** `[0x01, counter, int32-LE microns, measType, 0]` →
`positionMeters = rawMicrons × 1e-6` (Cyclops `ConvertToVoltage` = `raw*1e-6`,
synthetic DDS linear a=0 b=1 units "(m)"; feet page b=3.2808399 —
`GCyclopsDevice.{h:75,cpp:158-198}`). Packets carry no timestamp/index, only a
1-byte rolling counter (drop detection).

**Trigger / blue button:** no async event. Native polls `GET_MEASUREMENT_STATUS`
~10 Hz; a `0→1` edge on `flags & 0x20` (TRIGGERED) = run started (blue button or
IMMEDIATE), `1→0` = stopped; `dataRunSignature` corroborates
(`GoIO_LiveMotion.cpp:304-345`). The spike implements exactly this.

**Init sequence:** open → `INIT{hostType:2}` (retried while the slave CPU boots)
→ clear queue → (DDS is synthetic for Cyclops, not read) → per run:
`SET_PERIOD 0.040` → `START(trigger)` → poll status + drain measurements →
`STOP` → re-`START(button)` (`GoIO_DLL_interface.cpp:595-655`,
`GoIO_LiveMotion.cpp:266-425`).

**Uncertainties (only hardware can close):** CBR 2 PID; whether WebHID
`sendReport(0,…)` reaches the device or is refused for a feature-only descriptor
(**highest risk**); whether `inputreport` delivers the 8-byte payload with the
header byte intact; real sustained rate/jitter and lag over 5 min; button-edge
latency through a WebHID status poll; `disconnect`/`getDevices` behaviour on
replug and refresh; sign/scale of the microns value vs physical distance;
whether work-network browser policy allows WebHID at all.

## SPIKE UI

**Controls:** CONNECT SENSOR · RECONNECT SENSOR · DISCONNECT · SENSOR READY /
DISARM · START · STOP (each enabled strictly per `AcquisitionUiState`).

**Diagnostics on screen:**
- Sensor label + connection state + machine state (+ last stop reason).
- Big **POSITION (m)** and **TIME (s)** readouts.
- Live timing: **Samples**, **Observed rate (Hz)**, **Last / Mean / Stdev /
  Min-Max interval (ms)** — computed from actual arrival times.
- **Device info** panel: `productName`, `vendorId`/`productId` (hex + dec),
  `opened`, collections, per-collection input/output/feature report ids + byte
  lengths + item sizes, and an explicit `outputReport present : true/false`.
  A **copy** button (also always shown as text).
- **Event log** (bounded 600, newest first, timestamped) + **CLEAR LOG**;
  `toText()` for pasting.
- **Raw HID reports** panel (bounded ring of 200; in/out; report id, length,
  hex, ms) with **PAUSE/RESUME** and **CLEAR**; never appends unbounded DOM.
- Global `unhandledrejection` / `error` handlers write to the log — the teacher
  never sees an opaque console rejection.

**URL flags:** `?fake` (FakeSensorAdapter, no hardware), `?broad` (dev-only wide
HID chooser, logged loudly).

## AUTOMATED TESTING

- **84 tests, 13 files, all green.** `tsc --noEmit` clean. `vite build` clean.
- Coverage: protocol byte fixtures (encode + classify + decode + sign/endian +
  malformed rejection); sample-timing math (perfect 25 Hz, jitter stdev, guards);
  immutable `MotionSample`/`MotionRun`; emitter subscribe/unsubscribe during
  emit; HID descriptor formatting incl. the "no output report" case; bounded
  log + bounded ring (10 000 pushes → capped); the full acquisition machine
  (every transition, "trigger is the sole authority", stop reasons, no-throw
  property); `FakeSensorAdapter` (transitions, repeated runs, subscriber
  cleanup, device-lost, connect-failure, chooser-cancel); `AcquisitionController`
  over the fake (happy path uiState sequence, run formation ×3 distinct,
  partial-run-on-lost, guarded intents, dispose detaches); `GoMotionWebHIDAdapter`
  against a scriptable `FakeHid`/`FakeHidDevice` (INIT bytes → system_ready;
  unsupported_api; NotFoundError → no_device_selected; SecurityError →
  policy_blocked; sendReport→sendFeatureReport fallback then
  send_report_unsupported; SET_PERIOD+START(button) bytes; measurement →
  frozen metre sample; 100 samples → monotonic t; status flip → trigger +
  measuring; failed polls → device_lost; disconnect event → device_lost); jsdom
  view smoke (controls render, CONNECT shows label, START changes POSITION,
  CLEAR LOG empties, PAUSE toggles, teardown detaches, unsupported screen).
- **No test imports `navigator`** — the adapter is tested entirely through
  injected `HidLike`.
- Browser screenshot: **not captured** — no browser-automation tool is available
  in this environment (Chrome extension declined; no Playwright). Manual smoke:
  `npm run dev` → open `http://localhost:5173/?fake` → CONNECT → SENSOR READY →
  START shows a sinusoidal POSITION and ~25 Hz timing.

## WEBHID LIMITATIONS — what software cannot prove without the sensor

The tests prove the **state machine, protocol codec, framing, error mapping,
run formation, and UI** are correct against a simulated device. They **cannot**
prove:

- that Chrome/Edge on the work PC will `requestDevice` list the CBR 2 at all
  (policy, driver, PID);
- that `sendReport(0, …)` actually reaches the device (vs. a refused write for a
  feature-only report descriptor) — the single biggest risk;
- the real inputreport shape, sustained sample rate, jitter, and 5-minute lag
  behaviour;
- blue-button edge detection latency over a real status poll;
- unplug/replug/refresh reconnect behaviour;
- that the microns→metres sign and scale match physical distance.

Everything above is labelled **SOFTWARE VERIFIED**. Nothing is **HARDWARE
VERIFIED** yet.

## PHYSICAL TEST

Full procedure + copy-back template + classification rules:
**`docs/research/webhid-spike-windows-test.md`**. Summary:

1. Get the page onto the work PC — **preferred:** `npm run build` then upload
   `dist/` to any HTTPS static host (GitHub Pages / Netlify / Cloudflare Pages,
   no backend) and open that URL. **Fallback:** copy `dist/` to the PC and serve
   it with `python -m http.server` or `npx serve` on `localhost` (server used
   only for the test, nothing installed permanently). `file://` will not work.
2. Plug in the CBR 2 → open the page → **CONNECT SENSOR** → pick the Vernier
   device → copy the **Device info** panel.
3. **SENSOR READY** → **START** → move a target 0.5–3 m → confirm POSITION
   tracks → run 30 s → **STOP** → repeat 3× → run ≥ 5 min.
4. Unplug while measuring → expect **DEVICE LOST** in ~1 s, no crash → replug →
   reconnect. Refresh the page and report whether reconnect is automatic, needs
   a **RECONNECT SENSOR** click, or a full re-pick.
5. Arm, press the **blue button**, report exactly what the Event log shows.
6. Paste the copy-back template (Device info panel + full Event log + the
   yes/no answers).

**Easiest way to open it on the Windows PC:** an HTTPS URL you can just type in.
If the user wants that set up, the build is ready (`dist/`) and any drag-and-drop
static host works — remote repo creation/push stays the user's call.

## NEXT GATE

**Waiting on the user's real CBR 2 / Go!Motion test on the Windows work PC.**
Its result classifies the project A–E (spec §21). Do **not** begin Live Lab or
any Milestone 1 work until that result is in.
