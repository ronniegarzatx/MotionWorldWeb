/**
 * Hand-rolled SVG time-series chart. One `<path>` for the trace, `<line>` /
 * `<text>` for axes. Vector text stays crisp on a projector at any scale.
 *
 * `update()` is synchronous and idempotent — the caller (Live Lab) throttles it
 * to a rAF tick. Designed to grow into Snapshot Lab: `overlays` (model curves),
 * `markers` (points), and `selection` (a draggable time band) are part of the
 * contract now; only `selection` renders a (static) group in Milestone 1.
 */
const SVG_NS = "http://www.w3.org/2000/svg";

export interface ChartSeries {
  readonly t: readonly number[];
  readonly x: readonly number[];
}

export interface ChartInput {
  readonly series: ChartSeries;
  readonly xDomain?: readonly [number, number] | "auto-grow";
  readonly yDomain?: readonly [number, number] | "auto";
  readonly xLabel: string;
  readonly yLabel: string;
  readonly overlays?: readonly { readonly d: string; readonly kind: "model" }[];
  readonly markers?: readonly { readonly t: number; readonly x: number }[];
  readonly selection?: { readonly startT: number; readonly endT: number };
  /**
   * A fixed reference curve (Walk the Line's target), drawn with distinct
   * styling in the SAME coordinate system as `series`, behind the student trace.
   * The plot area is clipped so an out-of-range `series` clips at the edge
   * rather than painting over the axes.
   */
  readonly target?: { readonly t: readonly number[]; readonly x: readonly number[] };
}

export interface ChartHandle {
  update(input: ChartInput): void;
  destroy(): void;
}

const MARGIN = { top: 16, right: 20, bottom: 40, left: 60 } as const;
const SLIDE_WINDOW_S = 30;
const MIN_X_TOP = 10;

// ── pure geometry ────────────────────────────────────────────────────────────

export function computeXDomain(
  series: ChartSeries,
  mode: readonly [number, number] | "auto-grow" | undefined,
): [number, number] {
  if (Array.isArray(mode)) return [mode[0], mode[1]];
  const n = series.t.length;
  const maxT = n > 0 ? series.t[n - 1]! : 0;
  if (maxT <= MIN_X_TOP) return [0, MIN_X_TOP];
  return [Math.max(0, maxT - SLIDE_WINDOW_S), maxT];
}

export function computeYDomain(
  series: ChartSeries,
  mode: readonly [number, number] | "auto" | undefined,
  prev?: readonly [number, number],
): [number, number] {
  if (Array.isArray(mode)) return [mode[0], mode[1]];
  if (series.x.length === 0) return prev ? [prev[0], prev[1]] : [0, 1];

  let lo = Infinity;
  let hi = -Infinity;
  for (const v of series.x) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }

  // hysteresis: if the data still fits comfortably inside the previous domain,
  // keep it — avoids the axis jittering on every sample.
  if (prev && lo >= prev[0] && hi <= prev[1]) {
    const prevRange = prev[1] - prev[0];
    if (hi - lo >= prevRange * 0.4) return [prev[0], prev[1]];
  }

  const range = hi - lo || 1;
  const pad = Math.max(range * 0.1, 0.05);
  return [lo - pad, hi + pad];
}

export function makeScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

export function buildPathD(
  series: ChartSeries,
  xScale: (v: number) => number,
  yScale: (v: number) => number,
): string {
  const n = Math.min(series.t.length, series.x.length);
  if (n === 0) return "";
  let d = `M ${xScale(series.t[0]!).toFixed(2)} ${yScale(series.x[0]!).toFixed(2)}`;
  for (let i = 1; i < n; i++) {
    d += ` L ${xScale(series.t[i]!).toFixed(2)} ${yScale(series.x[i]!).toFixed(2)}`;
  }
  return d;
}

