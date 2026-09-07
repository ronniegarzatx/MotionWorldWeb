# Motion World Web — V1 Architectural Design

**Status:** DESIGN — awaiting human review. No implementation plan, no code, no
Vite scaffold until this document is approved.
**Date:** 2026-09-06
**Predecessor:** Motion World native V1.0.0 (`github.com/ronniegarzatx/MotionLab`,
tag `v1.0.0`). Motion World Web is a **fresh, independent** project — it inherits
the *product knowledge and the numerical ideas*, not the desktop code.

---

## 1. Goals

1. **Zero-install classroom instrument in the browser.** A teacher on a locked-down
   Windows school PC plugs in a Vernier CBR 2 / Go!Motion sensor, opens a URL in
   the Chrome or Edge that is already on the machine, clicks **Connect Sensor**,
   approves the one browser permission prompt, and teaches — then projects it.
2. **Projector-first.** Every screen is legible from the back of a classroom:
   large numbers, a dominant graph or readout, minimal chrome, unambiguous state.
3. **Preserve the pedagogy of native V1**, especially the parts that were hard-won:
   the immutable raw run, the Classroom Snapshot coordinate rescaling, the
   collapsed-by-default POINTS table, the large classroom-approximate equation over
   a smaller precise fit, the honest two-point-slope-vs-regression distinction in
   Speed Lab, and the "steps not jumps" Sequence Lab vocabulary.
4. **Local, private, durable.** Completed runs are saved in the browser (IndexedDB)
   and survive refresh, browser restart and reboot as far as browser policy allows.
   No account, no backend, no telemetry.
5. **A clean architecture that a future student-broadcast feature could bolt onto**
   without a rewrite — by keeping presentation state serializable — while adding
   **zero** networking code now.

## 2. Non-goals (explicit — do not build these in Web V1)

- **No Inverse Lab, no Walk the Line, no Pendulum Lab.** (Native tools deliberately
  left out of the browser V1 scope.)
- **No standards browsing / standards filing UI / standards import.**
- **No student accounts, teacher accounts, login, roster, or classroom "room codes".**
- **No backend service of any kind.** No API server, no database server, no auth
  server, no realtime server.
- **No cloud sync.** Runs live only in the local browser profile.
- **No student live-view / broadcast / mirroring implementation.** (Architecturally
  *possible later*; not implemented, not stubbed with network code.)
- **No local helper, driver, service, or companion app.** No Python, no native
  Windows helper, no `localhost` web server, no browser extension. If direct
  browser sensor access proves impossible or unreliable, that is a **finding to
  report** (Section 15), not a licence to add a helper.
- **No Chromebook-specific work.** ChromeOS may happen to work; V1 is not
  complicated or delayed for it.
- **No Pyodide, no Python-in-browser, no SciPy/NumPy runtime.** Numerical routines
  are ported to small, focused TypeScript modules.
- **No heavyweight UI framework adopted for popularity.** (See Section 12.)
- **No `Motion World.app` / installable PWA requirement** for V1 (a manifest that
  makes it *installable* is fine and cheap; it is not a goal to gate on).
- Revived native concepts that are gone for good: Activity Library, "Coming
  Soon" / roadmap rows, pseudo-mode launchers, a Detail screen between Home and a
  tool.

## 3. Browser & platform constraints

| | Web V1 target |
|---|---|
| **Primary** | Windows 10/11 + current **Chrome** or **Edge** (Chromium), desktop, keyboard + mouse, projector attached |
| **Bonus (no extra work)** | macOS Chrome/Edge/Brave, Linux Chromium |
| **Bonus (later, not V1)** | ChromeOS / Chromebook |
| **Not supported** | Safari, Firefox (no WebHID), iOS/Android, in-app webviews |

**Hard constraints that shape the architecture:**

- **WebHID is Chromium-only and requires a secure context** (`https://` or
  `http://localhost`). The deployed app must be served over HTTPS. Static hosting
  is sufficient (see Section 9).
- **WebHID needs a user gesture** to call `navigator.hid.requestDevice()`. The
  browser shows its own device chooser; the site cannot enumerate devices silently.
- **One granted device per origin per profile**, remembered across sessions
  (`navigator.hid.getDevices()` returns previously-granted devices), but a
  `connect()` still needs the physical device present. See Section 15.5 for the
  exact V1 contract on initial pairing vs. reconnect after refresh.
- **School-managed browsers** may disable WebHID by enterprise policy
  (`WebHidAllowDevicesForUrls` / blocklist). This is an environmental risk the
  feasibility spike must probe on the actual work PC (Section 15).
- **No filesystem, no raw USB, no serial** assumptions — WebHID only. (WebUSB and
  Web Serial are noted as fallbacks *to investigate in the spike*, not designed for.)

## 4. Sensor boundary — the single most important seam

```
        Vernier CBR 2 / Go!Motion  (USB HID, Vernier VID 0x08F7)
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │  GoMotionWebHIDAdapter               │   <-- the ONLY module that
        │   implements SensorAdapter           │       knows HID report bytes
        └─────────────────────────────────────┘
                       │  SensorAdapter interface (transport-agnostic)
                       ▼
        ┌─────────────────────────────────────┐
        │  AcquisitionController               │   one instance, app-lifetime
        │   owns connection + state machine    │
        └─────────────────────────────────────┘
                       │  emits: state changes, samples, trigger/button events
                       ▼
        ┌─────────────────────────────────────┐
        │  MotionRun  (immutable)              │   the authoritative record
        └─────────────────────────────────────┘
              │                 │                 │
              ▼                 ▼                 ▼
           Labs            Analysis          Local Run Store
        (read-only)     (pure functions)     (IndexedDB)
```

