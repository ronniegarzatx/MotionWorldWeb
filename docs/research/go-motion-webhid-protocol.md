# Go!Motion / CBR 2 — WebHID protocol research

**Status:** MOSTLY SOURCE-INSPECTION. **Section 0 records the first real
Windows + Go!Motion result (2026-09-07)** — device identity, the HID collection,
and the INIT request/response round-trip are now **hardware-confirmed**.
Measurement streaming, period/START/STOP, the blue button, and the sample scale
are still unproven and are the next physical test. Every other fact is tagged
with a confidence level and its evidence.

**Primary evidence:** the Vernier GoIO SDK C++ source at
`/Users/sine/Desktop/GoIO_SDK/src` (read-only; not modified). File+line
references below are into that tree. Copyright Vernier Software & Technology,
BSD-3-clause (`GoIO_SDK/license.txt`) — we are porting the *command sequence and
byte layout*, not copying code.

**Device nickname:** Vernier calls the Go!Motion / CBR 2 motion detector
**"Cyclops"** internally. "Skip" = Go!Link, "Jonah" = Go!Temp. They share one
base protocol (`GSkipComm.h` / `GSkipCommExt.h`); Cyclops adds a few extensions
(`GCyclopsCommExt.h`).

---

## 0. HARDWARE-CONFIRMED — first Windows + Go!Motion test (2026-09-07)

Chrome on the user's Windows work PC, device picker + `GoMotionWebHIDAdapter`.

**Confirmed facts:**

| Fact | Value |
|---|---|
| `productName` | **`Go! Motion ver 1.02`** (note the space in "Go! Motion") |
| `vendorId` | **`0x08F7`** (2295) |
| `productId` | **`0x0004`** (4) |
| Windows driver | **none** — enumerated as plain HID, `opened: true`, no install, no admin |
| HID collections | **1**, `usagePage 0xFF00`, `usage 0x01` (vendor-defined) |
| report id | **`0`** for all three report types |
| input report | id 0, **8 bytes** (`8x8bit`) |
| output report | id 0, **8 bytes** — **`sendReport(0, …)` physically works** (the predicted feature-only blocker did **not** occur) |
| feature report | id 0, 8 bytes (present, unused by us) |
| INIT request (host→device) | `1a 02 00 00 00 00 00 00` — sent and accepted |
| INIT response (device→host) | **`9a 1a 00 00 00 00 00 00`** — `0x9a & 0xC0 == 0x80` = INIT_RESPONSE, `& 0x20 == 0` = no error flag. Valid. |
| `inputreport` shape | `reportId === 0`, `event.data` = 8-byte `DataView`, header byte intact (`0x9a`) — as predicted in §2 |

So: **VID/PID, plain-HID enumeration, the FF00/01 collection, report-id-0 8-byte
in/out/feature, `sendReport` capability, and the full INIT request→response
round-trip are proven on real hardware.**

**NOT yet confirmed (next physical test):** `SET_MEASUREMENT_PERIOD` accepted;
`START_MEASUREMENTS` starts a stream; measurement packet layout / rate / jitter;
`GET_MEASUREMENT_STATUS` poll + TRIGGERED edge; blue-button detection; the
micron→metre sign and scale; unplug/replug/refresh reconnect.

### 0.1 Bug found and fixed by this test — `TypeError: Illegal invocation`

The first real run reached "device descriptor captured" then failed:

```
unhandled error: TypeError: Illegal invocation
error [protocol_init_failed] INIT failed: TypeError: Illegal invocation
```

**This was a browser-plumbing bug, not a protocol failure** — the device *did*
receive INIT and reply with a valid `9a 1a …`. Root cause: `GoMotionWebHIDAdapter`
stored `window.setTimeout` / `setInterval` / `clearTimeout` / `clearInterval` as
instance fields and later invoked them as `this.setTimeoutFn(…)`. Chromium binds
these WebIDL methods to `Window`; calling one with the adapter as receiver throws
`TypeError: Illegal invocation`. It was thrown *inside* the response-promise
executor, so the pending-command waiter was never installed, the valid INIT
reply had nothing to resolve, and the pre-rejected promise surfaced as
`protocol_init_failed`. Node / jsdom don't enforce the receiver, so every unit
test passed. Fixed by binding the platform timer globals to `globalThis`
(`this.setTimeoutFn = globalThis.setTimeout.bind(globalThis)` etc.); injected
test timers still work. Regression test:
`tests/sensor/go-motion-webhid.test.ts` → "browser timer receiver safety".

---

## 1. Device identity (VID / PID / product string)

