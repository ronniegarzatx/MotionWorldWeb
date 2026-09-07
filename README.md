# Motion World Web

A zero-install, browser-based classroom motion instrument — the successor to
the native macOS **Motion World** app (`github.com/ronniegarzatx/MotionLab`,
tagged `v1.0.0`).

## The idea

A teacher on an ordinary Windows school PC:

1. plugs a Vernier **CBR 2 / Go!Motion** sensor into USB,
2. opens Motion World Web in the **Chrome or Edge** already on the machine,
3. clicks **Connect Sensor** and approves one browser permission prompt,
4. teaches with it, and projects it for the class.

No Python. No installed helper or driver. No local web server. No backend.
No account. Completed runs are saved **locally in the browser** (IndexedDB).

## Status

**Milestone Zero — PASSED (2026-09-07), feasibility class A, hardware-verified.**
On a Windows work PC in Chrome via the GitHub Pages HTTPS URL, a real Vernier
**Go! Motion ver 1.02** connected, auto-reconnected, armed, streamed a 25 Hz
position trace, completed a 1894-sample run, and stopped from the physical blue
button — with no native helper, driver, backend, or admin rights. Direct WebHID
is viable.

**Now:** Milestone 1 — the Motion World application shell + five-tool Home
(Live Lab & Data Display active) + a web-native design system, on top of the
sensor/acquisition/model layer built and hardware-verified in M0. The spike's
protocol diagnostics move behind `?debug=sensor`.

- Design spec: [`docs/superpowers/specs/2026-09-06-motion-world-web-v1-design.md`](docs/superpowers/specs/2026-09-06-motion-world-web-v1-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-09-07-webhid-sensor-spike.md`](docs/superpowers/plans/2026-09-07-webhid-sensor-spike.md)
- Protocol research: [`docs/research/go-motion-webhid-protocol.md`](docs/research/go-motion-webhid-protocol.md)
- Windows test procedure: [`docs/research/webhid-spike-windows-test.md`](docs/research/webhid-spike-windows-test.md)
- Readiness report: [`docs/research/milestone-zero-ready.md`](docs/research/milestone-zero-ready.md)

**Live spike (for the Windows + CBR 2 test):**
<https://ronniegarzatx.github.io/MotionWorldWeb/> — deployed from `main` by
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
(GitHub Actions → Pages, static, no backend).

### Running the spike

```
npm ci
npm run dev            # http://localhost:5173  (a secure context for WebHID)
npm test               # 84 unit tests, no hardware needed
npm run build          # static output in dist/  (deploy anywhere over HTTPS)
```

URL flags:

- `?fake` — run against `FakeSensorAdapter` (no hardware; use this on the Mac).
- `?broad` — **development only**: widen the HID chooser to any Vernier device
  to identify an unknown sensor. Not the default; logged loudly.

> `npm` in this environment gates package install scripts; `package.json`
> carries an `allowScripts` entry for the exact `esbuild` build. If you bump
> `vite`/`vitest`, run `npm install-scripts approve esbuild` once.

### Architecture boundary (enforced)

`navigator.hid` is named in exactly one file (`src/sensor/hid.ts`). HID report
bytes live in exactly one production module (`src/sensor/go-motion-webhid.ts`)
plus its pure helpers. The UI issues intents to `AcquisitionController` and
never touches HID. See the plan for the full module map.

## Scope (V1)

**Five tools:** Live Lab · Data Display · Snapshot Lab · Speed Lab · Sequence Lab.

**Out of V1:** Inverse Lab, Walk the Line, Pendulum Lab, standards, accounts,
cloud sync, any backend, student live-view/broadcast.

## Architecture in one paragraph

The sensor is reached only through a `SensorAdapter` interface; its first
implementation, `GoMotionWebHIDAdapter`, is the **only** module that knows HID
report bytes. Above it, a single app-lifetime `AcquisitionController` owns the
one persistent connection and the one acquisition state machine, and publishes
the one authoritative sample stream. Completed collections are frozen into an
**immutable `MotionRun`**; every lab and every analysis is a pure, downstream
transform of a run and never rewrites a raw observation. Runs persist in
IndexedDB. Presentation state is kept as one serializable object so a future
student-broadcast feature could be added without a rewrite — but Web V1 writes
no networking code.

## Tech (planned)

Vite · TypeScript (`strict`) · browser-native DOM + CSS (no React unless a
concrete V1 reason appears) · WebHID · IndexedDB (from Milestone 2) · Vitest
(+ Playwright later). No Pyodide, no SciPy/NumPy — numerical routines are ported
to focused TypeScript modules whose tests mirror the native suite.

## Relationship to the native app

Motion World Web is an **independent project**. It inherits the product
knowledge and the numerical ideas (the Classroom Snapshot transform, the
classroom-approximate-equation display rule, the honest two-slope Speed Lab
teaching view, the "steps not jumps" Sequence Lab), **not** the desktop
codebase. The native app is now maintenance-only.