### 4.1 `SensorAdapter` (interface)

```ts
interface SensorSample { tSeconds: number; positionMeters: number; }

type SensorStatus =
  | "disconnected"      // no device object / not opened
  | "connecting"        // requestDevice / open in flight
  | "ready"             // opened, DDS read, period set — not measuring
  | "measuring"         // streaming samples
  | "error";            // see .lastError

interface SensorAdapter {
  readonly kind: string;                 // "go-motion-webhid"
  readonly status: SensorStatus;
  readonly deviceLabel: string | null;   // "Go!Motion" / "CBR 2" if known

  requestAndConnect(): Promise<void>;    // user-gesture entry point
  reconnectKnown(): Promise<boolean>;    // silent, on load, if permission persists
  disconnect(): Promise<void>;

  start(opts?: { trigger?: "immediate" | "button" }): Promise<void>;
  stop(): Promise<void>;

  // events (EventTarget or a tiny emitter)
  on("sample",  (s: SensorSample) => void): void;   // one per measurement tick
  on("button",  (e: { pressed: boolean }) => void): void;   // physical blue button, if exposed
  on("status",  (s: SensorStatus) => void): void;
  on("lost",    () => void): void;       // unplug / device gone
}
```

- **Nothing above the adapter references HID, report ids, byte layouts, the GoIO
  command set, or calibration equations.** All of that lives inside
  `GoMotionWebHIDAdapter`.
- The adapter converts raw counts → volts → **meters** using the sensor's own
  on-board calibration (DDS memory: linear `a + b·x` plus units), exactly as the
  native `GoIO_LiveMotion` helper does — this is a *port of the command sequence*,
  not the C++.
- The adapter assigns each sample a **monotonic time** derived from the configured
  measurement period and the tick index (native uses 0.040 s ≈ 25 Hz), *not*
  `performance.now()`. Wall-clock arrival time is recorded separately as
  diagnostic metadata only.
- A second adapter (a **replay/simulator adapter** driven by a saved run or a
  synthetic function) implements the same interface and is the backbone of testing
  and of developing labs without hardware.

### 4.2 Retained architectural rules (from native, non-negotiable)

- **One persistent sensor connection** for the app's lifetime; labs never open,
  close, or reconfigure it.
- **One `AcquisitionController`.** It is the sole owner of the connection and the
  sole authority for the acquisition state machine.
- **One authoritative sample stream.** Labs subscribe; they do not poll the device.
- **Labs do not own USB / HID / the adapter.**
- **Raw samples are immutable** once recorded into a `MotionRun`.
- **All filtering, smoothing, coordinate transforms, and analysis are downstream**
  and produce *new* values; a derived view never rewrites a raw observation.
- A single input never both arms and starts: `SENSOR_READY → MEASURING` happens
  only on a **trigger event** (physical button or the on-screen/keyboard Start,
  which both raise the same event).

## 5. Acquisition state

State machine (ported verbatim in spirit from native `core/acquisition.py`):

```
NO_DEVICE ──connect──▶ SYSTEM_READY ──arm(Q / Arm)──▶ SENSOR_READY ──trigger──▶ MEASURING
   ▲                        │                              │  ▲                     │
   └────────── lost ────────┴──────── lost ────────────────┘  └──── trigger/stop ───┘
```

- **`NO_DEVICE`** — no adapter connection.
- **`SYSTEM_READY`** — device connected and identified; not armed.
- **`SENSOR_READY`** — armed and waiting; the measurement config is pushed; a
  trigger (button or Start) begins collection.
- **`MEASURING`** — samples streaming into the active run buffer.
- Stop reasons are recorded: `user_stop` (Start/Stop toggle or button),
  `navigation` (left the tool), `device_lost`, `activity_limit` (a lab-imposed max
  duration, if any).
- Events from the adapter: `connected`, `lost`, `button`; the controller also
  accepts UI intents: `arm`, `disarm`, `start`, `stop`.
- **Keyboard parity:** `Space` = Start/Stop toggle, and an explicit Arm control;
  the physical blue button raises the same trigger event as Start. No hidden
  key does anything a visible control cannot.
- The controller exposes a small immutable `AcquisitionUiState`
  `{ state, connected, deviceLabel, canArm, canStart, canStop, lastStopReason }`
  that every tool's status strip renders.

## 6. Run / data model

```ts
// immutable value objects (frozen; never mutated in place)

interface RawSample { readonly t: number; readonly x: number; }   // seconds, meters

interface MotionRun {
  readonly id: string;                 // uuid
  readonly createdAt: number;          // epoch ms (wall clock, for sorting only)
  readonly samples: readonly RawSample[];   // THE raw observations, immutable
  readonly samplerHz: number;          // nominal measurement rate used
  readonly source: "sensor" | "replay" | "synthetic";
  readonly deviceLabel: string | null;
  readonly label: string;              // teacher-editable display name
  readonly durationS: number;          // samples[last].t - samples[0].t (or 0)
}
```

