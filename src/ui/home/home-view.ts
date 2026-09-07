import type { Route } from "../../app/router.js";
import { el, tile } from "../components/dom.js";

interface ToolTile {
  readonly name: string;
  readonly route: Route | null; // null = not yet a route (disabled)
  readonly note: string;
}

const TOOLS: readonly ToolTile[] = [
  { name: "Live Lab", route: "live", note: "Real-time position-vs-time graph" },
  { name: "Data Display", route: "data", note: "One huge position readout" },
  { name: "Snapshot Lab", route: null, note: "Coming next" },
  { name: "Speed Lab", route: null, note: "Coming next" },
  { name: "Sequence Lab", route: null, note: "Coming next" },
];

export interface HomeViewDeps {
  readonly navigate: (route: Route) => void;
}

export function mountHomeView(host: HTMLElement, deps: HomeViewDeps): () => void {
  const grid = el(
    "div",
    { className: "home-grid" },
    ...TOOLS.map((t) =>
      tile({
        name: t.name,
        note: t.note,
        active: t.route !== null,
        ...(t.route ? { onOpen: () => deps.navigate(t.route as Route) } : {}),
      }),
    ),
  );
  host.appendChild(grid);
  return () => grid.remove();
}
