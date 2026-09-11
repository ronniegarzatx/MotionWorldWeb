import type {
  AcquisitionController,
  AcquisitionUiState,
} from "../acquisition/acquisition-controller.js";
import type { Flags } from "../app/flags.js";
import { button, el } from "./components/dom.js";

export interface AcquisitionBarDeps {
  readonly controller: AcquisitionController;
  readonly flags: Flags;
  readonly onShowDetails?: (message: string) => void;
}

interface BarModel {
  readonly dot: "idle" | "ok" | "warn" | "err" | "busy";
  readonly label: string;
  readonly actions: readonly {
    readonly label: string;
    readonly run: () => void;
    readonly variant?: "primary";
  }[];
}

function model(ui: AcquisitionUiState, c: AcquisitionController): BarModel {
  if (ui.connecting) {
    return { dot: "busy", label: "Connecting…", actions: [] };
  }
  switch (ui.state) {
    case "NO_DEVICE":
      return {
        dot: "idle",
        label: "No sensor connected",
        actions: [{ label: "Connect Sensor", run: () => void c.connect(), variant: "primary" }],
      };
    case "SYSTEM_READY":
      return {
        dot: "ok",
        label: "System Ready",
        actions: [{ label: "Sensor Ready", run: () => void c.arm(), variant: "primary" }],
      };
    case "SENSOR_READY":
      return {
        dot: "ok",
        label: "Sensor Ready",
        actions: [
          { label: "Cancel", run: () => void c.disarm() },
          { label: "Start", run: () => void c.start(), variant: "primary" },
        ],
      };
    case "MEASURING":
      return {
        dot: "ok",
        label: "Collecting",
        actions: [{ label: "Stop", run: () => void c.stop(), variant: "primary" }],
      };
    case "DEVICE_LOST":
      return {
        dot: "warn",
        label: "Sensor disconnected",
        actions: [{ label: "Reconnect", run: () => void c.reconnect(), variant: "primary" }],
      };
    case "ERROR":
      return {
        dot: "err",
        label: "Sensor problem",
        actions: [{ label: "Reconnect", run: () => void c.reconnect(), variant: "primary" }],
      };
  }
}

export function mountAcquisitionBar(host: HTMLElement, deps: AcquisitionBarDeps): () => void {
  const { controller, flags } = deps;

  const dot = el("span", { className: "acq-bar__dot" });
  const label = el("span", { className: "acq-bar__label" });
  const actions = el("span", { className: "acq-bar__actions" });
  const details = el("button", { className: "acq-bar__details", textContent: "Details", hidden: true });
  details.addEventListener("click", () => {
    const err = controller.uiState.lastError;
    if (err && deps.onShowDetails) deps.onShowDetails(`[${err.code}] ${err.message}`);
  });

  const bar = el(
    "div",
    { className: "acq-bar" },
    el("span", { className: "acq-bar__status" }, dot, label),
    actions,
    details,
  );
  host.appendChild(bar);

  const render = (ui: AcquisitionUiState): void => {
    const m = model(ui, controller);
    dot.className = `acq-bar__dot acq-bar__dot--${m.dot === "idle" ? "" : m.dot}`.trimEnd();
    label.textContent = m.label;
    actions.replaceChildren(
      ...m.actions.map((a) =>
        button({ label: a.label, onClick: a.run, ...(a.variant ? { variant: a.variant } : {}) }),
      ),
    );
    details.hidden = !(ui.state === "ERROR" && flags.debugSensor);
  };

  render(controller.uiState);
  const unsub = controller.subscribeUiState(render);

  return () => {
    unsub();
    bar.remove();
  };
}