- A run is created **once**, when `MEASURING` ends. During `MEASURING` there is a
  mutable append-only buffer inside the controller; on stop it is frozen into a
  `MotionRun` and published.
- **Everything a lab shows is derived from a `MotionRun` by a pure function** and
  is recomputed, never cached into the run.
- **Analysis window** (`AnalysisWindow`): an immutable `{ run, startT, endT }` (or
  "full run"); a reversible selection over the raw samples. Snapshot Lab and Speed
  Lab share it. Selecting a window never copies or edits samples.
- **Classroom transform** (Snapshot): a pure `ClassroomTransform`
  `{ tOrigin, xOrigin, tScale, xScale }` mapping the selected window's raw
  `(t, x)` onto a small friendly grid; the *display* points are additionally
  rounded to the nearest 0.5, but the **fit is performed on the un-rounded
  transformed points**. (Ported native behaviour.)
- **Model fit** (`FitResult`): `{ family, coefficients, expression, r2, predict }`.
  The **classroom-approximate equation is a display-only string transform** of
  `expression` (snap each coefficient: within 0.15 of an integer → the integer;
  else within 0.15 of a half → the half; else one decimal; then tidy `1x → x`,
  drop `0` terms; a snap that would erase the family falls back to one-decimal).
  `FitResult` itself, `r2`, and `predict` are never touched. (Ported verbatim from
  native `ui/classroom_equation.py` — port the algorithm, not the Python.)

## 7. Persistence — local saved runs

- **Store:** IndexedDB, one database `motion-world`, object store `runs` keyed by
  `id`, plus a `meta` store for app settings (theme, last tool).
- **Persistence request:** on first successful save, call
  `navigator.storage.persist()` (best-effort). Show the granted/denied result in
  Settings, honestly.
- **Durability expectation, stated plainly in the UI:** runs normally survive
  navigation, refresh, closing and reopening the browser, and a reboot. They can
  be lost if the user or an admin clears site data / browsing data, if the browser
  evicts storage under pressure without persistence granted, or if the school
  reimages the machine. Motion World Web never deletes runs on a schedule.
- **Run store API (pure-ish, all async):**
  `saveRun(run)`, `listRuns({ limit, order })`, `getRun(id)`, `deleteRun(id)`,
  `clearAllRuns()`.
- **UI surface (built incrementally, not all in Milestone Zero):** a **Runs** panel
  — *Recent Runs* list (newest first, label + date + duration + a sparkline),
  *Open Run* (loads it into the current lab as a replay `MotionRun`), *Delete Run*
  (with confirm), *Clear All Runs* (with a stern confirm).
- **Raw run data in the store is immutable.** "Rename" edits only the `label`.
  Re-analysing a saved run produces new derived values; the stored `samples` are
  never rewritten. An "Open Run" is a read; it does not touch the sensor or the
  acquisition state.
- **Size guard:** a run is a few thousand `{t,x}` pairs (~tens of KB as packed
  `Float32Array`s). Store samples as typed arrays / structured clone, not JSON
  strings. A soft cap (e.g. keep the most recent N and warn) can be added later;
  V1 does not auto-prune.

## 8. Five-tool navigation

**Home** = five large equal peer tiles, nothing else competing:

1. **Live Lab**
2. **Data Display**
3. **Snapshot Lab**
4. **Speed Lab**
5. **Sequence Lab**

Plus a persistent, non-tile **status/util area** (a slim bar, not a tile):

- **Sensor status + Connect Sensor** — connection state, device label, the
  Connect / Disconnect action. Visible on Home and inside every tool.
- **Runs** — opens the Runs panel (overlay/drawer).
- **Settings** — only if genuinely needed (theme; storage-persistence status;
  measurement-rate override for the spike). Not a dumping ground.

Navigation model:

- Client-side routing, hash or History API, one route per tool
  (`/live`, `/data`, `/snapshot`, `/speed`, `/sequence`), `/` = Home,
  `/runs` is an overlay not a page. No nested/detail routes.
- Every tool has a **Home** affordance (one consistent control, top-left), and a
  short one-line instruction + an **info / Guide** affordance. No ambiguous "Back".
- Leaving a tool: the acquisition connection **stays open**; an in-progress
  `MEASURING` is stopped with reason `navigation`; the armed/`SENSOR_READY` latch
  is a product decision to make in the plan (native kept Q armed across a tool;
  web can match).
- **Deleted-for-good concepts are not routes and not tiles:** Activity Library,
  Standards UI, roadmap/Coming-Soon, pseudo-mode launchers, account screens.

### 8.1 UI principles

The browser UI is a **substantial redesign** — it does *not* reproduce the
Tkinter widget geometry. It preserves the pedagogy and the best interaction
ideas, not the desktop layout.

- **Modern, projector-first, minimal chrome.** The graph or the readout owns the
  screen; controls are a slim, unambiguous strip. Large, readable maths.
- **State is always visible and unambiguous** — connection state, readiness,
  measuring/frozen, which run is shown.
- **Simple classroom controls** — Connect, Arm, Start/Stop, Reset. `Space`
  toggles Start/Stop; the physical blue button does the same.
