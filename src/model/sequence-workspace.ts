import type { MotionRun } from "./motion-run.js";
import { coefficientOfVariation, type ExtremumKind, type Sensitivity } from "./cycle-analysis.js";
import { DEFAULT_SENSITIVITY } from "./cycle-analysis.js";
import { detectBouncePeaks } from "./bounce-analysis.js";
import {
  detectPendulumExtrema,
  pendulumAmplitudeSequence,
  pendulumPeriodSeries,
} from "./pendulum-analysis.js";
import { sequenceRatio } from "./sequence-ratio.js";
import {
  applyRange,
  clampRange,
  fullRange,
  withEnd,
  withStart,
  type SequenceRange,
} from "./sequence-range.js";

/**
 * Pure Sequence Lab workspace state. Session-only; the source `MotionRun` is
 * never mutated and nothing here is persisted. Every transition recomputes the
 * derived analysis from the pure detectors, so the view (which renders purely
 * from this) can never show a stale sequence.
 */

export type SequenceMode = "bounce" | "pendulum";
export type PendulumMeasure = "amplitude" | "period";

export interface RawMarker {
  readonly timeSeconds: number;
  readonly positionMeters: number;
  readonly kind: ExtremumKind | "peak";
  readonly included: boolean;
}

export interface SequenceTerm {
  readonly n: number;
  readonly value: number;
  readonly timeSeconds: number;
  readonly rawPositionMeters: number;
  readonly included: boolean;
}

export interface SequenceAnalysis {
  readonly ok: boolean;
  readonly reason?: string;
  readonly rawMarkers: readonly RawMarker[];
  /** bounce reference / pendulum midline — a dashed line on the raw graph */
  readonly referenceMeters: number | null;
  readonly terms: readonly SequenceTerm[];
  readonly fullTermCount: number;
  readonly yLabel: string;
  readonly headline: { readonly label: string; readonly value: string };
  readonly status: string | null;
  readonly formula: string | null;
}

export interface SequenceWorkspace {
  readonly run: MotionRun;
  readonly mode: SequenceMode;
  readonly pendulumMeasure: PendulumMeasure;
  readonly sensitivity: Sensitivity;
  readonly range: SequenceRange;
  readonly analysis: SequenceAnalysis;
}

const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" } as const;
const sup = (s: string): string => [...s].map((c) => SUP[c as keyof typeof SUP] ?? c).join("");

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;

function failedAnalysis(reason: string, yLabel: string, headlineLabel: string): SequenceAnalysis {
  return {
    ok: false,
    reason,
    rawMarkers: [],
    referenceMeters: null,
    terms: [],
    fullTermCount: 0,
    yLabel,
    headline: { label: headlineLabel, value: "—" },
    status: null,
    formula: null,
  };
}

// ── bounce ───────────────────────────────────────────────────────────────────

function buildBounce(run: MotionRun, sensitivity: Sensitivity, range: SequenceRange): {
  analysis: SequenceAnalysis;
  range: SequenceRange;
} {
  const det = detectBouncePeaks(run, { sensitivity });
  if (!det.ok) {
    return {
      analysis: failedAnalysis(det.reason, "Bounce height (m)", "COMMON RATIO"),
      range: fullRange(0),
    };
  }
  const count = det.peaks.length;
  const r = clampRange(range, count);
  const { included, excluded } = applyRange(det.peaks, r);

  const terms: SequenceTerm[] = [...included, ...excluded]
    .map(({ n, item }) => ({
      n,
      value: item.heightMeters,
      timeSeconds: item.timeSeconds,
      rawPositionMeters: item.rawPositionMeters,
      included: n >= r.start && n <= r.end,
    }))
    .sort((a, b) => a.n - b.n);

  const rawMarkers: RawMarker[] = det.peaks.map((p, i) => ({
    timeSeconds: p.timeSeconds,
    positionMeters: p.rawPositionMeters,
    kind: "peak" as const,
    included: i + 1 >= r.start && i + 1 <= r.end,
  }));

  const heights = terms.filter((t) => t.included).map((t) => t.value);
  const ratio = sequenceRatio(heights);
  const hasRatio = ratio.ratio !== null && Number.isFinite(ratio.ratio);

  return {
    analysis: {
      ok: true,
      rawMarkers,
      referenceMeters: det.referenceMeters,
      terms,
      fullTermCount: count,
      yLabel: "Bounce height (m)",
      headline: { label: "COMMON RATIO", value: hasRatio ? `r ≈ ${ratio.ratio!.toFixed(2)}` : "—" },
      status: hasRatio ? (ratio.consistent ? "RATIO LOOKS CONSISTENT" : "RATIO VARIES") : null,
      formula:
        hasRatio && ratio.usableTermCount >= 3 && heights.length > 0
          ? `aₙ ≈ ${heights[0]!.toFixed(2)} · ${ratio.ratio!.toFixed(2)}${sup("n-1")}`
          : null,
    },
    range: r,
  };
}

