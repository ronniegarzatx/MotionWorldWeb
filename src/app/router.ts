import type { Flags } from "./flags.js";

export type Route =
  | "home"
  | "live"
  | "data"
  | "walk"
  | "snapshot"
  | "speed"
  | "sequence"
  | "art"
  | "runs"
  | "run"
  | "diagnostics";

/** A resolved location: the route, plus an optional path param (e.g. a run id). */
export interface Location {
  readonly route: Route;
  readonly param?: string;
}

const HASH_TO_ROUTE: Record<string, Route> = {
  "": "home",
  "#/": "home",
  "#/live": "live",
  "#/data": "data",
  "#/walk": "walk",
  "#/snapshot": "snapshot",
  "#/speed": "speed",
  "#/sequence": "sequence",
  "#/art": "art",
  "#/runs": "runs",
  "#/diagnostics": "diagnostics",
};

const ROUTE_TO_HASH: Record<Route, string> = {
  home: "#/",
  live: "#/live",
  data: "#/data",
  walk: "#/walk",
  snapshot: "#/snapshot",
  speed: "#/speed",
  sequence: "#/sequence",
  art: "#/art",
  runs: "#/runs",
  run: "#/run",
  diagnostics: "#/diagnostics",
};

export function locationFromHash(hash: string, flags: Flags): Location {
  if (hash.startsWith("#/run/")) {
    const id = hash.slice("#/run/".length);
    return id ? { route: "run", param: decodeURIComponent(id) } : { route: "runs" };
  }
  if (hash.startsWith("#/snapshot/")) {
    const id = hash.slice("#/snapshot/".length);
    return { route: "snapshot", ...(id ? { param: decodeURIComponent(id) } : {}) };
  }
  if (hash.startsWith("#/speed/")) {
    const id = hash.slice("#/speed/".length);
    return { route: "speed", ...(id ? { param: decodeURIComponent(id) } : {}) };
  }
  if (hash.startsWith("#/sequence/")) {
    const id = hash.slice("#/sequence/".length);
    return { route: "sequence", ...(id ? { param: decodeURIComponent(id) } : {}) };
  }
  const route = HASH_TO_ROUTE[hash] ?? "home";
  // the diagnostics view is developer-only
  if (route === "diagnostics" && !flags.debugSensor && !flags.fake) return { route: "home" };
  return { route };
}

export interface Router {
  readonly location: Location;
  start(onChange: (location: Location) => void): void;
  navigate(route: Route, param?: string): void;
  stop(): void;
}

function sameLocation(a: Location, b: Location): boolean {
  return a.route === b.route && a.param === b.param;
}

export function createRouter(
  flags: Flags,
  win: Pick<Window, "location" | "addEventListener" | "removeEventListener"> = window,
): Router {
  let current: Location = locationFromHash(win.location.hash, flags);
  let listener: ((location: Location) => void) | null = null;

  const onHashChange = (): void => {
    const next = locationFromHash(win.location.hash, flags);
    if (!sameLocation(next, current)) {
      current = next;
      listener?.(current);
    }
  };

  return {
    get location() {
      return current;
    },
    start(onChange) {
      listener = onChange;
      win.addEventListener("hashchange", onHashChange);
      onChange(current);
    },
    navigate(route, param) {
      win.location.hash =
        (route === "run" || route === "snapshot" || route === "speed" || route === "sequence") &&
        param
          ? `#/${route}/${encodeURIComponent(param)}`
          : ROUTE_TO_HASH[route];
    },
    stop() {
      win.removeEventListener("hashchange", onHashChange);
      listener = null;
    },
  };
}
