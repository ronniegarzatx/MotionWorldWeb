import { describe, expect, it } from "vitest";
import { parseFlags } from "../../src/app/flags.js";

describe("parseFlags", () => {
  it("empty search -> both false", () => {
    expect(parseFlags("")).toEqual({ fake: false, debugSensor: false });
    expect(parseFlags("?")).toEqual({ fake: false, debugSensor: false });
  });

  it("?fake", () => {
    expect(parseFlags("?fake")).toEqual({ fake: true, debugSensor: false });
  });

  it("?debug=sensor", () => {
    expect(parseFlags("?debug=sensor")).toEqual({ fake: false, debugSensor: true });
  });

  it("?fake&debug=sensor composes", () => {
    expect(parseFlags("?fake&debug=sensor")).toEqual({ fake: true, debugSensor: true });
  });

  it("?debug=other is not debugSensor", () => {
    expect(parseFlags("?debug=other").debugSensor).toBe(false);
  });
});