// ── pendulum ─────────────────────────────────────────────────────────────────

function buildPendulum(
  run: MotionRun,
  measure: PendulumMeasure,
  sensitivity: Sensitivity,
  range: SequenceRange,
): { analysis: SequenceAnalysis; range: SequenceRange } {
  const yLabel = measure === "amplitude" ? "Amplitude (m)" : "Period (s)";
  const headlineLabel = measure === "amplitude" ? "AMPLITUDE RATIO" : "AVERAGE PERIOD";

  const pd = detectPendulumExtrema(run, { sensitivity });
  if (!pd.ok) {
    return { analysis: failedAnalysis(pd.reason, yLabel, headlineLabel), range: fullRange(0) };
  }

  const extremaByTime = [...pd.extrema].sort((a, b) => a.timeSeconds - b.timeSeconds);
  const midlineMarker = (included: (t: number) => boolean): RawMarker[] =>
    extremaByTime.map((e) => ({
      timeSeconds: e.timeSeconds,
      positionMeters: e.rawValueMeters,
      kind: e.kind,
      included: included(e.timeSeconds),
    }));

  if (measure === "amplitude") {
    const seq = pendulumAmplitudeSequence(pd);
    if (!seq.ok) return { analysis: failedAnalysis(seq.reason, yLabel, headlineLabel), range: fullRange(0) };

    const count = seq.terms.length;
    const r = clampRange(range, count);
    const { included, excluded } = applyRange(seq.terms, r);
    const terms: SequenceTerm[] = [...included, ...excluded]
      .map(({ n, item }) => ({
        n,
        value: item.amplitudeMeters,
        timeSeconds: item.timeSeconds,
        rawPositionMeters: item.rawPositionMeters,
        included: n >= r.start && n <= r.end,
      }))
      .sort((a, b) => a.n - b.n);

    const startT = seq.terms[r.start - 1]?.timeSeconds ?? -Infinity;
    const endT = seq.terms[r.end - 1]?.timeSeconds ?? Infinity;
    const amps = terms.filter((t) => t.included).map((t) => t.value);
    const ratio = sequenceRatio(amps);
    const hasRatio = ratio.ratio !== null && Number.isFinite(ratio.ratio);

    return {
      analysis: {
        ok: true,
        rawMarkers: midlineMarker((t) => t >= startT - 1e-9 && t <= endT + 1e-9),
        referenceMeters: pd.midlineMeters,
        terms,
        fullTermCount: count,
        yLabel,
        headline: {
          label: headlineLabel,
          value: hasRatio ? `r ≈ ${ratio.ratio!.toFixed(2)}` : "—",
        },
        status: hasRatio ? (ratio.consistent ? "RATIO LOOKS CONSISTENT" : "RATIO VARIES") : null,
        formula:
          hasRatio && ratio.usableTermCount >= 3 && amps.length > 0
            ? `aₙ ≈ ${amps[0]!.toFixed(2)} · ${ratio.ratio!.toFixed(2)}${sup("n-1")}`
            : null,
      },
      range: r,
    };
  }

  // period
  const per = pendulumPeriodSeries(pd);
  if (!per.ok) return { analysis: failedAnalysis(per.reason, yLabel, headlineLabel), range: fullRange(0) };

  const likeTimes = extremaByTime
    .filter((e) => e.kind === (per.source === "maxima" ? "max" : "min"))
    .map((e) => e.timeSeconds);

  const count = per.periods.length;
  const r = clampRange(range, count);
  const periodTerms = per.periods.map((value, i) => ({
    value,
    timeSeconds: (likeTimes[i]! + likeTimes[i + 1]!) / 2,
  }));
  const { included, excluded } = applyRange(periodTerms, r);
  const terms: SequenceTerm[] = [...included, ...excluded]
    .map(({ n, item }) => ({
      n,
      value: item.value,
      timeSeconds: item.timeSeconds,
      rawPositionMeters: pd.midlineMeters,
      included: n >= r.start && n <= r.end,
    }))
    .sort((a, b) => a.n - b.n);

  const startT = likeTimes[r.start - 1] ?? -Infinity;
  const endT = likeTimes[r.end] ?? Infinity;
  const kept = terms.filter((t) => t.included).map((t) => t.value);
  const avg = mean(kept);
  const cv = coefficientOfVariation(kept);
  const hasAvg = Number.isFinite(avg);

  return {
    analysis: {
      ok: true,
      rawMarkers: midlineMarker((t) => t >= startT - 1e-9 && t <= endT + 1e-9),
      referenceMeters: pd.midlineMeters,
      terms,
      fullTermCount: count,
      yLabel,
      headline: { label: headlineLabel, value: hasAvg ? `T ≈ ${avg.toFixed(2)} s` : "—" },
      status: hasAvg ? (cv <= 0.18 ? "PERIOD LOOKS CONSISTENT" : "PERIOD VARIES") : null,
      formula: null,
    },
    range: r,
  };
}

