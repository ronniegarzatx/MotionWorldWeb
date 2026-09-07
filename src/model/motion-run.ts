import type { MotionSample } from "./motion-sample.js";

/**
 * MotionRun — an immutable completed acquisition.
 *
 * In Milestone Zero a run is formed in memory when MEASURING ends and only its
 * basic metadata is displayed. It is never persisted (no IndexedDB in the
 * spike). Raw samples are frozen and never rewritten (spec §6).
 */
export type MotionRunSource = "sensor" | "fake" | "replay" | "synthetic";

export interface MotionRun {
  readonly id: string;
  readonly startedAtEpochMs: number;
  readonly samples: readonly MotionSample[];
  readonly sampleCount: number;
  readonly durationSeconds: number;
  readonly samplerHz: number;
  readonly source: MotionRunSource;
  readonly deviceLabel: string | null;
}

export interface MakeMotionRunInput {
  readonly samples: readonly MotionSample[];
  readonly samplerHz: number;
  readonly source: MotionRunSource;
  readonly deviceLabel: string | null;
  /** Defaults to Date.now(); injectable for tests. */
  readonly startedAtEpochMs?: number;
  /** Defaults to a random UUID; injectable for tests. */
  readonly id?: string;
}

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeMotionRun(input: MakeMotionRunInput): MotionRun {
  const samples = Object.freeze(input.samples.slice());
  const sampleCount = samples.length;

  let durationSeconds = 0;
  if (sampleCount >= 2) {
    const first = samples[0]!;
    const last = samples[sampleCount - 1]!;
    durationSeconds = last.timestampSeconds - first.timestampSeconds;
  }

  return Object.freeze({
    id: input.id ?? randomId(),
    startedAtEpochMs: input.startedAtEpochMs ?? Date.now(),
    samples,
    sampleCount,
    durationSeconds,
    samplerHz: input.samplerHz,
    source: input.source,
    deviceLabel: input.deviceLabel,
  });
}
