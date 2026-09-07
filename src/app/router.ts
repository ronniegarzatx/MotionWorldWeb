import type { Flags } from "./flags.js";

export type Route = "home" | "live" | "data" | "diagnostics";

const HASH_TO_ROUTE: Record<string, Route> = {
  "": "home",
  "#/": "home",
  "#/live": "live",
  "#/data": "data",
  "#/diagnostics": "diagnostics",
};

const ROUTE_TO_HASH: Record<Route, string> = {
  home: "#/",
  live: "#/live",
  data: "#/data",
  diagnostics: "#/diagnostics",
};

export function routeFromHash(hash: string, flags: Flags): Route {
  const route = HASH_TO_ROUTE[hash] ?? "home";
  // The diagnostics view is developer-only.
  if (route === "diagnostics" && !flags.debugSensor && !flags.fake) return "home";
  return route;
}

export interface Router {
  readonly route: Route;
  start(onChange: (route: Route) => void): void;
  navigate(route: Route): void;
  stop(): void;
}

export function createRouter(
  flags: Flags,
  win: Pick<Window, "location" | "addEventListener" | "removeEventListener"> = window,
): Router {
  let current: Route = routeFromHash(win.location.hash, flags);
  let listener: ((route: Route) => void) | null = null;

  const onHashChange = (): void => {
    const next = routeFromHash(win.location.hash, flags);
    if (next !== current) {
      current = next;
      listener?.(current);
    }
  };

  return {
    get route() {
      return current;
    },
    start(onChange) {
      listener = onChange;
      win.addEventListener("hashchange", onHashChange);
      onChange(current);
    },
    navigate(route) {
      win.location.hash = ROUTE_TO_HASH[route];
    },
    stop() {
      win.removeEventListener("hashchange", onHashChange);
      listener = null;
    },
  };
}
