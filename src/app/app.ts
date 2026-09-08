import "../styles/index.css";
import { AcquisitionController } from "../acquisition/acquisition-controller.js";
import { FakeSensorAdapter } from "../sensor/fake-sensor-adapter.js";
import { GoMotionWebHIDAdapter } from "../sensor/go-motion-webhid.js";
import { getHid } from "../sensor/hid.js";
import type { SensorAdapter } from "../sensor/types.js";
import { DiagnosticLog } from "../dev/diagnostic-log.js";
import { RawReportRing } from "../dev/raw-report-ring.js";
import { mountSensorDiagnosticsView } from "../dev/sensor-diagnostics-view.js";
import { renderUnsupportedView } from "../dev/unsupported-view.js";
import { readFlags, type Flags } from "./flags.js";
import { initTheme } from "./theme.js";
import { AppStore } from "./app-store.js";
import { createRouter, type Location } from "./router.js";
import { mountShell } from "../ui/shell.js";
import { mountHomeView } from "../ui/home/home-view.js";
import { mountLiveLabView } from "../ui/live/live-lab-view.js";
import { mountDataDisplayView } from "../ui/data/data-display-view.js";
import { mountWalkTheLineView } from "../ui/walk/walk-the-line-view.js";
import { TargetOffsets } from "../ui/walk/target-offsets.js";
import { mountRunsListView } from "../ui/runs/runs-list-view.js";
import { mountRunDetailView } from "../ui/runs/run-detail-view.js";
import { mountSnapshotLabView } from "../ui/snapshot/snapshot-lab-view.js";
import { mountSpeedLabView } from "../ui/speed/speed-lab-view.js";
import { installStartStopKey } from "../ui/keyboard.js";
import { createRunStore } from "../store/create-run-store.js";
import { startRunPersistence } from "../store/run-persistence.js";
import type { RunStore } from "../store/run-store.js";

export interface StartAppOptions {
  readonly container: HTMLElement;
  /** injected for tests; defaults to the platform WebHID. */
  readonly hidOverride?: ReturnType<typeof getHid> | undefined;
  /** injected for tests; defaults to the URL flags. */
  readonly flagsOverride?: Flags | undefined;
  /** injected for tests to supply a scriptable adapter. */
  readonly adapterOverride?: SensorAdapter | undefined;
  /** injected for tests to supply a run store (skips IndexedDB). */
  readonly runStoreOverride?: RunStore | undefined;
}

export interface RunningApp {
  teardown(): void;
  controller: AcquisitionController | null;
  runStore: RunStore | null;
}