- **Responsive** at ordinary school desktop/projector resolutions
  (≈1280×800, 1366×768, 1920×1080); degrades to a "make the window larger" hint
  below ≈1024×640 rather than clipping.
- **Home** = five large peer tiles (Live Lab, Data Display, Snapshot Lab, Speed
  Lab, Sequence Lab), nothing competing. Secondary, non-tile: sensor status /
  Connect, Runs, and Settings *only if genuinely needed*.
- **Light and dark themes** are a goal, but **not** for Milestone Zero — do not
  over-design the spike.
- **Do not recreate** Activity Library, a standards-filing UI, roadmap / "Coming
  Soon" rows, pseudo-mode launchers, or any teacher/student account bureaucracy.

## 9. Hosting / deployment (constraint, not a build task for now)

- **Static site over HTTPS.** Output of `vite build` is a folder of static assets;
  any static host works (GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket, a
  school web server). **No server-side code, no serverless functions.**
- WebHID works from that static origin because the requirement is *secure context*
  + *user gesture*, not a backend.
- Local dev uses `vite` dev server on `http://localhost` (a secure context for
  WebHID). No other local process.
- The repo will carry no deployment credentials; "where it is hosted" is a later,
  separate decision and is out of scope for the design.

## 10. Future student-viewing seam (design-only, zero code now)

- Keep a single serializable **`PresentationState`** object that fully describes
  "what the projector shows right now":

```ts
interface PresentationState {
  activeTool: "live" | "data" | "snapshot" | "speed" | "sequence" | "home";
  activeRunId: string | null;
  window: { startT: number; endT: number } | null;   // analysis window
  graphViewport: { xMin: number; xMax: number; yMin: number; yMax: number } | null;
  displayOptions: Record<string, unknown>;   // per-tool: model family, reveal step, theme…
  derivedReadouts: Record<string, string>;   // the big numbers currently on screen
  revision: number;                          // monotonic
}
```

- The app already needs most of this to drive its own rendering; the seam is just
  **"compute it in one place, as a plain object, and re-render from it"** rather
  than scattering state through DOM.
- A *future* realtime service could serialize `PresentationState` and push it to
  read-only student browsers. **Web V1 writes no networking, no WebSocket, no
  signalling, no "broadcast" button.** The only obligation now: don't make
  presentation state un-serializable (e.g. don't stuff class instances or DOM
  nodes into it), and keep the "one source of truth → render" discipline. YAGNI
  for everything else.

## 11. Lab intent (what each of the five does — pedagogy, not widgets)

### Live Lab
- Real-time position-vs-time graph, the graph dominating the screen.
- Connection / readiness / measuring status shown as an unmistakable strip.
- Clean Start / Stop (Space or the on-screen control or the blue button).
- No modelling, no windowing — just the live trace and a clear "reset / new run".

### Data Display
- One **huge** current position value, filling the screen; time secondary and
  smaller. Legible across a room; scales with the viewport.
- Before the first sample: everything reads "—", nothing looks like data.
- Freezes on Stop; a reset returns to the blank state without disarming.
- Font-colour only for theme — no boxes, no cards (native lesson).

### Snapshot Lab  *(preserve native V1's final pedagogy exactly)*
- Record a walk; **the raw run is immutable**.
- **SELECT WINDOW** over the raw trace (reversible; raw never edited).
- **MAKE SNAPSHOT** → a Classroom Snapshot: the window rescaled onto a friendly
  classroom coordinate grid; display points rounded to the nearest 0.5; **the fit
  uses the un-rounded transformed points**.
- **POINTS table is collapsed by default** — on entry and after every snapshot.
  The graph is the dominant view. Opening POINTS eases the graph and gives the
  table a height-capped, scrolling viewport.
- **RAW RUN / CLASSROOM SNAPSHOT** toggle, each with a one-line plain-language
  description of what that view is and that the raw run is unchanged.
- Fit a supported classroom model (see below). The **large equation is a
  classroom approximation** `f(x) ≈ …`; a **smaller `precise fit: f(x) = …`** and
  `r²` sit underneath. The approximation is **display-only**.
- Model families for Web V1: **Constant, Linear, Quadratic** at minimum; **Cubic,
  Absolute value, Square root, Exponential** to match native if the ports are
  cheap. (Logarithm / Rational stay hidden, as in native, because the
  origin-anchored transform makes their shift unreliable.)
- A **Show large** view: the classroom equation big, the precise fit subordinate,
  never cropped (fit → shrink to a floor → split on `+`/`−` boundaries).

### Speed Lab
- From a position-vs-time run, derive **signed velocity** and **speed = |velocity|**.
- A clear calculation teaching view that **keeps the honest distinction** native
  fought for: the intuitive **two-point slope** `Δposition / Δtime` with the actual
  endpoint numbers substituted (shown as the biggest content) **vs** the
  **best-fit / regression slope through all the points** that the tool actually
  reports (shown clearly as the method used, with N and r²).
- A toward-the-sensor walk never displays "speed = <negative>"; direction (toward
  / away) is reported separately.
- Optional unit chain to mph (`× 2.237`) with the verdict pattern, if a limit is
  set — but the core is the rate-of-change teaching, not a "ticket" theme.
