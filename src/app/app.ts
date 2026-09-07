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
import { AppStore } from "./app-store.js";
import { createRouter, type Route } from "./router.js";
import { mountShell } from "../ui/shell.js";
import { mountHomeView } from "../ui/home/home-view.js";
import { mountLiveLabView } from "../ui/live/live-lab-view.js";
import { mountDataDisplayView } from "../ui/data/data-display-view.js";
import { mountWalkTheLineView } from "../ui/walk/walk-the-line-view.js";
import { installStartStopKey } from "../ui/keyboard.js";

export interface StartAppOptions {
  readonly container: HTMLElement;
  /** injected for tests; defaults to the platform WebHID. */
  readonly hidOverride?: ReturnType<typeof getHid> | undefined;
  /** injected for tests; defaults to the URL flags. */
  readonly flagsOverride?: Flags | undefined;
  /** injected for tests to supply a scriptable adapter. */
  readonly adapterOverride?: SensorAdapter | undefined;
}

export function startApp(opts: StartAppOptions): {
  teardown(): void;
  controller: AcquisitionController | null;
} {
  const { container } = opts;
  const flags = opts.flagsOverride ?? readFlags();

  const hid = flags.fake ? null : (opts.hidOverride ?? getHid());
  if (!hid && !flags.fake && !opts.adapterOverride) {
    renderUnsupportedView(container);
    return { teardown: () => container.replaceChildren(), controller: null };
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

  const store = new AppStore({ route: "home" });
  const router = createRouter(flags);

  const mountRoute = (route: Route, main: HTMLElement): (() => void) => {
    switch (route) {
      case "home":
        return mountHomeView(main, { navigate: router.navigate });
      case "live":
        return mountLiveLabView(main, { controller });
      case "data":
        return mountDataDisplayView(main, { controller });
      case "walk":
        return mountWalkTheLineView(main, { controller });
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

  let currentRoute: Route = router.route;
  router.start((route) => {
    // leaving a tool never destroys the connection; an in-progress run is
    // stopped with reason "navigation" and kept.
    const wasTool = currentRoute === "live" || currentRoute === "data" || currentRoute === "walk";
    if (wasTool && route !== currentRoute) {
      void controller.stopForNavigation();
    }
    currentRoute = route;
    store.setRoute(route);
    shell.renderRoute(route);
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
    teardown() {
      uninstallKey();
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
if (root) startApp({ container: root });
