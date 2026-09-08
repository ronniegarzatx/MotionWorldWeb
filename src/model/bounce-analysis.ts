import {
  detectExtrema,
  mad,
  median,
  type ExtremumKind,
  type RawExtremum,
  type Sensitivity,
} from "./cycle-analysis.js";

/**
 * Bounce mode — turn a bouncing-object position-vs-time run into a discrete
 * `n` vs bounce-height sequence. Orientation-agnostic: apexes may be maxima or
 * minima depending on sensor placement; height is always `abs(apex − reference)`.
 * Pure; the raw MotionRun is never mutated.
 */

export const MIN_BOUNCE_PEAKS = 3;

/** Tail fraction inspected for a settled resting level. */
const TAIL_FRACTION = 0.15;
/** Max std (m) of the settled tail — larger ⇒ not settled. Tunable on hardware. */
const TAIL_STABLE_STD = 0.03;
/** Max disagreement (m) between the tail estimate and the contact-extrema estimate. */
const REFERENCE_AGREEMENT = 0.05;

interface RunLike {
  readonly samples: readonly { readonly timestampSeconds: number; readonly positionMeters: number }[];
  readonly sampleCount?: number;
}

export type BounceReference =
  | { readonly ok: true; readonly referenceMeters: number; readonly apexKind: ExtremumKind }
  | { readonly ok: false; readonly reason: string };

const NO_REFERENCE =
  "Couldn’t find a stable resting level. Let the ball settle before stopping.";

function std(values: readonly number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
}

export function estimateBounceReference(
  run: RunLike,
  extrema: readonly RawExtremum[],
): BounceReference {
  const positions = run.samples.map((s) => s.positionMeters);
  if (positions.length < 10) return { ok: false, reason: NO_REFERENCE };

  const tailStart = Math.floor(positions.length * (1 - TAIL_FRACTION));
  const tail = positions.slice(tailStart);
  const tailStd = std(tail);
  const refFromTail = median(tail);

  const maxes = extrema.filter((e) => e.kind === "max").map((e) => e.valueMeters);
  const mins = extrema.filter((e) => e.kind === "min").map((e) => e.valueMeters);

  if (maxes.length >= 2 && mins.length >= 2) {
    // the contact side clusters tightly near the floor; the apex side decays
    const contactKind: ExtremumKind = mad(maxes) <= mad(mins) ? "max" : "min";
    const apexKind: ExtremumKind = contactKind === "max" ? "min" : "max";
    const refFromExtrema = median(contactKind === "max" ? maxes : mins);
    if (
      tailStd <= TAIL_STABLE_STD &&
      Math.abs(refFromExtrema - refFromTail) <= REFERENCE_AGREEMENT
    ) {
      return { ok: true, referenceMeters: refFromTail, apexKind };
    }
    return { ok: false, reason: NO_REFERENCE };
  }

  // no usable extrema split — lean on the settled tail alone
  if (tailStd <= TAIL_STABLE_STD) {
    const apexKind: ExtremumKind = median(positions) >= refFromTail ? "max" : "min";
    return { ok: true, referenceMeters: refFromTail, apexKind };
  }
  return { ok: false, reason: NO_REFERENCE };
}

export interface BouncePeak {
  readonly timeSeconds: number;
  readonly rawPositionMeters: number;
  readonly referenceMeters: number;
  readonly heightMeters: number;
  readonly prominence: number;
  /** sample index on the raw run — provenance for graph markers */
  readonly sampleIndex: number;
}

export type BounceDetection =
  | { readonly ok: true; readonly peaks: readonly BouncePeak[]; readonly referenceMeters: number }
  | { readonly ok: false; readonly reason: string };

export function detectBouncePeaks(
  run: RunLike,
  opts: { sensitivity: Sensitivity },
): BounceDetection {
  const extrema = detectExtrema(run, opts);
  const ref = estimateBounceReference(run, extrema);
  if (!ref.ok) return { ok: false, reason: ref.reason };

  const apexes = extrema
    .filter((e) => e.kind === ref.apexKind)
    .sort((a, b) => a.timeSeconds - b.timeSeconds);

  if (apexes.length < MIN_BOUNCE_PEAKS) {
    return { ok: false, reason: "Not enough clean bounces yet — collect 4–6 and let it settle." };
  }

  const peaks: BouncePeak[] = apexes.map((e) => ({
    timeSeconds: e.timeSeconds,
    rawPositionMeters: e.rawValueMeters,
    referenceMeters: ref.referenceMeters,
    heightMeters: Math.abs(e.valueMeters - ref.referenceMeters),
    prominence: e.prominence,
    sampleIndex: e.index,
  }));

  return { ok: true, peaks, referenceMeters: ref.referenceMeters };
}