- SELECT WINDOW / FULL RUN re-fits over the chosen interval without recollecting.

### Sequence Lab  *(browser V1 = the core workflow; Bounce is deferred)*
- Turn a motion into a **number sequence** the student builds.
- **Timed capture** (default): terms committed on a clock (interval choices), the
  raw stream never slowed; the teaching index *n* is independent of the sample
  index.
- **Manual capture**: commit a term on a steady hold; a wobbly hold is refused.
- **Arithmetic** and **Geometric** readings (common difference ≈ / common ratio ≈,
  honest "not constant yet" when it is not); Fibonacci optional if cheap.
- **Start index n = 0 / n = 1** toggle; the shown range relabels immediately.
- **Explicit and recursive** relationships, revealed progressively; vocabulary is
  **"steps"**, never "jumps".
- A **non-destructive analysis range** (trim a contaminated leading/trailing term
  without deleting it) if it ports cleanly.
- **Bounce sampling is explicitly out of Web V1** and must not gate the first
  browser release. It can be added later, on top of the stable core, reusing the
  same sequence engine (a `cycle-analysis.ts` port of the native peak detector).

## 12. Application stack

| Concern | Choice | Rationale |
|---|---|---|
| Build / dev | **Vite** | fast, static output, zero-config TS, no framework lock-in |
| Language | **TypeScript**, `strict` | the sensor/state/model layers need real types |
| UI | **browser-native DOM + small component modules + CSS** | projector-first UI is mostly layout + a graph + big text; a framework adds weight and a render model we don't need |
| **React?** | **No**, unless the plan surfaces a concrete, V1-specific reason it materially helps | avoid the bundle, the build complexity, and the "everything is a hook" pull for a 5-screen instrument |
| Sensor | **WebHID** | only zero-install path to the device |
| Storage | **IndexedDB** (+ `navigator.storage.persist()`) | durable, local, no backend; typed-array friendly |
| Graphs | **SVG for static/overlay graphs; Canvas for the live stream** if profiling shows SVG can't keep 25 Hz smoothly. A lightweight lib (e.g. µPlot-class) only if it clearly beats hand-rolled on projector clarity + interaction + maintenance. | decide with a spike, not by reputation |
| Numerics | **focused TS modules** ported from native (`fit-models.ts`, `classroom-equation.ts`, `analysis-window.ts`, later `motion-derivatives.ts`, `cycle-analysis.ts`) | **no Pyodide, no SciPy, no NumPy** |
| Tests | **Vitest** (unit / pure), **Playwright** (DOM + a mock HID device) | see Section 14 |

- Dependencies kept small and audited. No state-management library, no CSS
  framework, no component library for V1.
- The numerics ports are **pure functions with their own tests mirroring the
  native test cases** (e.g. the classroom-equation snap examples: `-0.99 → -1`,
  `2.46 → 2.5`, `1.27 → 1.3`, quadratic keeps its `x²`, …).

## 13. Repository layout (planned — not scaffolded yet)

```
MotionWorldWeb/
  README.md
  docs/
    superpowers/
      specs/2026-09-06-motion-world-web-v1-design.md   ← this document
  (later, after plan approval:)
  index.html
  src/
    main.ts
    sensor/
      SensorAdapter.ts          # interface + shared types
      GoMotionWebHIDAdapter.ts   # the ONLY HID-aware module
      ReplayAdapter.ts           # saved-run / synthetic driver (for dev + tests)
    acquisition/
      AcquisitionController.ts
      state.ts
    model/
      MotionRun.ts
      AnalysisWindow.ts
      ClassroomTransform.ts
      fit-models.ts
      classroom-equation.ts
    store/
      runStore.ts                # IndexedDB
    presentation/
      PresentationState.ts
    ui/
      home/  live/  data/  snapshot/  speed/  sequence/
      components/  theme.css
  test/  (vitest + playwright)
```

## 14. Testing strategy

- **Pure numeric modules** (`fit-models`, `classroom-equation`, `analysis-window`,
  transforms): Vitest, table-driven, **port the native test cases directly** so
  behaviour is provably equivalent (the native suite is the oracle).
- **`AcquisitionController`**: unit-tested against a **`FakeSensorAdapter`** that
  scripts `connected` / `sample` / `button` / `lost` — every state transition, the
  "trigger is the sole authority" rule, stop reasons, disarm-on-navigate.
- **`GoMotionWebHIDAdapter`**: tested against a **mock `HIDDevice`** replaying
  captured real report traffic from the feasibility spike (input reports in,
  output reports asserted). This is the only place HID bytes are asserted.
- **Run store**: Vitest with `fake-indexeddb`; save/list/get/delete/clear,
  immutability of stored samples, survives a simulated reload.
- **UI**: Playwright drives the built app with a **mock WebHID** shim
  (`navigator.hid` stubbed to the replay adapter) — Home shows five tiles;
  Connect → chooser → ready; Live Lab draws a trace; Snapshot POINTS starts
  collapsed and a snapshot doesn't open it; the classroom equation is the large
  one and the precise fit is present; Speed Lab shows both slope framings; no
  status text clips at 1280×800 / 1366×768 / 1920×1080.
- **Projector-legibility check**: a Playwright pass at classroom resolutions
  asserting minimum computed font sizes for the "critical math" elements and no
  horizontal overflow — the web analogue of the native projector audit.
