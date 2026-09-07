import type { AcquisitionController, AcquisitionUiState } from "../acquisition/acquisition-controller.js";
import { summariseTiming } from "../model/sample-timing.js";
import type { DiagnosticLog } from "./diagnostic-log.js";
import type { RawReportRing } from "./raw-report-ring.js";
import type { MotionSample } from "../sensor/types.js";

export interface SpikeViewDeps {
  readonly controller: AcquisitionController;
  readonly log: DiagnosticLog;
  readonly rawRing: RawReportRing;
  readonly getDeviceInfoText: () => string;
  readonly now?: () => number;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) node.append(c);
  return node;
};

export function mountSpikeView(container: HTMLElement, deps: SpikeViewDeps): () => void {
  const { controller, log, rawRing, getDeviceInfoText } = deps;
  const now = deps.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  container.innerHTML = "";

  const connectBtn = el("button", { className: "primary", textContent: "CONNECT SENSOR" });
  const reconnectBtn = el("button", { textContent: "RECONNECT SENSOR" });
  const readyBtn = el("button", { textContent: "SENSOR READY" });
  const startBtn = el("button", { className: "primary", textContent: "START" });
  const stopBtn = el("button", { textContent: "STOP" });
  const disconnectBtn = el("button", { textContent: "DISCONNECT" });

  const statusDot = el("span", { className: "dot" });
  const statusValue = el("span", { className: "value", textContent: "Not connected" });
  const stateValue = el("span", { className: "diag", textContent: "NO_DEVICE" });

  const positionBig = el("div", { className: "big", textContent: "—" });
  const timeBig = el("div", { className: "big", textContent: "—" });
  const timingLine = el("div", { className: "diag", textContent: "Samples: 0" });

  const deviceInfoPre = el("pre", { className: "device-info", textContent: "(connect to read device info)" });
  const copyInfoBtn = el("button", { textContent: "copy" });

  const logPre = el("div", { className: "log" });
  const clearLogBtn = el("button", { textContent: "CLEAR LOG" });

  const rawPre = el("div", { className: "raw" });
  const pauseRawBtn = el("button", { textContent: "PAUSE" });
  const clearRawBtn = el("button", { textContent: "CLEAR" });
  const rawCount = el("span", { className: "diag" });

  container.append(
    el("h1", { textContent: "Motion World — Sensor Test" }),
    el("div", { className: "row" }, connectBtn, reconnectBtn, disconnectBtn),
    el(
      "div",
      { className: "status-line" },
      statusDot,
      "Sensor: ",
      statusValue,
      "  ",
      stateValue,
    ),
    el("div", { className: "row" }, readyBtn, startBtn, stopBtn),
    el(
      "div",
      { className: "readouts" },
      el("div", { className: "readout" }, el("div", { className: "label", textContent: "POSITION" }), positionBig),
      el("div", { className: "readout" }, el("div", { className: "label", textContent: "TIME" }), timeBig),
    ),
    timingLine,
    el("section", {}, el("h2", {}, "Device info", copyInfoBtn), deviceInfoPre),
    el("section", {}, el("h2", {}, "Event log", clearLogBtn), logPre),
    el(
      "section",
      {},
      el("h2", {}, "Raw HID reports (diagnostic)", el("span", {}, pauseRawBtn, " ", clearRawBtn, " ", rawCount)),
      rawPre,
    ),
  );

  // ── sample / timing state ────────────────────────────────────────────────
  let arrivals: number[] = [];
  let last: MotionSample | null = null;
  let arrivalsBelongToPreviousRun = false;

  const renderReadouts = (): void => {
    positionBig.textContent = last ? `${last.positionMeters.toFixed(3)} m` : "—";
    timeBig.textContent = last ? `${last.timestampSeconds.toFixed(3)} s` : "—";
    const t = summariseTiming(arrivals);
    const rate = t.observedRateHz === null ? "—" : `${t.observedRateHz.toFixed(1)} Hz`;
    const li = t.lastIntervalMs === null ? "—" : `${t.lastIntervalMs.toFixed(0)} ms`;
    const mi = t.meanIntervalMs === null ? "—" : `${t.meanIntervalMs.toFixed(1)} ms`;
    const sd = t.stdevIntervalMs === null ? "—" : `${t.stdevIntervalMs.toFixed(1)} ms`;
    const mm =
      t.minIntervalMs === null
        ? "—"
        : `${t.minIntervalMs.toFixed(0)} / ${t.maxIntervalMs!.toFixed(0)}`;
    timingLine.textContent =
      `Samples: ${t.sampleCount}   Observed rate: ${rate}   Last interval: ${li}   ` +
      `Mean: ${mi}   Stdev: ${sd}   Min/Max: ${mm} ms`;
  };

  const renderUi = (s: AcquisitionUiState): void => {
    statusValue.textContent =
      s.deviceLabel ?? (s.state === "NO_DEVICE" ? "Not connected" : "—");
    stateValue.textContent =
      s.state + (s.lastStopReason ? ` (stopped: ${s.lastStopReason})` : "");
    statusDot.className =
      "dot " +
      (s.state === "MEASURING" || s.state === "SENSOR_READY" || s.state === "SYSTEM_READY"
        ? "ok"
        : s.state === "DEVICE_LOST" || s.state === "ERROR"
          ? "err"
          : "");
    connectBtn.disabled = !s.canConnect;
    reconnectBtn.disabled = !s.canReconnect;
    disconnectBtn.disabled = !s.connected;
    readyBtn.disabled = !(s.canArm || s.canDisarm);
    readyBtn.textContent = s.canDisarm ? "DISARM" : "SENSOR READY";
    startBtn.disabled = !s.canStart;
    stopBtn.disabled = !s.canStop;
    if (s.lastError) {
      deviceInfoPre.textContent =
        `ERROR [${s.lastError.code}] ${s.lastError.message}\n\n` + getDeviceInfoText();
    }
  };

  const renderLog = (): void => {
    logPre.innerHTML = "";
    for (const line of log.snapshot()) {
      logPre.append(el("div", { textContent: `${line.wallClock}  ${line.message}` }));
    }
  };

  const renderRaw = (): void => {
    const snap = rawRing.snapshot();
    rawCount.textContent = `showing ${snap.length} of ${rawRing.capacity}`;
    rawPre.innerHTML = "";
    for (const r of snap.slice(0, rawRing.capacity)) {
      rawPre.append(
        el("div", {
          className: r.direction === "out" ? "out" : "",
          textContent: `${r.tMs.toFixed(0).padStart(8)}  ${r.direction} id ${r.reportId} len ${r.lengthBytes}  ${r.hex}`,
        }),
      );
    }
  };

  // ── wiring ──────────────────────────────────────────────────────────────
  const unsubs: (() => void)[] = [];

  unsubs.push(
    controller.subscribeUiState((s) => {
      if (s.state === "MEASURING" && arrivalsBelongToPreviousRun) {
        arrivals = [];
        last = null;
        arrivalsBelongToPreviousRun = false;
      }
      renderUi(s);
      renderReadouts();
    }),
  );

  unsubs.push(
    controller.subscribeSample((sample) => {
      arrivals.push(now());
      if (arrivals.length > 1000) arrivals.shift();
      last = sample;
      renderReadouts();
    }),
  );

  unsubs.push(
    controller.subscribeRunComplete(() => {
      arrivalsBelongToPreviousRun = true;
      log.add(
        `run complete — ${arrivals.length} samples in this view buffer`,
      );
      renderReadouts();
    }),
  );

  unsubs.push(log.subscribe(renderLog));

  connectBtn.onclick = () => void controller.connect();
  reconnectBtn.onclick = () => void controller.reconnect();
  disconnectBtn.onclick = () => void controller.disconnect();
  readyBtn.onclick = () =>
    void (controller.uiState.canDisarm ? controller.disarm() : controller.arm());
  startBtn.onclick = () => void controller.start();
  stopBtn.onclick = () => void controller.stop();

  copyInfoBtn.onclick = () => {
    deviceInfoPre.textContent = getDeviceInfoText();
    void navigator.clipboard?.writeText(getDeviceInfoText()).catch(() => {});
  };
  clearLogBtn.onclick = () => log.clear();
  pauseRawBtn.onclick = () => {
    rawRing.paused = !rawRing.paused;
    pauseRawBtn.textContent = rawRing.paused ? "RESUME" : "PAUSE";
  };
  clearRawBtn.onclick = () => {
    rawRing.clear();
    renderRaw();
  };

  const rawTimer = setInterval(renderRaw, 250);

  // initial paint
  renderUi(controller.uiState);
  renderReadouts();
  renderLog();
  renderRaw();
  deviceInfoPre.textContent = getDeviceInfoText() || "(connect to read device info)";

  return () => {
    clearInterval(rawTimer);
    for (const u of unsubs) u();
  };
}
