import type { ModelFamily } from "./model-fit.js";

/**
 * The classroom-friendly approximate equation. **Display only** — it never
 * replaces the FitResult coefficients or the graph's model curve.
 *
 * Snapping rule (ported from native V1):
 *   |c − round(c)|      ≤ 0.15  -> the integer
 *   |c − nearestHalf(c)| ≤ 0.15  -> the nearest 0.5
 *   otherwise                   -> one decimal place
 */
export function snapCoefficient(c: number): number {
  if (!Number.isFinite(c)) return 0;
  const nearInt = Math.round(c);
  if (Math.abs(c - nearInt) <= 0.15) return nearInt === 0 ? 0 : nearInt;
  const nearHalf = Math.round(c * 2) / 2;
  if (Math.abs(c - nearHalf) <= 0.15) return nearHalf;
  return Math.round(c * 10) / 10;
}

function num(n: number): string {
  const r = Number(n.toFixed(2));
  return Object.is(r, -0) ? "0" : String(r);
}

/** Build "a + b + c" tidying signs and 1x/-1x. `terms` are [coefficient, suffix]
 *  where suffix is "" (constant), "x", "x²", "x³", etc. */
function joinTerms(terms: [number, string][]): string {
  const kept = terms.filter(([c, suffix], i) => c !== 0 || (i === 0 && suffix === ""));
  if (kept.length === 0) return "0";
  const render = ([c, suffix]: [number, string], first: boolean): string => {
    const mag = Math.abs(c);
    let body: string;
    if (suffix === "") body = num(mag);
    else if (mag === 1) body = suffix;
    else body = `${num(mag)}${suffix}`;
    const sign = c < 0 ? "-" : "+";
    if (first) return c < 0 ? `-${body}` : body;
    return `${sign} ${body}`;
  };
  return kept.map((t, i) => render(t, i === 0)).join(" ");
}

const SUP = ["", "", "²", "³", "⁴"];

/** Approximate classroom expression, e.g. "f(x) ≈ -x + 4". */
export function classroomExpression(family: ModelFamily, coeffs: readonly number[]): string {
  const c = coeffs.map(snapCoefficient);
  return `f(x) ≈ ${bodyFor(family, coeffs, c)}`;
}

/** Precise expression, e.g. "f(x) = -0.99x + 3.94". */
export function preciseExpression(family: ModelFamily, coeffs: readonly number[]): string {
  return `f(x) = ${bodyFor(family, coeffs, coeffs)}`;
}

function bodyFor(
  family: ModelFamily,
  raw: readonly number[],
  display: readonly number[],
): string {
  switch (family) {
    case "constant":
      return num(display[0] ?? 0);
    case "linear":
    case "quadratic":
    case "cubic": {
      const deg = family === "linear" ? 1 : family === "quadratic" ? 2 : 3;
      // `display` is highest-power first: [c_deg, …, c_1, c_0]
      const terms: [number, string][] = [];
      for (let i = 0; i <= deg; i++) {
        const power = deg - i;
        let coeff = display[i] ?? 0;
        // a snap that erases the family: keep the leading term at one decimal
        if (power === deg && coeff === 0) coeff = Math.round((raw[i] ?? 0) * 10) / 10 || 0.1;
        terms.push([coeff, power === 0 ? "" : `x${SUP[power] ?? `^${power}`}`]);
      }
      return joinTerms(terms);
    }
    case "abs": {
      const [a, h, k] = display;
      const hs = num(h ?? 0);
      const inner = (h ?? 0) < 0 ? `x + ${num(Math.abs(h ?? 0))}` : `x - ${hs}`;
      const mag = Math.abs(a ?? 0);
      const lead = (a ?? 0) < 0 ? "-" : "";
      const aBody = mag === 1 ? "" : num(mag);
      const kk = k ?? 0;
      const kPart = kk === 0 ? "" : kk < 0 ? ` - ${num(Math.abs(kk))}` : ` + ${num(kk)}`;
      return `${lead}${aBody}|${inner}|${kPart}`;
    }
    case "sqrt": {
      const [a, h, k] = display;
      const hs = num(h ?? 0);
      const inner = (h ?? 0) < 0 ? `x + ${num(Math.abs(h ?? 0))}` : `x - ${hs}`;
      const mag = Math.abs(a ?? 0);
      const lead = (a ?? 0) < 0 ? "-" : "";
      const aBody = mag === 1 ? "" : num(mag);
      const kk = k ?? 0;
      const kPart = kk === 0 ? "" : kk < 0 ? ` - ${num(Math.abs(kk))}` : ` + ${num(kk)}`;
      return `${lead}${aBody}√(${inner})${kPart}`;
    }
    case "exp": {
      const [a, b] = display;
      return `${num(a ?? 0)}e^(${num(b ?? 0)}x)`;
    }
  }
}