function niceTicks(d0: number, d1: number, count: number): number[] {
  const span = d1 - d0;
  if (span <= 0) return [d0];
  const rawStep = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(d0 / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= d1 + step * 1e-6; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

// ── DOM ──────────────────────────────────────────────────────────────────────

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

let chartInstanceSeq = 0;

export function mountChart(host: HTMLElement): ChartHandle {
  const root = svg("svg", { class: "chart-svg", preserveAspectRatio: "none" });
  root.setAttribute("role", "img");
  host.appendChild(root);

  const clipId = `chart-plot-clip-${++chartInstanceSeq}`;

  let prevY: [number, number] | undefined;
  let lastInput: ChartInput | null = null;

  const redraw = (): void => {
    if (!lastInput) return;
    const input = lastInput;
    const w = host.clientWidth || 800;
    const h = host.clientHeight || 450;
    root.setAttribute("viewBox", `0 0 ${w} ${h}`);
    root.setAttribute("aria-label", `${input.yLabel} vs ${input.xLabel}`);

    const plot = {
      x0: MARGIN.left,
      x1: w - MARGIN.right,
      y0: h - MARGIN.bottom,
      y1: MARGIN.top,
    };

    const xDomain = computeXDomain(input.series, input.xDomain);
    const yDomain = computeYDomain(input.series, input.yDomain, prevY);
    prevY = yDomain;

    const xScale = makeScale(xDomain, [plot.x0, plot.x1]);
    const yScale = makeScale(yDomain, [plot.y0, plot.y1]);

    while (root.firstChild) root.removeChild(root.firstChild);
    const g = svg("g");
    root.appendChild(g);

    // grid + ticks
    for (const tx of niceTicks(xDomain[0], xDomain[1], 6)) {
      const px = xScale(tx);
      g.appendChild(svg("line", { class: "grid-line", x1: px, y1: plot.y1, x2: px, y2: plot.y0 }));
      const label = svg("text", { class: "tick-label", x: px, y: plot.y0 + 18, "text-anchor": "middle" });
      label.textContent = String(tx);
      g.appendChild(label);
    }
    for (const ty of niceTicks(yDomain[0], yDomain[1], 5)) {
      const py = yScale(ty);
      g.appendChild(svg("line", { class: "grid-line", x1: plot.x0, y1: py, x2: plot.x1, y2: py }));
      const label = svg("text", { class: "tick-label", x: plot.x0 - 8, y: py + 4, "text-anchor": "end" });
      label.textContent = ty.toFixed(ty % 1 === 0 ? 0 : 2);
      g.appendChild(label);
    }

    // axes
    g.appendChild(svg("line", { class: "axis-line", x1: plot.x0, y1: plot.y0, x2: plot.x1, y2: plot.y0 }));
    g.appendChild(svg("line", { class: "axis-line", x1: plot.x0, y1: plot.y1, x2: plot.x0, y2: plot.y0 }));

    const xTitle = svg("text", { class: "axis-title", x: (plot.x0 + plot.x1) / 2, y: h - 6, "text-anchor": "middle" });
    xTitle.textContent = input.xLabel;
    g.appendChild(xTitle);
    const yTitle = svg("text", {
      class: "axis-title",
      x: 14,
      y: (plot.y0 + plot.y1) / 2,
      "text-anchor": "middle",
      transform: `rotate(-90 14 ${(plot.y0 + plot.y1) / 2})`,
    });
    yTitle.textContent = input.yLabel;
    g.appendChild(yTitle);

    // selection band (Snapshot Lab, M5 — static in M1)
    if (input.selection) {
      const sx0 = xScale(input.selection.startT);
      const sx1 = xScale(input.selection.endT);
      g.appendChild(
        svg("rect", {
          class: "selection-band",
          x: Math.min(sx0, sx1),
          y: plot.y1,
          width: Math.abs(sx1 - sx0),
          height: plot.y0 - plot.y1,
          fill: "var(--accent)",
          "fill-opacity": "0.12",
        }),
      );
    }

    // clip everything data-driven to the plot rectangle
    const defs = svg("defs");
    const clip = svg("clipPath", { id: clipId });
    clip.appendChild(
      svg("rect", {
        x: plot.x0,
        y: plot.y1,
        width: Math.max(0, plot.x1 - plot.x0),
        height: Math.max(0, plot.y0 - plot.y1),
      }),
    );
    defs.appendChild(clip);
    root.insertBefore(defs, g);

    const gClip = svg("g", { "clip-path": `url(#${clipId})` });
    g.appendChild(gClip);

    // overlays (model curves — Snapshot Lab)
    for (const overlay of input.overlays ?? []) {
      gClip.appendChild(svg("path", { class: `overlay overlay--${overlay.kind}`, d: overlay.d }));
    }

    // fixed reference curve (Walk the Line target) — behind the student trace
    if (input.target) {
      const targetD = buildPathD(
        { t: input.target.t, x: input.target.x },
        xScale,
        yScale,
      );
      if (targetD) gClip.appendChild(svg("path", { class: "target", d: targetD }));
    }

    // the (student) trace
    const traceD = buildPathD(input.series, xScale, yScale);
    const trace = svg("path", { class: "trace" });
    if (traceD) trace.setAttribute("d", traceD);
    gClip.appendChild(trace);

    // markers
    for (const m of input.markers ?? []) {
      gClip.appendChild(svg("circle", { class: "marker", cx: xScale(m.t), cy: yScale(m.x), r: 3 }));
    }
  };

  const onResize = (): void => redraw();
  window.addEventListener("resize", onResize);

  return {
    update(input) {
      lastInput = input;
      redraw();
    },
    destroy() {
      window.removeEventListener("resize", onResize);
      root.remove();
    },
  };
}