export async function startApp(opts: StartAppOptions): Promise<RunningApp> {
  const { container } = opts;
  const flags = opts.flagsOverride ?? readFlags();

  // apply the persisted theme before the shell paints (token-only; no coupling)
  initTheme();

  const hid = flags.fake ? null : (opts.hidOverride ?? getHid());
  if (!hid && !flags.fake && !opts.adapterOverride) {
    renderUnsupportedView(container);
    return { teardown: () => container.replaceChildren(), controller: null, runStore: null };
  }

  const log = new DiagnosticLog(600);
  const rawRing = new RawReportRing(200);
  let deviceInfoText = "";

  const adapter: SensorAdapter = opts.adapterOverride
    ? opts.adapterOverride
    : flags.fake
    ? new FakeSensorAdapter()
    : new GoMotionWebHIDAdapter(hid, {
        onLog: (m) => log.add(m),
        onDeviceReport: (text) => {
          deviceInfoText = text;
          log.add("device descriptor captured");
        },
      });

  if (flags.fake) log.add("running with the FAKE sensor adapter (?fake) — no hardware");

  adapter.subscribeRawReport((r) =>
    rawRing.push({ reportId: r.reportId, bytes: hexToBytes(r.hex), tMs: r.tMs, direction: r.direction }),
  );
  adapter.subscribeStatus((s) => log.add(`sensor status: ${s}`));
  adapter.subscribeTrigger((t) => log.add(`trigger ${t.kind} (source: ${t.source})`));

  const controller = new AcquisitionController(adapter, { log: (m) => log.add(m) });
  controller.subscribeRunComplete((run) =>
    log.add(
      `MotionRun formed: ${run.sampleCount} samples, ${run.durationSeconds.toFixed(2)} s (${run.source})`,
    ),
  );

  const runStore: RunStore =
    opts.runStoreOverride ??
    (await createRunStore((reason) =>
      log.add(`run storage: IndexedDB unavailable, using temporary storage (${String(reason)})`),
    ));

  const stopPersistence = startRunPersistence(controller, runStore, {
    onSaved: (id) => log.add(`run ${id} saved`),
    onError: (id, error) => log.add(`run ${id} not saved: ${String(error)}`),
  });

  // best-effort durable storage (truthful — never implied as guaranteed)
  void navigator.storage?.persist?.().then(
    (granted) => log.add(`storage.persist(): ${granted ? "granted" : "not granted"}`),
    () => {},
  );

  const offsets = new TargetOffsets();
  const appStore = new AppStore({ route: "home" });
  const router = createRouter(flags);

  const mountRoute = (location: Location, main: HTMLElement): (() => void) => {
    switch (location.route) {
      case "home":
        return mountHomeView(main, { navigate: router.navigate });
      case "live":
        return mountLiveLabView(main, { controller });
      case "data":
        return mountDataDisplayView(main, { controller });
      case "walk":
        return mountWalkTheLineView(main, { controller, offsets });
      case "snapshot":
        return mountSnapshotLabView(main, {
          controller,
          runStore,
          navigate: router.navigate,
          ...(location.param ? { runId: location.param } : {}),
        });
      case "speed":
        return mountSpeedLabView(main, {
          controller,
          runStore,
          navigate: router.navigate,
          ...(location.param ? { runId: location.param } : {}),
        });
      case "runs":
        return mountRunsListView(main, { store: runStore, navigate: router.navigate });
      case "run":
        return mountRunDetailView(main, {
          store: runStore,
          runId: location.param ?? "",
          navigate: router.navigate,
          debug: flags.debugSensor,
        });
      case "diagnostics":
        return mountSensorDiagnosticsView(main, {
          controller,
          log,
          rawRing,
          getDeviceInfoText: () => deviceInfoText,
        });
    }
  };

  const shell = mountShell(container, {
    controller,
    flags,
    navigate: router.navigate,
    mountRoute,
    onShowDetails: (m) => log.add(`[shown to developer] ${m}`),
  });

  const TOOLS = new Set(["live", "data", "walk", "speed"]);
  let currentLocation: Location = router.location;
  router.start((location) => {
    // leaving a tool never destroys the connection; an in-progress run is
    // stopped with reason "navigation" and kept (then auto-saved).
    if (TOOLS.has(currentLocation.route) && location.route !== currentLocation.route) {
      void controller.stopForNavigation();
    }
    currentLocation = location;
    appStore.setRoute(location.route);
    shell.renderLocation(location);
  });

  const uninstallKey = installStartStopKey(controller);

  // best-effort silent reconnect of a previously granted device — never blocks the UI.
  if (!flags.fake) {
    void controller.reconnect().then((ok) => {
      log.add(ok ? "auto-reconnect succeeded" : "no previously granted sensor to reconnect");
    });
  }

  const onRejection = (ev: PromiseRejectionEvent): void =>
    log.add(`unhandled error: ${String(ev.reason)}`);
  const onError = (ev: ErrorEvent): void => log.add(`page error: ${ev.message}`);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("error", onError);

  return {
    controller,
    runStore,
    teardown() {
      uninstallKey();
      stopPersistence();
      router.stop();
      shell.teardown();
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
      void adapter.disconnect();
    },
  };
}

function hexToBytes(hex: string): Uint8Array {
  const parts = hex.trim().length ? hex.trim().split(/\s+/) : [];
  return Uint8Array.from(parts, (h) => parseInt(h, 16));
}

// Auto-start in the browser (not under test).
const root = typeof document !== "undefined" ? document.getElementById("app") : null;
if (root) void startApp({ container: root });
