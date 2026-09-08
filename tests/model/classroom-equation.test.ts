import { describe, expect, it } from "vitest";
import {
  classroomExpression,
  preciseExpression,
  snapCoefficient,
} from "../../src/model/classroom-equation.js";

describe("snapCoefficient", () => {
  it("snaps to integer / half / one decimal per the rule", () => {
    expect(snapCoefficient(-0.99)).toBe(-1);
    expect(snapCoefficient(3.94)).toBe(4);
    expect(snapCoefficient(2.46)).toBe(2.5);
    expect(snapCoefficient(0.52)).toBe(0.5);
    expect(snapCoefficient(1.27)).toBe(1.3);
    expect(snapCoefficient(0.08)).toBe(0);
    expect(snapCoefficient(-0.08)).toBe(0);
  });
});

describe("classroomExpression (display-only, snapped + tidied)", () => {
  it("linear -0.99x + 3.94 -> f(x) ≈ -x + 4", () => {
    expect(classroomExpression("linear", [-0.99, 3.94])).toBe("f(x) ≈ -x + 4");
  });
  it("1x + 0 -> f(x) ≈ x", () => {
    expect(classroomExpression("linear", [1.02, 0.04])).toBe("f(x) ≈ x");
  });
  it("-1x - 4 -> f(x) ≈ -x - 4", () => {
    expect(classroomExpression("linear", [-0.97, -3.96])).toBe("f(x) ≈ -x - 4");
  });
  it("quadratic keeps its x² even if a would snap toward small", () => {
    // a ≈ 0.05 snaps to 0 but the family must be preserved
    const s = classroomExpression("quadratic", [0.05, 1.98, 0.5]);
    expect(s).toMatch(/x²/);
  });
  it("constant", () => {
    expect(classroomExpression("constant", [2.47])).toBe("f(x) ≈ 2.5");
  });
});

describe("preciseExpression (no snapping)", () => {
  it("linear", () => {
    expect(preciseExpression("linear", [-0.99, 3.94])).toBe("f(x) = -0.99x + 3.94");
  });
  it("quadratic", () => {
    expect(preciseExpression("quadratic", [2, -1, 4])).toBe("f(x) = 2x² - x + 4");
  });
  it("exp", () => {
    expect(preciseExpression("exp", [1.5, 0.4])).toBe("f(x) = 1.5e^(0.4x)");
  });
  it("abs tidies + -", () => {
    expect(preciseExpression("abs", [2, 3, -1])).toBe("f(x) = 2|x - 3| - 1");
  });
});