- **A real-hardware smoke checklist** (manual, documented) for the teacher's PC —
  never claimed as automated.
- CI runs Vitest + Playwright headless; **no hardware in CI**.

## 15. Feasibility spike — Milestone Zero

> **STATUS: PASSED (2026-09-07) — feasibility class A, DIRECT WEBHID VIABLE,
> HARDWARE VERIFIED.** Windows work PC + Chrome + GitHub Pages HTTPS + Vernier
> **Go! Motion ver 1.02** (VID `0x08F7`, PID `0x0004`). No native helper, Python
> service, Motion World driver, backend, or admin rights required. Confirmed on
> real hardware: plain-HID enumeration; INIT round-trip; `SET_PERIOD` + `START` +
> real distance stream at **25.0 Hz / ~40 ms**; a **1894-sample, 75.7 s**
> completed `MotionRun`; physical blue-button **STOP**; auto-reconnect of a
> previously granted device on startup; `micron × 1e-6 → metres` plausible across
> ≈ 0.16–4.30 m. Details: `docs/research/go-motion-webhid-protocol.md` §0.
> Not yet demonstrated (small follow-ups, non-blocking): physical-button START,
> a deliberate unplug/replug cycle, many-cycle + >5-min endurance, formal
> calibration.
>
> The architectural risk that justified the spike is **retired**. Development now
> proceeds as the Motion World application (Milestone 1+), with the spike's
> protocol diagnostics kept behind a developer route.

**Milestone Zero was a deliberately tiny WebHID sensor spike. It did not build
the five labs or polished UI.**

### 15.1 What it is
A single page: a **Connect Sensor** button, a **Start/Stop** pair, a plain table
of `time / position`, and an **event log**. Ugly is fine.

```
CONNECTED — Go!Motion

  Time      Position
  0.000     1.427 m
  0.040     1.431 m
  0.080     1.438 m
  ...

EVENT LOG
  10:31:02  device chooser opened
  10:31:04  device opened  (VID 0x08F7  PID 0x0004)
  10:31:04  DDS read: linear cal a=… b=…  units=m
  10:31:04  measurement period set 0.040 s
  10:31:07  START (trigger: button)
  10:31:12  STOP  (245 samples, 9.8 s)
  10:31:20  device lost (unplug)
```

### 15.2 What it must investigate and write down
- **Device identity:** exact `vendorId` / `productId` reported by the CBR 2 *and*
  a Go!Motion (Vernier VID is `0x08F7`; native GoIO SDK calls the motion sensor
  "Cyclops", PID `0x0004` — confirm for the CBR 2 specifically), `productName`,
  the HID collections / report descriptor, and which report IDs exist.
- **Reports:** which **output/feature reports** initialise the device and start/stop
  measurements; which **input reports** carry samples; payload layout
  (counts → volts → meters via the on-board calibration).
- **Init sequence:** the command order to get from "opened" to "streaming"
  (mirror `GoIO_LiveMotion.cpp` `SetupDevice` / `FillStartParams`:
  read DDS, set measurement period, start measurements with a trigger type).
- **Streaming:** how samples arrive (event-driven `inputreport` vs. must-poll),
  the real achieved rate and its jitter, whether samples carry an index/timestamp
  or must be counted.
- **Start/stop:** clean start, clean stop, restart without re-init.
- **Physical blue button:** is a button press exposed as an input report / event?
  Can the device be armed to trigger on the button (native `triggerType`)?
- **Disconnect / robustness:** unplug during a run (does `lost` fire cleanly?),
  replug (does `getDevices()` still list it? does re-open work without a new
  permission prompt?), **page refresh** (silent reconnect via `getDevices()`),
  tab backgrounded, and a **several-minute continuous run** with no growing lag or
  memory creep.
- **Environment:** does WebHID actually work in the **teacher's real Windows work
  browser** (not just a dev machine), or is it blocked by enterprise policy? Does
  Windows need a driver for the device to appear at all (it should enumerate as
  plain HID — confirm)?

### 15.3 PASS criterion (all must hold, on the user's Windows work PC, in its Chrome or Edge)
1. Plug sensor → open the page → click **Connect Sensor** → the **browser device
   chooser lists a compatible device**.
2. Selecting it **connects successfully** (status → ready), no driver install, no
   helper, no admin rights.
3. **START** → **live distance measurements appear** in the table, updating
   steadily at roughly the expected rate, values physically sensible (metres,
   change as you move a target).
4. **STOP** cleanly; the table freezes.
5. **Repeat START/STOP reliably** several times in one session.
6. A **≥ 5-minute** continuous run streams without growing latency, without the
   page hanging, without unbounded memory growth.
7. **Unplug** → a clean "device lost" event (no crash); **replug + Connect** (or
   auto-reconnect) works again.
8. **Refresh the page** → the previously granted device reconnects (silently or
   with one click), no second OS/permission dance. **This is a SHOULD, not a hard
   PASS gate** — see Section 15.5.

### 15.4 FAIL handling
If any of 1–5 cannot be made to work reliably, **stop and report precisely why**
before any lab UI is built. Candidate findings to document:
- WebHID disabled by school browser policy → report as an environmental blocker
  (possible mitigations to *investigate*, not silently adopt: an enterprise policy
  allow-list the school could set; WebUSB/Web Serial as alternative transports;
  explicitly: **not** a bundled local helper).
