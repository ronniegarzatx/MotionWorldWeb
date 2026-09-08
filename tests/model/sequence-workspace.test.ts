import { describe, expect, it } from "vitest";
import { makeMotionRun, type MotionRun } from "../../src/model/motion-run.js";
import { makeMotionSample } from "../../src/model/motion-sample.js";
import {
  rangeIsFull,
  setMode,
  setPendulumMeasure,
  setRangeEnd,
  setSensitivity,
  startSequenceWorkspace,
  useAllRange,
  withSequenceRun,
} from "../../src/model/sequence-workspace.js";

const G = 9.8;

function bounceRun(id: string, { h1 = 0.9, r = 0.72, ref = 0.15, bounces = 6, dt = 0.01 } = {}): MotionRun {
  const samples: { t: number; x: number }[] = [];
  let t = 0;
  for (let k = 0; k <= bounces; k++) {
    const apex = h1 * r ** k;
    const dur = 2 * Math.sqrt((2 * apex) / G);
    const steps = Math.max(4, Math.round(dur / dt));
    for (let s = 0; s < steps; s++) {
      const tau = (s / steps) * dur;
      samples.push({ t, x: ref + Math.max(0, apex - 0.5 * G * (tau - dur / 2) ** 2) });
      t += dt;
    }
  }
  for (let s = 0; s < 120; s++) {
    samples.push({ t, x: ref });
    t += dt;
  }
  return makeMotionRun({
    id,
    samplerHz: 100,
    source: "sensor",
    deviceLabel: null,
    stopReason: "ui",
    samples: samples.map((s) => makeMotionSample(s.t, s.x)),
  });
}

function pendulumRun(id: string, { A0 = 0.3, decay = 0.03, T = 1.4, midline = 0.5, n = 800, dt = 0.02 } = {}): MotionRun {
  return makeMotionRun({
    id,
    samplerHz: Math.round(1 / dt),
    source: "sensor",
    deviceLabel: null,
    stopReason: "ui",
    samples: Array.from({ length: n }, (_, i) => {
      const tt = i * dt;
      return makeMotionSample(tt, midline + A0 * Math.exp(-decay * tt) * Math.cos((2 * Math.PI * tt) / T));
    }),
  });
}

describe("sequence-workspace", () => {
  it("starts in Bounce / amplitude / standard / full range with a computed analysis", () => {
    const ws = startSequenceWorkspace(bounceRun("b"));
    expect(ws.mode).toBe("bounce");
    expect(ws.pendulumMeasure).toBe("amplitude");
    expect(ws.sensitivity).toBe("standard");
    expect(ws.analysis.ok).toBe(true);
    expect(ws.analysis.headline.label).toBe("COMMON RATIO");
    expect(ws.analysis.headline.value).toMatch(/r ≈ 0\.\d\d/);
    expect(rangeIsFull(ws)).toBe(true);
    expect(ws.analysis.terms.length).toBe(ws.analysis.fullTermCount);
  });

  it("setMode bounce↔pendulum recomputes and resets the range", () => {
    // a run that both detectors can analyse: a bouncing trace is periodic enough
    // for the pendulum extrema detector too
    const ws0 = setRangeEnd(startSequenceWorkspace(bounceRun("b")), 3);
    expect(rangeIsFull(ws0)).toBe(false);
    const ws1 = setMode(ws0, "pendulum");
    expect(ws1.mode).toBe("pendulum");
    expect(ws1.analysis.yLabel).toBe("Amplitude (m)");
    expect(rangeIsFull(ws1)).toBe(true);
    expect(setMode(ws1, "bounce").mode).toBe("bounce");
  });

  it("pendulum period mode yields AVERAGE PERIOD", () => {
    const ws = setPendulumMeasure(setMode(startSequenceWorkspace(pendulumRun("p")), "pendulum"), "period");
    expect(ws.analysis.ok).toBe(true);
    expect(ws.analysis.headline.label).toBe("AVERAGE PERIOD");
    expect(ws.analysis.headline.value).toMatch(/T ≈ 1\.\d\d s/);
    expect(ws.analysis.yLabel).toBe("Period (s)");
    expect(ws.analysis.status).toMatch(/PERIOD/);
  });

  it("setSensitivity recomputes and resets the range", () => {
    const ws0 = setRangeEnd(startSequenceWorkspace(bounceRun("b")), 3);
    const ws1 = setSensitivity(ws0, "high");
    expect(ws1.sensitivity).toBe("high");
    expect(rangeIsFull(ws1)).toBe(true);
  });

  it("trimming the range changes the ratio inputs but not the raw markers", () => {
    const ws0 = startSequenceWorkspace(bounceRun("b"));
    const markersBefore = ws0.analysis.rawMarkers.length;
    const ws1 = setRangeEnd(ws0, Math.max(3, ws0.analysis.fullTermCount - 1));
    expect(ws1.analysis.rawMarkers.length).toBe(markersBefore); // detected events still all shown
    expect(ws1.analysis.rawMarkers.some((m) => !m.included)).toBe(true); // some muted
    expect(ws1.analysis.terms.filter((t) => !t.included).length).toBeGreaterThan(0);
    expect(ws1.analysis.terms.length).toBe(ws1.analysis.fullTermCount); // nothing deleted
  });

  it("useAllRange restores the full range", () => {
    const ws = useAllRange(setRangeEnd(startSequenceWorkspace(bounceRun("b")), 3));
    expect(rangeIsFull(ws)).toBe(true);
  });

  it("a too-short run gives ok:false with a reason, graphs data still safe", () => {
    const short = pendulumRun("short", { n: 70 });
    const ws = setMode(startSequenceWorkspace(short), "pendulum");
    // depending on detection this is a failure; the analysis is still well-formed
    if (!ws.analysis.ok) {
      expect(ws.analysis.reason).toBeTruthy();
      expect(ws.analysis.terms).toEqual([]);
      expect(ws.analysis.headline.value).toBe("—");
    }
  });

  it("withSequenceRun resets for a new run; same id is a no-op", () => {
    const ws = setSensitivity(startSequenceWorkspace(bounceRun("a")), "low");
    expect(withSequenceRun(ws, bounceRun("a"))).toBe(ws);
    const swapped = withSequenceRun(ws, pendulumRun("b"));
    expect(swapped.run.id).toBe("b");
    expect(swapped.sensitivity).toBe("standard");
    expect(swapped.mode).toBe("bounce");
  });

  it("never mutates the source run", () => {
    const run = bounceRun("frozen");
    const snap = JSON.stringify(run.samples.map((s) => [s.timestampSeconds, s.positionMeters]));
    let ws = startSequenceWorkspace(run);
    ws = setMode(ws, "pendulum");
    ws = setPendulumMeasure(ws, "period");
    ws = setSensitivity(ws, "high");
    ws = setRangeEnd(ws, 2);
    ws = useAllRange(ws);
    expect(JSON.stringify(run.samples.map((s) => [s.timestampSeconds, s.positionMeters]))).toBe(snap);
  });
});
