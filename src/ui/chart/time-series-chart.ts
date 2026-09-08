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
  /** `muted` markers render subdued + smaller (Sequence Lab's excluded terms). */
  readonly markers?: readonly { readonly t: number; readonly x: number; readonly muted?: boolean }[];
  /** A second, visually distinct marker set (Sequence Lab's pendulum minima). */
  readonly markersAlt?: readonly { readonly t: number; readonly x: number; readonly muted?: boolean }[];
  readonly selection?: {
    readonly startT: number;
    readonly endT: number;
    /** draggable handles + band; region outside the selection is subdued. */
    readonly editable?: boolean;
    readonly onChange?: (range: { startT: number; endT: number }) => void;
  };
  /** A function y = f(x) sampled across the x-domain and drawn as `.model`. */
  readonly functionOverlay?: (x: number) => number;
  /** A dense contextual trace drawn BEHIND markers + model (Snapshot Lab's
   *  classroom motion trace). Distinct from `series` (the primary trace). */
  readonly motionTrace?: { readonly x: readonly number[]; readonly y: readonly number[] };
  /** Marker radius (default 3; Snapshot uses a larger value). */
  readonly markerRadius?: number;
  /**
   * A fixed reference curve (Walk the Line's target), drawn with distinct
   * styling in the SAME coordinate system as `series`, behind the student trace.
   * The plot area is clipped so an out-of-range `series` clips at the edge
   * rather than painting over the axes.
   */
  readonly target?: { readonly t: readonly number[]; readonly x: readonly number[] };
  /** Wired to a generous invisible hit region along the target path (Walk the
   *  Line vertical drag). The visible stroke is unchanged. */
  readonly onTargetPointerDown?: (event: PointerEvent) => void;
}

/** The last render's Y mapping — for converting a vertical drag to metres. */
export interface YGeometry {
  readonly domain: readonly [number, number];
  readonly pixelTop: number; // smaller SVG y — plot top
  readonly pixelBottom: number; // larger SVG y — plot bottom
}

export function metresPerPixelY(g: YGeometry): number {
  const span = g.pixelBottom - g.pixelTop;
  if (span === 0) return 0;
  return (g.domain[1] - g.domain[0]) / span;
}

export function pixelYToMetres(g: YGeometry, pixelY: number): number {
  return makeScale([g.pixelBottom, g.pixelTop], g.domain)(pixelY);
}

/** The last render's X mapping — for converting a horizontal drag to seconds. */
export interface XGeometry {
  readonly domain: readonly [number, number];
  readonly pixelLeft: number;
  readonly pixelRight: number;
}

export function pixelXToSeconds(g: XGeometry, pixelX: number): number {
  return makeScale([g.pixelLeft, g.pixelRight], g.domain)(pixelX);
}

export function secondsPerPixelX(g: XGeometry): number {
  const span = g.pixelRight - g.pixelLeft;
  if (span === 0) return 0;
  return (g.domain[1] - g.domain[0]) / span;
}

export interface ChartHandle {
  update(input: ChartInput): void;
  destroy(): void;
  /** null before the first render. */
  yGeometry(): YGeometry | null;
  xGeometry(): XGeometry | null;
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
  let lastYGeometry: YGeometry | null = null;
  let lastXGeometry: XGeometry | null = null;
  let selDrag:
    | { pointerId: number; grab: "start" | "end" | "band"; startClientX: number; from: { startT: number; endT: number } }
    | null = null;

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
    lastYGeometry = { domain: yDomain, pixelTop: plot.y1, pixelBottom: plot.y0 };
    lastXGeometry = { domain: xDomain, pixelLeft: plot.x0, pixelRight: plot.x1 };

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

    // interval selection band (+ editable handles for Snapshot Lab)
    if (input.selection) {
      const sel = input.selection;
      const sx0 = xScale(Math.min(sel.startT, sel.endT));
      const sx1 = xScale(Math.max(sel.startT, sel.endT));
      const band = svg("rect", {
        class: "selection-band",
        x: sx0,
        y: plot.y1,
        width: Math.max(0, sx1 - sx0),
        height: plot.y0 - plot.y1,
        fill: "var(--accent)",
        "fill-opacity": "0.12",
      });
      g.appendChild(band);

      if (sel.editable && sel.onChange) {
        // subdue the region outside the selection
        g.appendChild(svg("rect", { class: "sel-mask", x: plot.x0, y: plot.y1, width: Math.max(0, sx0 - plot.x0), height: plot.y0 - plot.y1, fill: "var(--surface)", "fill-opacity": "0.45" }));
        g.appendChild(svg("rect", { class: "sel-mask", x: sx1, y: plot.y1, width: Math.max(0, plot.x1 - sx1), height: plot.y0 - plot.y1, fill: "var(--surface)", "fill-opacity": "0.45" }));

        band.setAttribute("pointer-events", "fill");
        (band as SVGElement & { style: CSSStyleDeclaration }).style.cursor = "grab";
        band.addEventListener("pointerdown", (e) => beginSelDrag(e as PointerEvent, "band"));

        for (const [grab, px] of [["start", sx0] as const, ["end", sx1] as const]) {
          g.appendChild(svg("line", { class: `sel-handle sel-handle-${grab}`, x1: px, y1: plot.y1, x2: px, y2: plot.y0, stroke: "var(--accent)", "stroke-width": 2 }));
          const hit = svg("rect", { class: `sel-handle-hit sel-handle-hit-${grab}`, x: px - 9, y: plot.y1, width: 18, height: plot.y0 - plot.y1, fill: "transparent", "pointer-events": "fill" });
          (hit as SVGElement & { style: CSSStyleDeclaration }).style.cursor = "ew-resize";
          hit.addEventListener("pointerdown", (e) => beginSelDrag(e as PointerEvent, grab));
          g.appendChild(hit);
        }
      }
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
      if (targetD) {
        gClip.appendChild(svg("path", { class: "target", d: targetD }));
        // a generous invisible hit region for vertical drag (visible stroke unchanged)
        const hit = svg("path", {
          class: "target-hit",
          d: targetD,
          fill: "none",
          stroke: "transparent",
          "stroke-width": 26,
          "pointer-events": "stroke",
        });
        (hit as SVGElement & { style: CSSStyleDeclaration }).style.cursor = "ns-resize";
        if (input.onTargetPointerDown) {
          hit.addEventListener("pointerdown", (e) =>
            input.onTargetPointerDown!(e as PointerEvent),
          );
        }
        gClip.appendChild(hit);
      }
    }