- The GoIO command set can't be driven over WebHID (e.g. requires a report type
  WebHID won't send) → report the specific blocked operation.
- Sample rate / jitter unusable for a classroom graph → report measured numbers.
- Device needs a Windows driver to enumerate → report; that may end the
  zero-install premise and is a decision for the human.

### 15.5 WebHID pairing, reconnect, and secure-context contract (V1)

**Initial pairing (hard requirement).**
`navigator.hid.requestDevice({ filters })` **requires an explicit user gesture** —
a click on **CONNECT SENSOR**. The browser then shows its own device chooser; the
site cannot enumerate or open a device without the user picking it there. This
prompt-on-first-use behaviour is normal, expected, and must not be treated as a
defect.

**Previously granted sensor (SHOULD, not a hard V1 PASS requirement).**
On later page loads the app calls `navigator.hid.getDevices()` to retrieve the
`HIDDevice` objects the origin was already granted, and **attempts to reopen /
reconnect automatically** when browser behaviour permits (device present, no
policy change). This automatic silent reconnect after a page refresh, browser
restart, or reboot is **desired but optional**:

- If Chrome / Edge reconnects silently → good, report it.
- If Chrome / Edge requires the user to click **RECONNECT SENSOR** after a
  refresh / restart → **that is acceptable.** The app presents a single clear
  **RECONNECT SENSOR** control (distinct from the first-time **CONNECT SENSOR**,
  because no second OS permission dialog is involved — the grant persists).
- **Do NOT reject the WebHID architecture solely because a reconnect click is
  required.** A required reconnect click is a minor limitation (feasibility
  class **B**), never a class **E** failure.

**Secure context (hard requirement in deployment).**
WebHID is only available in a **secure context**. In normal deployment the app
**must be served over HTTPS** (static hosting is sufficient — Section 9).
`http://localhost` is also a secure context and **may be used during
development** and for a locally-served copy on the test PC.

