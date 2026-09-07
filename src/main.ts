import "./styles/app.css";
import { AcquisitionController } from "./acquisition/acquisition-controller.js";
import { getHid } from "./sensor/hid.js";
import { GoMotionWebHIDAdapter } from "./sensor/go-motion-webhid.js";
import { FakeSensorAdapter } from "./sensor/fake-sensor-adapter.js";
import type { SensorAdapter } from "./sensor/types.js";
import { DiagnosticLog } from "./spike/diagnostic-log.js";
import { RawReportRing } from "./spike/raw-report-ring.js";
import { mountSpikeView } from "./spike/spike-view.js";
import { renderUnsupportedView } from "./spike/unsupported-view.js";

const container = document.getElementById("app");
if (!container) throw new Error("#app missing");

const params = new URLSearchParams(location.search);
const useFake = params.has("fake");
const broadChooser = params.has("broad");

const hid = getHid();

if (!useFake && !hid) {
  renderUnsupportedView(container);
} else {
  const log = new DiagnosticLog(600);
  const rawRing = new RawReportRing(200);
  let deviceInfoText = "";

  const adapter: SensorAdapter = useFake
    ? new FakeSensorAdapter()
    : new GoMotionWebHIDAdapter(hid, {
        broadChooser,
        onLog: (m) => log.add(m),
        onDeviceReport: (text) => {
          deviceInfoText = text;
          log.add("device descriptor captured (see Device info panel)");
        },
      });

  if (useFake) log.add("running with the FAKE sensor adapter (?fake) — no hardware");
  if (broadChooser) log.add("DEVELOPMENT: broad HID chooser enabled (?broad)");

  adapter.subscribeRawReport((r) =>
    rawRing.push({
      reportId: r.reportId,
      bytes: hexToBytes(r.hex),
      tMs: r.tMs,
      direction: r.direction,
    }),
  );
  adapter.subscribeStatus((s) => log.add(`sensor status: ${s}`));
  adapter.subscribeTrigger((t) => log.add(`trigger ${t.kind} (source: ${t.source})`));

  const controller = new AcquisitionController(adapter, {
    log: (m) => log.add(m),
  });
  controller.subscribeRunComplete((run) =>
    log.add(
      `MotionRun formed: ${run.sampleCount} samples, ${run.durationSeconds.toFixed(2)} s, ` +
        `~${run.samplerHz} Hz nominal (${run.source})`,
    ),
  );

  mountSpikeView(container, {
    controller,
    log,
    rawRing,
    getDeviceInfoText: () => deviceInfoText,
  });

  // Try a silent reconnect for a previously granted device (spec §15.5 — SHOULD).
  if (!useFake) {
    void adapter.reconnect().then((ok) => {
      log.add(
        ok
          ? "auto-reconnect to a previously granted sensor succeeded"
          : "no previously granted sensor to reconnect (click CONNECT SENSOR)",
      );
    });
  }

  // Never show the teacher an opaque uncaught rejection (spec §7).
  window.addEventListener("unhandledrejection", (ev) => {
    log.add(`unhandled error: ${String(ev.reason)}`);
  });
  window.addEventListener("error", (ev) => {
    log.add(`page error: ${ev.message}`);
  });
}

function hexToBytes(hex: string): Uint8Array {
  const parts = hex.trim().length ? hex.trim().split(/\s+/) : [];
  return Uint8Array.from(parts, (h) => parseInt(h, 16));
}
