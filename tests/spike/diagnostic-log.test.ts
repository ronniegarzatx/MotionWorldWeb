import { describe, expect, it, vi } from "vitest";
import { DiagnosticLog } from "../../src/spike/diagnostic-log.js";

describe("DiagnosticLog", () => {
  it("prepends timestamped lines and caps length", () => {
    let t = 0;
    const log = new DiagnosticLog(3, () => (t += 1000));
    log.add("a");
    log.add("b");
    log.add("c");
    log.add("d");
    const lines = log.snapshot();
    expect(lines.map((l) => l.message)).toEqual(["d", "c", "b"]);
    expect(lines[0]!.wallClock).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("clear empties and notifies", () => {
    const log = new DiagnosticLog();
    const seen = vi.fn();
    log.subscribe(seen);
    log.add("x");
    log.clear();
    expect(log.snapshot()).toEqual([]);
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("toText is oldest-first for reading", () => {
    let t = 0;
    const log = new DiagnosticLog(10, () => (t += 1000));
    log.add("first");
    log.add("second");
    expect(log.toText().split("\n").map((l) => l.split(" ")[1])).toEqual([
      "first",
      "second",
    ]);
  });
});