| Fact | Value | Dir | Evidence | Confidence | M0 uses |
|---|---|---|---|---|---|
| USB vendor ID (Vernier) | `0x08F7` | — | `GVernierUSB.h:33` + **hardware (§0)** | **hardware-confirmed** | yes — HID filter |
| USB product ID (Go!Motion) | `0x0004` | — | `GVernierUSB.h:38` + **hardware (§0)** | **hardware-confirmed** | yes — HID filter |
| `productName` string | **`Go! Motion ver 1.02`** | dev→host | **hardware (§0)** | **hardware-confirmed** | display only |
| Other Vernier PIDs (to *exclude*) | LabPro `0x0001`, GoTemp `0x0002`, GoLink `0x0003`, LabQuest `0x0005`, SpectroVis `0x0006`, MiniGC `0x0007` | — | `GVernierUSB.h:35-43` | high | filter narrowness |

**Resolved:** the unit tested was labelled a **Go!Motion** ("Go! Motion ver
1.02"), not literally a "CBR 2", and it enumerates exactly as the SDK predicts —
VID `0x08F7`, PID `0x0004`. The narrow filter `{vendorId:0x08F7,
productId:0x0004}` is correct; `?broad` was not needed.

**Windows driver:** **confirmed none** — it enumerated as plain HID
(`opened: true`), no install, no admin (§0). Matches the SDK's `HidD_*` path
(`Win32/GSkipBaseDevice_Win.cpp`).

---

## 2. HID transport framing

**Evidence:** `GSkipComm.h:31-60`, `Win32/GSkipBaseDevice_Win.cpp:45-46,240-253,731-772`.

- The application protocol is **8-byte packets** on top of HID as a dumb
  transport (`GSkipComm.h:33-36`).
- On Windows the HID report is **9 bytes**: `buf[0]` = report ID = **`0x00`**
  (unnumbered reports), `buf[1..8]` = the 8-byte application packet.
  `BYTES_IN_MICROSOFT_HID_PACKET 9`, `FIRST_PAYLOAD_BYTE_INDEX_… 1`
  (`GSkipBaseDevice_Win.cpp:45-46`).
  - **WebHID mapping — hardware-confirmed (§0):** `device.sendReport(0,
    Uint8Array(8))` physically works; `inputreport` events arrive with
    `event.reportId === 0` and `event.data` = `DataView` of **8 bytes** with the
    header byte intact (`0x9a` observed). Collection: 1 × `usagePage 0xFF00`
    `usage 0x01`, report id 0, 8-byte input/output/feature.
- **Output / command stream:** historically issued as `Set_Report` on control
  endpoint 0 (`GSkipComm.h:39-41`); on Windows just `WriteFile` of an output
  report (`GSkipBaseDevice_Win.cpp:750`). **The predicted "no output report →
  sendReport refused" blocker did NOT occur** — the descriptor declares an
  8-byte output report at id 0 and `sendReport(0, …)` delivered INIT
  successfully.
- **Input streams (two, multiplexed on one interrupt IN endpoint):** every
  inbound 8-byte packet's **first byte is a header**; bits `0xC0` select the
  stream (`GSkipComm.h:49-60`):

  | `header & 0xC0` | meaning | queue |
  |---|---|---|
  | `0x00` | measurement packet | measurement |
  | `0x40` | command response | cmd-response |
  | `0x80` | response to `SKIP_CMD_ID_INIT` | cmd-response (init) |
  | `0xC0` | notification / idle (unused / keepalive) | ignore |

- Command-response header sub-bits (`GSkipComm.h:613-624`):
  `0x20` = error flag, `0x08` = first packet, `0x10` = last packet,
  low 3 bits (`& 0x07`) = payload byte count in this packet (excl. header).
  Error response = header `0x7A`; normal default response = header `0x5A`.
  Multi-packet responses (DDS reads, GET_MEASUREMENTS) chain first→last.

---

## 3. Command set (host → device)

All command packets are `{ cmd:u8, params:u8[7] }` (`GSkipComm.h:111-115`,
`GSkipOutputPacket`). Unused params are zero-filled (`GSkipBaseDevice.cpp:239-242`).

| Symbol | cmd | params (bytes after cmd) | Dir | Response | Conf | M0 |
|---|---|---|---|---|---|---|
| `SKIP_CMD_ID_INIT` | `0x1A` | Cyclops: `hostType`, `forcePowerOnDefaults`, then 0s. `hostType = 2` (`SKIP_HOST_TYPE_COMPUTER`) | h→d | default resp, header `0x9A`; stops measurements, aborts pending cmds | high | yes |
| `SKIP_CMD_ID_GET_STATUS` | `0x10` | none | h→d | `{status, minorVerMaster, majorVerMaster, minorVerSlave, majorVerSlave}` BCD (`GSkipCommExt.h:248-255`) | high | optional (version log) |
| `SKIP_CMD_ID_SET_MEASUREMENT_PERIOD` | `0x1B` | `u32` little-endian tick count (`GSkipComm.h:309-317`) | h→d | default resp | high | yes |
| `SKIP_CMD_ID_GET_MEASUREMENT_PERIOD` | `0x1C` | none | h→d | `u32` LE tick count | high | optional (verify) |
| `SKIP_CMD_ID_START_MEASUREMENTS` | `0x18` | Cyclops: `GCyclopsStartMeasurementsParams` (see §5) | h→d | default resp | high | yes |
| `SKIP_CMD_ID_STOP_MEASUREMENTS` | `0x19` | none | h→d | default resp | high | yes |
| `SKIP_CMD_ID_SET_LED_STATE` | `0x1D` | `color`, `brightness` (`GSkipComm.h:341-355`) | h→d | default resp | medium | no |
| `SKIP_CMD_ID_GET_MEASUREMENT_STATUS` | `0x30` | none (Cyclops ext) | h→d | `GSkipGetMeasurementStatusCmdResponsePayload` (see §6) | high | yes — trigger detection |
| `SKIP_CMD_ID_GET_MEASUREMENTS` | `0x31` | `GSkipGetMeasurementsParams` (non-realtime buffer readout) | h→d | chained byte stream, `int32` LE microns | medium | no (realtime only in M0) |
| `SKIP_CMD_ID_GET_SERIAL_NUMBER` | `0x20` | none | h→d | week/year BCD + `u32` counter | low | no (Cyclops "does not support serial #" — `GSkipCommExt.h:64`) |

Command IDs: `GSkipCommExt.h:48-63`. Cyclops extension IDs: `GCyclopsCommExt.h:58-61`.

**Init sequence the native SDK runs on open** (`GoIO_DLL_interface.cpp:595-655`):

1. Open the HID device.
2. `SKIP_CMD_ID_INIT` with Cyclops params `{hostType: 2, forcePowerOnDefaults: 0}`,
   timeout `SKIP_TIMEOUT_MS_DEFAULT`. Retried internally until the slave CPU is
   done powering up (`GSkipDevice.cpp:96-156`; statuses
   `SKIP_STATUS_ERROR_SLAVE_POWERUP_INIT 0x40` / `…POWERRESTORE_INIT 0x41` mean
   "still booting, retry").
3. Clear the measurement packet queue.
4. **DDS read is faked for Cyclops** — the SDK does *not* read DDS memory off
   the device; it synthesizes the record in software (`GCyclopsDevice.cpp:158-198`).
   See §4.
5. (native then also does `SET_LED_STATE`, and for *analog* sensors
   `SET_ANALOG_INPUT_CHANNEL` — **not** needed for Cyclops.)

Then, per acquisition (`GoIO_LiveMotion.cpp:266-280,376-418`):

6. `SKIP_CMD_ID_SET_MEASUREMENT_PERIOD` = `0.040` s.
7. `SKIP_CMD_ID_START_MEASUREMENTS` with trigger type
   (`BUTTON` to arm for the blue button, `IMMEDIATE` to start now).
8. poll `SKIP_CMD_ID_GET_MEASUREMENT_STATUS` (~10 Hz) for the `TRIGGERED` bit
   and drain measurement packets.
9. `SKIP_CMD_ID_STOP_MEASUREMENTS` to end; re-`START` with `BUTTON` to re-arm.

There is **no software "trigger now" command**. Host-commanded start = `STOP`
then `START(IMMEDIATE)`; that also bumps `dataRunSignature`
(`GoIO_LiveMotion.cpp:392-404`).

---

## 4. Calibration — raw → metres

**Cyclops DDS is synthetic** (`GCyclopsDevice.cpp:158-198`):

- `CalibrationEquation = kEquationType_Linear`
- Cal page 0: `A = 0.0`, `B = 1.0`, units `"(m)"` — active page
- Cal page 1: `A = 0.0`, `B = 3.2808399`, units `"(ft)"`
- `MinSamplePeriod = 0.020 s`, `TypSamplePeriod = 0.100 s`

**Two-step conversion** (`GoIO_LiveMotion.cpp:362-364`):

1. `ConvertToVoltage(raw)` for Cyclops = `raw * 0.000001`
   (`GCyclopsDevice.h:75-76`). Raw measurements are **`int32` in microns**
   (`GSkipComm.h:508`, `GCyclopsCommExt.h:151`), so this yields **metres**.
2. `CalibrateData(x)` = linear `A + B*x` = `0.0 + 1.0*x` for page 0
   (`GMBLSensor.cpp:331-347`, `CalibrateData_Linear`).

**Net for Milestone Zero:** `positionMeters = rawInt32Microns * 1e-6`.
For feet, multiply by `3.2808399`. **Confidence: high** (all in source);
sign handling + physical sanity **must be confirmed on hardware**.

---

## 5. `START_MEASUREMENTS` parameters (Cyclops)

`GCyclopsStartMeasurementsParams` (`GCyclopsCommExt.h:122-130`,
packet form `GSkipComm.h:256-266`), one byte each after `cmd = 0x18`:

| offset | field | M0 value | meaning |
|---|---|---|---|
| 1 | `triggerType` | `0` immediate / `1` button | `CYCLOPS_TRIGGER_TYPE_IMMEDIATE 0`, `_BUTTON 1`, `_DELAYED 7` (`GCyclopsCommExt.h:88-90`) |
| 2 | `lsbyteMeasurementCount` | `0` | count `u16 == 0` ⇒ **real-time streaming** |
| 3 | `msbyteMeasurementCount` | `0` | (non-zero ⇒ fixed-count on-device logging, not used) |
| 4 | `realTimeMeasType` | `0` | `CYCLOPS_MEAS_TYPE_DISTANCE 0`, `_VELOCITY 1`, `_ACCEL 2` (`GCyclopsCommExt.h:92-94`) |
| 5 | `flags` | `0` | temperature-compensation bits; `0` = dynamic (`GCyclopsCommExt.h:96-99`) |
| 6 | `filterType` | `0` | `CYCLOPS_FILTER_NONE 0`. In real-time mode only `0` or `7..9` are legal (`GCyclopsCommExt.h:111-115`) |

Native `FillStartParams` sets exactly `triggerType`, `realTimeMeasType =
DISTANCE`, `filterType = NONE`, rest 0 (`GoIO_LiveMotion.cpp:220-226`).

---

## 6. Measurement + status packet layout (device → host)

### Real-time measurement packet — `GCyclopsMeasurementPacket` (`GSkipComm.h:95-105`)

8 bytes, header nibble `& 0xC0 == 0x00`:

| byte | field | notes |
|---|---|---|
| 0 | `nMeasurementsInPacket` | **always 1** for Cyclops; top 2 bits are 0 (that *is* the "measurement" stream tag) |
| 1 | `nRollingCounter` | increments per packet — use for **drop detection** |
| 2..5 | `meas` `int32` **little-endian**, **microns** | `OSConvertBytesToInt(ls,.., ms)` (`GCyclopsDevice.cpp:100-101`) |
| 6 | `measurementType` | `CYCLOPS_MEAS_TYPE` echo |
| 7 | `reserved` | — |

(The non-Cyclops `GSkipMeasurementPacket` packs up to 3 × `int16`; Cyclops does
**not** use that form.)

### `GET_MEASUREMENT_STATUS` response payload (`GCyclopsCommExt.h:180-188`)

after the 2-byte `{header, cmd}`:

| byte | field | notes |
|---|---|---|
| 0 | `flags` | `0x80` real-time meas enabled, `0x40` non-realtime enabled, `0x20` **TRIGGERED**, `0x10` realtime-data, low bits battery state (`0x0C` mask) (`GSkipCommExt.h:172-178,238-246`) |
| 1 | `triggerType` | echo of `CYCLOPS_TRIGGER_TYPE` |
| 2..3 | `measurementCount` `int16` | `0` while real-time in progress |
| 4 | `dataRunSignature` | **increments on each new trigger** — the native "a run started" signal |
| 5 | `filterType` | — |

**Trigger / blue-button detection (native method, `GoIO_LiveMotion.cpp:304-345`):**
there is *no* async button event. The host **polls `GET_MEASUREMENT_STATUS`**
~10 Hz; a `0→1` edge on `flags & 0x20` (TRIGGERED) = "run started"
(blue button pressed, or `IMMEDIATE` start took effect); `1→0` = "run stopped".
`dataRunSignature` bumping corroborates. **Confidence: high (native)** that this
works over the SDK; **medium** that WebHID delivers `GET_MEASUREMENT_STATUS`
responses fast enough for a crisp button edge.

---

## 7. Measurement period / timing

- Tick = **`0.001 s`** for Cyclops (`GCyclopsDevice.h:71`
  `GetMeasurementTickInSeconds`). `SET_MEASUREMENT_PERIOD` takes a `u32` LE tick
  count (`GSkipBaseDevice.cpp:666-683`): 0.040 s → **40 ticks** → bytes
  `28 00 00 00`.
- Legal Cyclops period range: min `0.02 s` (`0.04 s` in "OPUS_LITE" builds),
  max `180 s` (`GCyclopsDevice.cpp:50-55`).
- Native Motion World baseline: `0.040 s` ⇒ **25 Hz** (`GoIO_LiveMotion.cpp:279`).
- **The spike must not trust this** — it measures actual `inputreport`
  arrival intervals and reports mean / stdev / min / max, plus lag growth over
  a 5-minute run.

---

## 8. Time base

- Packets carry **no timestamp** and **no sample index** — only the 1-byte
  `nRollingCounter`. Native derives sample time as `sampleIndex * 0.040`
  reset to 0 at each trigger (`GoIO_LiveMotion.cpp:332,364`).
- Motion World Web rule (design §4.1): `MotionSample.timestampSeconds =
  tickIndex * configuredPeriodSeconds`, acquisition-relative, monotonic.
  Wall-clock `performance.now()` of each `inputreport` is kept **only** as
  diagnostic provenance.

---

## 9. Clean shutdown

`STOP_MEASUREMENTS` (`0x19`), then close the HID device. `INIT` also stops
measurements. Native re-arms with `START(BUTTON)` after every stop so the blue
button is always live between runs (`GoIO_LiveMotion.cpp:406-418`).

`DEVICE_LOST`: native infers it from **10 consecutive `GET_MEASUREMENT_STATUS`
failures** (~1 s) (`GoIO_LiveMotion.cpp:347-356`). WebHID additionally fires a
`navigator.hid` `disconnect` event — the spike uses that as the primary signal
and the status-poll stall as backup.

---

## 10. Summary — what Milestone Zero encodes / decodes

**Encode (host→device, all 8-byte, sent as report ID 0):**

| purpose | bytes (hex) |
|---|---|
| INIT | `1A 02 00 00 00 00 00 00` |
| SET_PERIOD 0.040 s | `1B 28 00 00 00 00 00 00` |
| START realtime distance, button-armed | `18 01 00 00 00 00 00 00` |
| START realtime distance, immediate | `18 00 00 00 00 00 00 00` |
| STOP | `19 00 00 00 00 00 00 00` |
| GET_MEASUREMENT_STATUS | `30 00 00 00 00 00 00 00` |
| GET_STATUS (versions) | `10 00 00 00 00 00 00 00` |

**Decode (device→host, 8-byte):**

- `(b0 & 0xC0) == 0x00` → measurement: `micron = int32LE(b2..b5)`,
  `metres = micron * 1e-6`, `counter = b1`.
- `(b0 & 0xC0) == 0x40` → cmd response: `b1` = cmd echo, `b0 & 0x20` = error,
  `b0 & 0x07` = payload length; for `GET_MEASUREMENT_STATUS` the payload is
  `flags,triggerType,countLo,countHi,runSig,filter`.
- `(b0 & 0xC0) == 0x80` → INIT response (`b0 & 0x20` = error).
- `(b0 & 0xC0) == 0xC0` → idle/notification, ignore.

**Hardware-confirmed (2026-09-07 — see §0):**

1. ✅ Enumerates as VID `0x08F7` / PID `0x0004`, plain HID, no driver, `Go! Motion ver 1.02`.
2. ✅ `sendReport(0, …)` physically reaches the device (INIT delivered; no feature-report fallback needed).
3. ✅ `inputreport` delivers an 8-byte payload with `reportId` 0 and the header byte intact.
9. ✅ INIT request `1a 02 …` → valid INIT response `9a 1a …` (error flag clear).
   Work-network policy permits WebHID.

**Still uncertain — next physical test:**

4. Real-time streaming actually starts and sustains ~25 Hz with acceptable jitter and no lag growth. (medium)
5. `SET_MEASUREMENT_PERIOD` and `START/STOP_MEASUREMENTS` are accepted; measurement packet layout. (medium)
6. `GET_MEASUREMENT_STATUS` round-trips fast enough to see a clean blue-button edge. (medium)
7. `navigator.hid` `disconnect` fires promptly on unplug; `getDevices()` + re-open works after replug and after refresh. (medium)
8. Sign/scale of the microns value matches physical distance from the sensor. (medium)
