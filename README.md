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

**Design phase.** This repository currently contains only the architectural
design spec:

- [`docs/superpowers/specs/2026-09-06-motion-world-web-v1-design.md`](docs/superpowers/specs/2026-09-06-motion-world-web-v1-design.md)

Nothing is implemented yet. The spec is **awaiting human review**. After it is
approved, the next steps are an implementation plan and then **Milestone Zero**:
a deliberately tiny WebHID sensor spike to prove the browser can talk to the
CBR 2 on the target hardware *before* any lab UI is built.

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

Vite · TypeScript · browser-native DOM + CSS (no React unless a concrete V1
reason appears) · WebHID · IndexedDB · Vitest + Playwright. No Pyodide, no
SciPy/NumPy — numerical routines are ported to focused TypeScript modules whose
tests mirror the native suite.

## Relationship to the native app

Motion World Web is an **independent project**. It inherits the product
knowledge and the numerical ideas (the Classroom Snapshot transform, the
classroom-approximate-equation display rule, the honest two-slope Speed Lab
teaching view, the "steps not jumps" Sequence Lab), **not** the desktop
codebase. The native app is now maintenance-only.
