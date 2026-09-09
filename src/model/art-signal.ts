/**
 * ArtSignal — pure live-sensor → art-parameter mapping for Art Party. No DOM,
 * no canvas, no timers (design spec §6). Two separate reducers running on two
 * different clocks:
 *
 *   onArtSample     — once per incoming MotionSample (sample clock, ~25 Hz
 *                     while measuring). Ingests raw sensor data and detects
 *                     impulses; never does the frame-smoothing math.
 *   advanceArtSignal — once per rendered animation frame (frame clock),
 *                     REGARDLESS of whether a new sample arrived. This is
 *                     what makes "stop moving" and "sensor disconnected"
 *                     calm the composition the same way — via elapsed real
 *                     time, not sample arrival — instead of freezing.
 *
 * Direction convention matches the rest of the app (see model/rate-analysis.ts):
 * increasing positionMeters = "away" = positive velocity = direction 1.
 */
import type { MotionSample } from "./motion-sample.js";

export const ART_SIGNAL_CONSTANTS = {
  /** Go!Motion/CBR 2 practical near limit for stable classroom readings. */
  POSITION_MIN_M: 0.4,
  /** Typical classroom-scale usable range before signal quality degrades. */
  POSITION_MAX_M: 6.0,
  /** A brisk walking pace maps to speed01 = 1; faster clamps, never exceeds 1. */
  SPEED_REFERENCE_MPS: 2.0,
  /** Below this, two samples count as a duplicate/non-monotonic timestamp. */
  MIN_DT_SECONDS: 0.005,
  /** Above this, the gap is too large to trust as one instantaneous rate. */
  MAX_DT_SECONDS: 1.0,
  /** Caps one frame's smoothing step after a stalled tab. */
  MAX_FRAME_DT_SECONDS: 0.1,
  /** No fresh valid sample for this long -> velocity target relaxes to 0. */
  IDLE_AFTER_SECONDS: 0.5,
  /** speed01 level that counts as "substantial sudden movement". */
  IMPULSE_FIRE_THRESHOLD: 0.55,
  /** Must drop below this before a new impulse can fire again (hysteresis). */
  IMPULSE_REARM_THRESHOLD: 0.3,
  /** ~0.3s exponential settle after a fired impulse (exp(-rate*t)). */
  IMPULSE_DECAY_RATE: 6,
  /** Below this, report direction 0 ("not moving") instead of jitter. */
  DIRECTION_DEADBAND_MPS: 0.03,
  /** Frame-rate-independent smoothing rates (1 - exp(-rate*dt) lerp factor). */
  POSITION_SMOOTH_RATE: 8,
  VELOCITY_SMOOTH_RATE: 6,
  ENERGY_RISE_RATE: 8,
  ENERGY_DECAY_RATE: 1.5,
} as const;

const C = ART_SIGNAL_CONSTANTS;

export interface ArtSignal {
  readonly position01: number;
  readonly speed01: number;
  readonly signedVelocity: number;
  readonly direction: -1 | 0 | 1;
  readonly energy: number;
  readonly stillness: number;
  readonly impulse: number;
}

export interface ArtSignalState {
  readonly rawPositionMeters: number | null;
  readonly lastSampleAtSeconds: number | null;
  readonly targetVelocityMPerS: number;
  readonly secondsSinceSample: number;
  readonly position01: number;
  readonly signedVelocity: number;
  readonly energy: number;
  readonly impulse: number;
  readonly impulseArmed: boolean;
  readonly impulseSeq: number;
}

export const INITIAL_ART_SIGNAL_STATE: ArtSignalState = Object.freeze({
  rawPositionMeters: null,
  lastSampleAtSeconds: null,
  targetVelocityMPerS: 0,
  secondsSinceSample: 0,
  position01: 0.5,
  signedVelocity: 0,
  energy: 0,
  impulse: 0,
  impulseArmed: true,
  impulseSeq: 0,
});

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function lerpTowards(current: number, target: number, rate: number, dtSeconds: number): number {
  const alpha = 1 - Math.exp(-rate * dtSeconds);
  return current + (target - current) * alpha;
}

