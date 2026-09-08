import type { ClassroomPoint } from "./classroom-snapshot.js";
import { fitModel, isFitFailure, type FitResult, type ModelFamily } from "./model-fit.js";

/**
 * Deterministic model suggestion. Philosophy: **the simplest model that fits
 * well enough** — never "max r²". (Linear r²≈0.995 beats Cubic r²=1.000.)
 */
export const GOOD = 0.98; // "fits well enough"
export const MATERIAL = 0.03; // a higher-degree polynomial must beat the simpler one by this
export const SPECIAL_GOOD = 0.995;
export const SPECIAL_MARGIN = 0.02; // abs/sqrt/exp must also beat the best polynomial by this

export interface Suggestion {
  readonly family: ModelFamily;
  readonly reason: string;
}

export function suggestModel(points: readonly ClassroomPoint[]): Suggestion {
  const fits = new Map<ModelFamily, FitResult>();
  for (const fam of ["constant", "linear", "quadratic", "cubic", "abs", "sqrt", "exp"] as const) {
    const r = fitModel(fam, points);
    if (!isFitFailure(r)) fits.set(fam, r);
  }
  const r2 = (f: ModelFamily): number => fits.get(f)?.rSquared ?? -Infinity;

  if (r2("constant") >= GOOD) {
    return { family: "constant", reason: "The position barely changes." };
  }
  if (r2("linear") >= GOOD) {
    return { family: "linear", reason: "A straight line already fits well." };
  }

  // A "special shape" wins here only if it is genuinely excellent and clearly
  // beats a straight line — so a clean V / square-root / exponential is caught
  // before a polynomial is forced to approximate it.
  for (const special of ["abs", "sqrt", "exp"] as const) {
    if (r2(special) >= SPECIAL_GOOD && r2(special) - r2("linear") >= SPECIAL_MARGIN) {
      return {
        family: special,
        reason: `A ${special === "abs" ? "V" : special === "sqrt" ? "square-root" : "growth"} shape fits noticeably better than a line.`,
      };
    }
  }

  if (r2("quadratic") >= GOOD && r2("quadratic") - r2("linear") >= MATERIAL) {
    return { family: "quadratic", reason: "A line misses a clear curve." };
  }
  if (r2("cubic") >= GOOD && r2("cubic") - r2("quadratic") >= MATERIAL) {
    return { family: "cubic", reason: "The curve changes direction more than once." };
  }

  const bestPoly = (["cubic", "quadratic", "linear", "constant"] as const).reduce(
    (best, f) => (r2(f) > r2(best) ? f : best),
    "constant" as ModelFamily,
  );

  // fall back to the best polynomial, preferring the lower degree when close
  const order: ModelFamily[] = ["linear", "quadratic", "cubic"];
  for (let i = 0; i < order.length - 1; i++) {
    const lo = order[i]!;
    const hi = order[i + 1]!;
    if (r2(hi) - r2(lo) < MATERIAL && r2(lo) > -Infinity) {
      return { family: lo, reason: "The simplest model that fits about as well." };
    }
  }
  return { family: bestPoly, reason: "The model with the closest fit here." };
}
