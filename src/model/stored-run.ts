import { makeMotionRun, type MotionRun, type MotionRunSource } from "./motion-run.js";
import { makeMotionSample } from "./motion-sample.js";
import { isInterrupted, type StopReason } from "./stop-reason.js";

/**
 * A versioned, serializable snapshot of a completed MotionRun for local
 * persistence. The raw normalized samples are the durable truth — no rounding,
 * no HID packets, no diagnostic logs.
 *
 * `deserializeRun` rebuilds the *same* immutable MotionRun model used by live
 * acquisition — a StoredRun is a plain DTO, never an editable substitute.
 */
export const RUN_SCHEMA_VERSION = 1;

export interface StoredSample {
  readonly t: number; // timestampSeconds, exact
  readonly x: number; // positionMeters, exact
}

export interface StoredRun {
  readonly schemaVersion: number;
  readonly id: string;
  readonly savedAtEpochMs: number;
  readonly startedAtEpochMs: number;
  readonly durationSeconds: number;
  readonly sampleCount: number;
  readonly samplerHz: number;
  readonly source: MotionRunSource;
  readonly deviceLabel: string | null;
  readonly stopReason: StopReason;
  readonly interrupted: boolean;
  readonly samples: readonly StoredSample[];
}

export interface StoredRunSummary {
  readonly id: string;
  readonly savedAtEpochMs: number;
  readonly startedAtEpochMs: number;
  readonly durationSeconds: number;
  readonly sampleCount: number;
  readonly source: MotionRunSource;
  readonly deviceLabel: string | null;
  readonly stopReason: StopReason;
  readonly interrupted: boolean;
}

export function serializeRun(run: MotionRun, savedAtEpochMs: number = Date.now()): StoredRun {
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    id: run.id,
    savedAtEpochMs,
    startedAtEpochMs: run.startedAtEpochMs,
    durationSeconds: run.durationSeconds,
    sampleCount: run.sampleCount,
    samplerHz: run.samplerHz,
    source: run.source,
    deviceLabel: run.deviceLabel,
    stopReason: run.stopReason,
    interrupted: isInterrupted(run.stopReason),
    samples: run.samples.map((s) => ({ t: s.timestampSeconds, x: s.positionMeters })),
  };
}

export function deserializeRun(stored: StoredRun): MotionRun {
  return makeMotionRun({
    id: stored.id,
    startedAtEpochMs: stored.startedAtEpochMs,
    samplerHz: stored.samplerHz,
    source: stored.source,
    deviceLabel: stored.deviceLabel,
    stopReason: stored.stopReason,
    samples: stored.samples.map((s) => makeMotionSample(s.t, s.x)),
  });
}

export function summarizeStored(stored: StoredRun): StoredRunSummary {
  return {
    id: stored.id,
    savedAtEpochMs: stored.savedAtEpochMs,
    startedAtEpochMs: stored.startedAtEpochMs,
    durationSeconds: stored.durationSeconds,
    sampleCount: stored.sampleCount,
    source: stored.source,
    deviceLabel: stored.deviceLabel,
    stopReason: stored.stopReason,
    interrupted: stored.interrupted,
  };
}