**Policy / environment (out of the app's control).**
Browser or organisation policy (`WebHidAllowDevicesForUrls`, enterprise
blocklists, or WebHID disabled entirely) **may disable WebHID** regardless of
HTTPS and user gesture. The spike must detect this and report it as feasibility
class **D** (environment blocked), distinct from a hardware or protocol failure.

## 16. Milestone sequence (after this spec + a plan are approved)

> **2026-09-07 re-plan:** M0 passed; the M1–M3 rows below are consolidated. The
> live **Milestone 1** is *App shell + five-tool Home (Live + Data active) +
> Live Lab + Data Display*, driven by
> `docs/superpowers/plans/2026-09-07-motion-world-web-milestone-1.md`. The
> `SensorAdapter` / `GoMotionWebHIDAdapter` / `AcquisitionController` /
> `MotionSample` / `MotionRun` layer was built and hardware-verified during M0.

| M | Deliverable | Gate |
|---|---|---|
| **0** | **WebHID feasibility spike** (Section 15) — ugly diagnostic page + the sensor/acquisition/model layer | **PASSED 2026-09-07** — class A, hardware-verified on the real PC. |
| 1 | **App shell + Home (5 tiles, Live+Data active) + Live Lab + Data Display**; shared acquisition control; web-native design system; developer diagnostics behind `?debug=sensor` | projector audit passes; all software tests green; real-sensor acceptance on the Windows PC |
| 2 | `AnalysisWindow`, `runStore` (IndexedDB + persist), Runs panel (Recent / Open / Delete / Clear) | store tests green; runs survive a reload |
| 4 | **Speed Lab** — velocity/speed derivation + the two-slope teaching view | numerics ported + tested; slope-framing honest |
| 5 | **Snapshot Lab** — window, Classroom transform, collapsed POINTS, fit families, classroom-approx vs precise, Show large | classroom-equation tests match native; POINTS-collapsed contract |
| 6 | **Sequence Lab** — Timed + Manual, Arithmetic + Geometric, n=0/n=1, explicit/recursive, analysis range | sequence-engine tests |
| 7 | Home polish, theme (light/dark), responsive pass at classroom resolutions, PWA manifest (installable, optional), hardware smoke checklist | full Playwright + projector pass |
| (later) | Bounce sampling; PresentationState broadcast service; Inverse / Walk the Line / Pendulum | — |

## 17. Security & privacy

- **No data leaves the browser.** No network requests except loading the static
  app itself. No analytics, no error reporting service, no fonts/CDN calls that
  phone home (self-host fonts, or use system fonts).
- **WebHID permission** is per-origin, user-granted via the browser chooser, and
  revocable by the user in site settings. The app requests it only on an explicit
  **Connect Sensor** click, and explains why in one line.
- **Persistent-storage permission** is requested only on the first save and its
  result is shown honestly.
- **Local run data** is ordinary classroom measurement data (distances vs time) —
  no PII, no student identifiers (there are no student accounts). "Clear All Runs"
  is a real, immediate delete.
- **CSP** on the served page: `default-src 'self'`, `connect-src 'self'`, no
  inline script (Vite supports this), no `unsafe-eval`. This also structurally
  prevents an accidental backend call sneaking in.
- Static hosting over **HTTPS** (also a WebHID requirement).

## 18. Browser permission & connection behaviour (user-visible)

| Situation | What the user sees |
|---|---|
| First visit, no sensor action | Home with five tiles; status strip: "No sensor connected — Connect Sensor". No prompt. |
| Click **Connect Sensor** | Browser's own device chooser. App status: "connecting…". |
| Chooser: device present, selected | "Go!Motion connected — ready". Arm / Start controls enable. |
| Chooser: cancelled / no device | "No sensor selected." Nothing else changes. |
| Chooser: no compatible device listed | "No compatible sensor found. Check the cable and that it's a CBR 2 / Go!Motion." + link to the hardware note. |
| Return visit, permission remembered, device plugged | Silent reconnect attempt on load; on success: "Go!Motion connected — ready". |
| Return visit, permission remembered, device absent | "Sensor remembered but not plugged in — Connect Sensor when ready." |
| Unplug mid-session | Immediate "Sensor disconnected." Any run in progress is stopped and **kept** (frozen `MotionRun`, offered to save). |
| WebHID unavailable (Firefox/Safari) | A clear, friendly "Motion World Web needs Chrome or Edge on Windows" screen — not a broken Connect button. |
| WebHID blocked by policy | "Your browser is blocking sensor access (managed by your organisation)." + what an admin would need to allow. |

## 19. Failure states (must each have a defined, non-crashing behaviour)

- No WebHID in this browser → capability screen, app still opens saved runs.
- Permission denied / chooser cancelled → benign, retry available.
- Device present but init fails (bad DDS read, unexpected report) → "Couldn't
  start the sensor" + the event-log detail; retry; the rest of the app works.
- Device lost mid-run → run frozen and preserved; state → `NO_DEVICE`; offer save.
- Sample stream stalls (no input reports for > ~1 s while `MEASURING`) → surface a
  "sensor not responding" warning; keep what was collected.
- IndexedDB unavailable / quota exceeded / write fails → the app still runs live;
  "Saving runs is unavailable" is shown; nothing crashes; current run stays in
  memory until navigation.
- `navigator.storage.persist()` denied → runs still save, UI says durability isn't
  guaranteed.
- Corrupt / unreadable stored run → skipped in the list with a small notice, never
  a white-screen.
- Projector resolution / very small window → responsive down to ~1024×640; below
  that, a "make the window larger" hint rather than clipped controls.

## 20. Open questions for the plan (not blockers for this design)

1. Exact CBR 2 vs Go!Motion PID(s) and report layout — **resolved by the spike**.
2. SVG vs Canvas for the live graph — **resolved by an M3 profiling spike**.
3. Whether the armed (`SENSOR_READY`) latch persists across tool navigation (native
   kept it) — a small product call for the plan.
4. Which of Cubic / Abs / Sqrt / Exp ship in Snapshot Web V1 vs. land in M5.1.
5. Whether Fibonacci is in Sequence Web V1 or deferred with Bounce.
6. Light/dark theme timing — M7 is fine; Milestone Zero is not themed.

---

## Self-review (design-review checklist)

- [x] Every approved requirement represented — zero-install/WebHID, Windows+Chromium
  primary, five tools, the sensor→controller→immutable-run→labs architecture, the
  retained native rules, IndexedDB runs, the broadcast seam as design-only,
  Milestone Zero before labs, Snapshot's final pedagogy, Speed Lab's honest slope
  distinction, Sequence core with Bounce deferred.
- [x] **No backend** anywhere — static hosting, `connect-src 'self'`, no functions,
  explicitly called out.
- [x] **No native helper / driver / local server** — stated as a hard non-goal and
  as a *report-don't-add* rule if WebHID fails.
- [x] **No Chromebook requirement** — bonus-only, never gates V1.
- [x] **No student broadcast implementation** in V1 — only `PresentationState`
  serializability discipline; no networking code, no WebSocket, no button.
- [x] **No Inverse / Walk the Line / Pendulum / Standards** creeping back — listed
  as explicit non-goals and absent from Home, routes, and milestones.
- [x] **WebHID uncertainty explicitly acknowledged** — Sections 3, 15.4, 18, 19,
  and the Milestone-0 FAIL path.
- [x] **WebHID pairing / reconnect / secure-context contract pinned** — Section
  15.5: gesture-gated first pairing is expected; silent reconnect after refresh is
  a SHOULD not a PASS gate; a required RECONNECT SENSOR click is class B, not E;
  HTTPS required in deployment, localhost allowed in dev; policy block is class D.
- [x] **Feasibility spike precedes lab port** — Milestone 0, with a hard PASS
  gate; "do not build the five labs first" stated twice.
- [x] **Saved runs use browser-local persistence** — IndexedDB + `persist()`,
  honest durability language, no auto-erase.
- [x] **Raw-data immutability preserved** — frozen `MotionRun`, derived-only labs,
  stated in Sections 4.2, 6, 7, 11.
- [x] **Future broadcaster seam adds no present complexity** — one plain object the
  app needs for rendering anyway; YAGNI for the rest.
- Contradiction check: none found. The one tension — "architect for broadcast" vs
  "no backend / YAGNI" — is resolved by making the seam a *serialization
  discipline*, not a feature.