function positionFromMeters(meters: number): number {
  return (meters - C.POSITION_MIN_M) / (C.POSITION_MAX_M - C.POSITION_MIN_M);
}

/** Ingest one incoming sensor sample (sample clock). */
export function onArtSample(state: ArtSignalState, sample: MotionSample): ArtSignalState {
  if (!Number.isFinite(sample.positionMeters) || !Number.isFinite(sample.timestampSeconds)) {
    return state;
  }

  const clampedM = clamp(sample.positionMeters, C.POSITION_MIN_M, C.POSITION_MAX_M);
  const dt =
    state.lastSampleAtSeconds === null ? null : sample.timestampSeconds - state.lastSampleAtSeconds;

  let targetVelocityMPerS = state.targetVelocityMPerS;
  let impulse = state.impulse;
  let impulseArmed = state.impulseArmed;
  let impulseSeq = state.impulseSeq;

  if (dt !== null && dt >= C.MIN_DT_SECONDS && dt <= C.MAX_DT_SECONDS) {
    targetVelocityMPerS = (clampedM - state.rawPositionMeters!) / dt;

    const speed01Now = clamp(Math.abs(targetVelocityMPerS) / C.SPEED_REFERENCE_MPS, 0, 1);
    if (impulseArmed && speed01Now >= C.IMPULSE_FIRE_THRESHOLD) {
      impulse = 1;
      impulseArmed = false;
      impulseSeq += 1;
    } else if (!impulseArmed && speed01Now <= C.IMPULSE_REARM_THRESHOLD) {
      impulseArmed = true;
    }
  }

  return {
    ...state,
    rawPositionMeters: clampedM,
    lastSampleAtSeconds: sample.timestampSeconds,
    secondsSinceSample: 0,
    targetVelocityMPerS,
    impulse,
    impulseArmed,
    impulseSeq,
  };
}

/** Advance the smoothed signal by one rendered animation frame (frame clock). */
export function advanceArtSignal(state: ArtSignalState, dtSecondsIn: number): ArtSignalState {
  const dtSeconds = clamp(dtSecondsIn, 0, C.MAX_FRAME_DT_SECONDS);
  const secondsSinceSample = state.secondsSinceSample + dtSeconds;
  const idle = secondsSinceSample > C.IDLE_AFTER_SECONDS;
  const velocityTarget = idle ? 0 : state.targetVelocityMPerS;

  const positionTarget =
    state.rawPositionMeters === null ? state.position01 : positionFromMeters(state.rawPositionMeters);
  const position01 = clamp(
    lerpTowards(state.position01, positionTarget, C.POSITION_SMOOTH_RATE, dtSeconds),
    0,
    1,
  );
  const signedVelocity = lerpTowards(state.signedVelocity, velocityTarget, C.VELOCITY_SMOOTH_RATE, dtSeconds);

  const speed01 = clamp(Math.abs(signedVelocity) / C.SPEED_REFERENCE_MPS, 0, 1);
  const energyRate = speed01 > state.energy ? C.ENERGY_RISE_RATE : C.ENERGY_DECAY_RATE;
  const energy = clamp(lerpTowards(state.energy, speed01, energyRate, dtSeconds), 0, 1);

  const impulseDecayed = state.impulse * Math.exp(-C.IMPULSE_DECAY_RATE * dtSeconds);
  const impulse = impulseDecayed < 1e-4 ? 0 : impulseDecayed;

  return {
    ...state,
    secondsSinceSample,
    position01,
    signedVelocity,
    energy,
    impulse,
  };
}

export function toArtSignal(state: ArtSignalState): ArtSignal {
  const energy = state.energy;
  const direction: -1 | 0 | 1 =
    Math.abs(state.signedVelocity) < C.DIRECTION_DEADBAND_MPS ? 0 : Math.sign(state.signedVelocity) as -1 | 1;
  return {
    position01: state.position01,
    speed01: clamp(Math.abs(state.signedVelocity) / C.SPEED_REFERENCE_MPS, 0, 1),
    signedVelocity: state.signedVelocity,
    direction,
    energy,
    stillness: 1 - energy,
    impulse: state.impulse,
  };
}