    // dense contextual MOTION trace — behind the sampled points + model
    if (input.motionTrace && input.motionTrace.x.length > 0) {
      const mt = input.motionTrace;
      const md = buildPathD({ t: mt.x, x: mt.y }, xScale, yScale);
      if (md) gClip.appendChild(svg("path", { class: "motion-trace", d: md }));
    }

    // the (student) trace
    const traceD = buildPathD(input.series, xScale, yScale);
    const trace = svg("path", { class: "trace" });
    if (traceD) trace.setAttribute("d", traceD);
    gClip.appendChild(trace);

    // MODEL curve (Snapshot Lab) — the EXACT fit, above the motion trace,
    // below the sampled points so the teaching coordinates stay highest-contrast
    if (input.functionOverlay) {
      const f = input.functionOverlay;
      const steps = 160;
      let d = "";
      let penDown = false; // reset on each NaN so a gap starts a fresh subpath
      for (let i = 0; i <= steps; i++) {
        const x = xDomain[0] + (i / steps) * (xDomain[1] - xDomain[0]);
        const y = f(x);
        if (!Number.isFinite(y)) {
          penDown = false;
          continue;
        }
        const cmd = penDown ? "L" : "M";
        d += `${d === "" ? "" : " "}${cmd} ${xScale(x).toFixed(2)} ${yScale(y).toFixed(2)}`;
        penDown = true;
      }
      if (d) gClip.appendChild(svg("path", { class: "model-curve", d }));
    }

    // sampled POINTS — on top, highest local contrast
    const markerR = input.markerRadius ?? 3;
    const paintMarkers = (
      set: readonly { readonly t: number; readonly x: number; readonly muted?: boolean }[] | undefined,
      cls: string,
    ): void => {
      for (const m of set ?? []) {
        gClip.appendChild(
          svg("circle", {
            class: m.muted ? `${cls} marker--muted` : cls,
            cx: xScale(m.t),
            cy: yScale(m.x),
            r: m.muted ? markerR * 0.7 : markerR,
          }),
        );
      }
    };
    paintMarkers(input.markersAlt, "marker marker--alt");
    paintMarkers(input.markers, "marker");
  };

  // ── editable selection drag ─────────────────────────────────────────────
  const MIN_GAP_PX = 6;

  function beginSelDrag(e: PointerEvent, grab: "start" | "end" | "band"): void {
    const sel = lastInput?.selection;
    if (!sel || !sel.editable || !sel.onChange) return;
    selDrag = { pointerId: e.pointerId, grab, startClientX: e.clientX, from: { startT: sel.startT, endT: sel.endT } };
    if (typeof host.setPointerCapture === "function") {
      try {
        host.setPointerCapture(e.pointerId);
      } catch {
        /* jsdom */
      }
    }
    host.addEventListener("pointermove", onSelMove);
    host.addEventListener("pointerup", onSelUp);
    host.addEventListener("pointercancel", onSelUp);
    e.preventDefault();
    e.stopPropagation();
  }

  function onSelMove(e: PointerEvent): void {
    const sel = lastInput?.selection;
    const gx = lastXGeometry;
    if (!selDrag || !sel?.onChange || !gx || e.pointerId !== selDrag.pointerId) return;
    const perPx = secondsPerPixelX(gx);
    const dt = (e.clientX - selDrag.startClientX) * perPx;
    const [lo, hi] = gx.domain;
    const minGap = MIN_GAP_PX * perPx;
    let { startT, endT } = selDrag.from;

    if (selDrag.grab === "band") {
      const width = endT - startT;
      startT = Math.min(Math.max(lo, startT + dt), hi - width);
      endT = startT + width;
    } else if (selDrag.grab === "start") {
      startT = Math.min(Math.max(lo, startT + dt), endT - minGap);
    } else {
      endT = Math.max(Math.min(hi, endT + dt), startT + minGap);
    }
    sel.onChange({ startT, endT });
  }

  function onSelUp(e: PointerEvent): void {
    if (!selDrag || e.pointerId !== selDrag.pointerId) return;
    selDrag = null;
    host.removeEventListener("pointermove", onSelMove);
    host.removeEventListener("pointerup", onSelUp);
    host.removeEventListener("pointercancel", onSelUp);
    if (typeof host.releasePointerCapture === "function") {
      try {
        host.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  const onResize = (): void => redraw();
  window.addEventListener("resize", onResize);

  return {
    update(input) {
      lastInput = input;
      redraw();
    },
    destroy() {
      window.removeEventListener("resize", onResize);
      host.removeEventListener("pointermove", onSelMove);
      host.removeEventListener("pointerup", onSelUp);
      root.remove();
    },
    yGeometry() {
      return lastYGeometry;
    },
    xGeometry() {
      return lastXGeometry;
    },
  };
}