// ── transitions ──────────────────────────────────────────────────────────────

function derive(
  run: MotionRun,
  mode: SequenceMode,
  measure: PendulumMeasure,
  sensitivity: Sensitivity,
  range: SequenceRange,
): { analysis: SequenceAnalysis; range: SequenceRange } {
  return mode === "bounce"
    ? buildBounce(run, sensitivity, range)
    : buildPendulum(run, measure, sensitivity, range);
}

const OPEN_RANGE: SequenceRange = { start: 1, end: Number.MAX_SAFE_INTEGER };

export function startSequenceWorkspace(run: MotionRun): SequenceWorkspace {
  const { analysis, range } = derive(run, "bounce", "amplitude", DEFAULT_SENSITIVITY, OPEN_RANGE);
  return {
    run,
    mode: "bounce",
    pendulumMeasure: "amplitude",
    sensitivity: DEFAULT_SENSITIVITY,
    range,
    analysis,
  };
}

export function setMode(ws: SequenceWorkspace, mode: SequenceMode): SequenceWorkspace {
  if (mode === ws.mode) return ws;
  const { analysis, range } = derive(ws.run, mode, ws.pendulumMeasure, ws.sensitivity, OPEN_RANGE);
  return { ...ws, mode, range, analysis };
}

export function setPendulumMeasure(ws: SequenceWorkspace, measure: PendulumMeasure): SequenceWorkspace {
  if (measure === ws.pendulumMeasure) return ws;
  const { analysis, range } = derive(ws.run, ws.mode, measure, ws.sensitivity, OPEN_RANGE);
  return { ...ws, pendulumMeasure: measure, range, analysis };
}

export function setSensitivity(ws: SequenceWorkspace, sensitivity: Sensitivity): SequenceWorkspace {
  if (sensitivity === ws.sensitivity) return ws;
  const { analysis, range } = derive(ws.run, ws.mode, ws.pendulumMeasure, sensitivity, OPEN_RANGE);
  return { ...ws, sensitivity, range, analysis };
}

export function setRange(ws: SequenceWorkspace, start: number, end: number): SequenceWorkspace {
  const count = ws.analysis.fullTermCount;
  const next = clampRange({ start, end }, count);
  const { analysis, range } = derive(ws.run, ws.mode, ws.pendulumMeasure, ws.sensitivity, next);
  return { ...ws, range, analysis };
}

export function setRangeStart(ws: SequenceWorkspace, n: number): SequenceWorkspace {
  const next = withStart(ws.range, ws.analysis.fullTermCount, n);
  return setRange(ws, next.start, next.end);
}

export function setRangeEnd(ws: SequenceWorkspace, n: number): SequenceWorkspace {
  const next = withEnd(ws.range, ws.analysis.fullTermCount, n);
  return setRange(ws, next.start, next.end);
}

export function useAllRange(ws: SequenceWorkspace): SequenceWorkspace {
  const { analysis, range } = derive(
    ws.run,
    ws.mode,
    ws.pendulumMeasure,
    ws.sensitivity,
    OPEN_RANGE,
  );
  return { ...ws, range, analysis };
}

export function rangeIsFull(ws: SequenceWorkspace): boolean {
  return ws.range.start <= 1 && ws.range.end >= ws.analysis.fullTermCount;
}

export function withSequenceRun(ws: SequenceWorkspace, run: MotionRun): SequenceWorkspace {
  if (run.id === ws.run.id) return ws;
  return startSequenceWorkspace(run);
}
