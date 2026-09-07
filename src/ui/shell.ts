import type { AcquisitionController } from "../acquisition/acquisition-controller.js";
import type { Flags } from "../app/flags.js";
import type { Route } from "../app/router.js";
import { mountAcquisitionBar } from "./acquisition-bar.js";
import { el } from "./components/dom.js";

export interface ShellDeps {
  readonly controller: AcquisitionController;
  readonly flags: Flags;
  readonly navigate: (route: Route) => void;
  /** Mount the view for `route` into `main`; return its teardown. */
  readonly mountRoute: (route: Route, main: HTMLElement) => () => void;
  readonly onShowDetails?: (message: string) => void;
}

export interface Shell {
  renderRoute(route: Route): void;
  teardown(): void;
}

export function mountShell(container: HTMLElement, deps: ShellDeps): Shell {
  container.replaceChildren();

  const wordmark = el("a", {
    className: "app-wordmark",
    href: "#/",
    textContent: "Motion World",
  });
  wordmark.addEventListener("click", (e) => {
    e.preventDefault();
    deps.navigate("home");
  });

  const barHost = el("span", { className: "acq-bar-host" });
  const devLink = el("a", {
    className: "dev-link",
    href: "#/diagnostics",
    textContent: "Diagnostics",
  });
  devLink.hidden = !(deps.flags.debugSensor || deps.flags.fake);

  const header = el(
    "header",
    { className: "app-header" },
    wordmark,
    el("span", { className: "spacer" }),
    barHost,
    devLink,
  );

  const main = el("main", { className: "app-main" });
  container.append(el("div", { className: "app-shell" }, header, main));

  const teardownBar = mountAcquisitionBar(barHost, {
    controller: deps.controller,
    flags: deps.flags,
    ...(deps.onShowDetails ? { onShowDetails: deps.onShowDetails } : {}),
  });

  let teardownView: (() => void) | null = null;

  return {
    renderRoute(route) {
      teardownView?.();
      main.replaceChildren();
      teardownView = deps.mountRoute(route, main);
    },
    teardown() {
      teardownView?.();
      teardownBar();
      container.replaceChildren();
    },
  };
}
