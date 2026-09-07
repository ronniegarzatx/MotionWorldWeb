/**
 * MotionSample — one immutable normalized motion observation.
 *
 * Timestamp semantics (spec §12): `timestampSeconds` is acquisition-relative,
 * monotonic, derived from the configured measurement period and the sample's
 * tick index (0 at each trigger). It is NOT wall-clock time. Any wall-clock
 * arrival time is diagnostic provenance kept elsewhere (RawReport.tMs), never
 * here.
 */
export interface MotionSample {
  readonly timestampSeconds: number;
  readonly positionMeters: number;
}

export function makeMotionSample(
  timestampSeconds: number,
  positionMeters: number,
): MotionSample {
  if (!Number.isFinite(timestampSeconds)) {
    throw new RangeError(`timestampSeconds must be finite, got ${timestampSeconds}`);
  }
  if (!Number.isFinite(positionMeters)) {
    throw new RangeError(`positionMeters must be finite, got ${positionMeters}`);
  }
  return Object.freeze({ timestampSeconds, positionMeters });
}
