import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPEED_LIMIT_MPH,
  SPEED_LIMIT_PRESETS_MPH,
  compareToSpeedLimit,
} from "../../src/model/speed-limit.js";

describe("speed-limit", () => {
  it("presets + default", () => {
    expect(SPEED_LIMIT_PRESETS_MPH).toEqual([2, 5, 10]);
    expect(DEFAULT_SPEED_LIMIT_MPH).toBe(5);
    expect(SPEED_LIMIT_PRESETS_MPH).toContain(DEFAULT_SPEED_LIMIT_MPH);
  });

  it("under the limit", () => {
    const c = compareToSpeedLimit(4.6, 5);
    expect(c.standing).toBe("under");
    expect(c.marginMph).toBeCloseTo(0.4, 6);
    expect(c.limitMph).toBe(5);
    expect(c.speedMph).toBe(4.6);
  });

  it("over the limit", () => {
    const c = compareToSpeedLimit(6.1, 5);
    expect(c.standing).toBe("over");
    expect(c.marginMph).toBeCloseTo(1.1, 6);
  });

  it("at the limit — exact and within tolerance", () => {
    expect(compareToSpeedLimit(5, 5).standing).toBe("at");
    expect(compareToSpeedLimit(5.03, 5).standing).toBe("at");
    expect(compareToSpeedLimit(4.97, 5).standing).toBe("at");
  });

  it("margin is never negative", () => {
    for (const [s, l] of [
      [0, 5],
      [12, 10],
      [2, 2],
      [3.3, 5],
    ] as const) {
      expect(compareToSpeedLimit(s, l).marginMph).toBeGreaterThanOrEqual(0);
    }
  });
});
