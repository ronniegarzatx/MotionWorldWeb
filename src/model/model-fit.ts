import type { ClassroomPoint } from "./classroom-snapshot.js";

/**
 * Least-squares fits for a small set of classroom function families. Pure TS
 * math — no symbolic algebra, no Python. Each family may **refuse** to fit
 * (FitFailure) rather than invent an equation.
 */
export type ModelFamily =
  | "constant"
  | "linear"
  | "quadratic"
  | "cubic"
  | "abs"
  | "sqrt"
  | "exp";

export const MODEL_FAMILIES: readonly ModelFamily[] = [
  "constant",
  "linear",
  "quadratic",
  "cubic",
  "abs",
  "sqrt",
  "exp",
];

export const FAMILY_LABEL: Record<ModelFamily, string> = {
  constant: "Constant",
  linear: "Linear",
  quadratic: "Quadratic",
  cubic: "Cubic",
  abs: "Absolute value",
  sqrt: "Square root",
  exp: "Exponential",
};

export const FAMILY_DESCRIPTION: Record<ModelFamily, string> = {
  constant: "A flat line — the position does not change.",
  linear: "A straight line — a steady rate of change.",
  quadratic: "A parabola — a changing (accelerating) rate.",
  cubic: "An S-shaped curve — the acceleration itself changes.",
  abs: "A V shape — a steady approach then a steady retreat.",
  sqrt: "A curve that rises quickly then levels off.",
  exp: "Growth (or decay) that speeds up as it goes.",
};

export interface FitResult {
  readonly ok: true;
  readonly family: ModelFamily;
  readonly coefficients: readonly number[];
  readonly rSquared: number;
  readonly preciseExpression: string;
}

export interface FitFailure {
  readonly ok: false;
  readonly family: ModelFamily;
  readonly reason: string;
}

export function isFitFailure(x: FitResult | FitFailure): x is FitFailure {
  return x.ok === false;
}

// ── pure predict ─────────────────────────────────────────────────────────────

export function predict(family: ModelFamily, c: readonly number[], x: number): number {
  switch (family) {
    case "constant":
      return c[0] ?? 0;
    case "linear":
      return (c[0] ?? 0) * x + (c[1] ?? 0);
    case "quadratic":
      return (c[0] ?? 0) * x * x + (c[1] ?? 0) * x + (c[2] ?? 0);
    case "cubic":
      return (c[0] ?? 0) * x ** 3 + (c[1] ?? 0) * x * x + (c[2] ?? 0) * x + (c[3] ?? 0);
    case "abs":
      return (c[0] ?? 0) * Math.abs(x - (c[1] ?? 0)) + (c[2] ?? 0);
    case "sqrt": {
      const under = x - (c[1] ?? 0);
      return under < 0 ? NaN : (c[0] ?? 0) * Math.sqrt(under) + (c[2] ?? 0);
    }
    case "exp":
      return (c[0] ?? 0) * Math.exp((c[1] ?? 0) * x);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function distinctX(points: readonly ClassroomPoint[]): number {
  return new Set(points.map((p) => p.x)).size;
}

function rSquared(points: readonly ClassroomPoint[], f: (x: number) => number): number {
  const ys = points.map((p) => p.y);
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of points) {
    ssTot += (p.y - mean) ** 2;
    const yhat = f(p.x);
    ssRes += (p.y - yhat) ** 2;
  }
  if (ssTot === 0) return ssRes === 0 ? 1 : 0;
  return 1 - ssRes / ssTot;
}

/** Solve A·c = b for a small square system, Gauss-Jordan + partial pivoting.
 *  Returns null if singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M: number[][] = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    }
    if (Math.abs(M[piv]![col]!) < 1e-12) return null;
    const tmp = M[col]!;
    M[col] = M[piv]!;
    M[piv] = tmp;
    const pivVal = M[col]![col]!;
    for (let k = col; k <= n; k++) M[col]![k]! /= pivVal;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r]![col]!;
      for (let k = col; k <= n; k++) M[r]![k]! -= factor * M[col]![k]!;
    }
  }
  return M.map((row) => row[n]!);
}

/** Least-squares polynomial of the given degree via normal equations. */
function polyFit(points: readonly ClassroomPoint[], degree: number): number[] | null {
  const m = degree + 1;
  const A: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
  const bb: number[] = new Array(m).fill(0);
  for (const p of points) {
    const powers = [1];
    for (let k = 1; k < 2 * degree + 1; k++) powers.push(powers[k - 1]! * p.x);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) A[i]![j]! += powers[i + j]!;
      bb[i]! += powers[i]! * p.y;
    }
  }
  const c = solve(A, bb);
  return c ? c.reverse() : null; // highest power first
}

function fixed(n: number, dp = 2): string {
  const r = Number(n.toFixed(dp));
  return Object.is(r, -0) ? "0" : String(r);
}

function polyExpression(coeffs: readonly number[]): string {
  // coeffs highest-power first
  const deg = coeffs.length - 1;
  const parts: string[] = [];
  coeffs.forEach((c, i) => {
    const power = deg - i;
    const term =
      power === 0
        ? `${fixed(c)}`
        : power === 1
          ? `${fixed(c)}x`
          : `${fixed(c)}x^${power}`;
    parts.push(term);
  });
  let out = parts[0]!;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]!;
    if (p.startsWith("-")) out += ` - ${p.slice(1)}`;
    else out += ` + ${p}`;
  }
  return `f(x) = ${out}`;
}

// ── the fits ─────────────────────────────────────────────────────────────────

function fitPolynomial(family: ModelFamily, degree: number, points: readonly ClassroomPoint[]):
  | FitResult
  | FitFailure {
  if (distinctX(points) < degree + 1) {
    return { ok: false, family, reason: "Not enough usable points for this model" };
  }
  const coeffs = polyFit(points, degree);
  if (!coeffs || coeffs.some((c) => !Number.isFinite(c))) {
    return { ok: false, family, reason: "Could not fit this model to the points" };
  }
  const r2 = rSquared(points, (x) => predict(family, coeffs, x));
  return {
    ok: true,
    family,
    coefficients: coeffs,
    rSquared: r2,
    preciseExpression: polyExpression(coeffs),
  };
}

function fitConstant(points: readonly ClassroomPoint[]): FitResult {
  const a = points.reduce((s, p) => s + p.y, 0) / points.length;
  return {
    ok: true,
    family: "constant",
    coefficients: [a],
    rSquared: rSquared(points, () => a),
    preciseExpression: `f(x) = ${fixed(a)}`,
  };
}

/** Given a fixed h, y = a·b(x) + k is linear in (a, k). Returns [a, k, ssr]. */
function linearInBasis(
  points: readonly ClassroomPoint[],
  basis: (x: number) => number,
): [number, number, number] | null {
  let n = 0;
  let sb = 0;
  let sy = 0;
  let sbb = 0;
  let sby = 0;
  for (const p of points) {
    const b = basis(p.x);
    if (!Number.isFinite(b)) return null;
    n++;
    sb += b;
    sy += p.y;
    sbb += b * b;
    sby += b * p.y;
  }
  const det = n * sbb - sb * sb;
  if (Math.abs(det) < 1e-12) return null;
  const a = (n * sby - sb * sy) / det;
  const k = (sy - a * sb) / n;
  let ssr = 0;
  for (const p of points) ssr += (p.y - (a * basis(p.x) + k)) ** 2;
  return [a, k, ssr];
}

function fitAbs(points: readonly ClassroomPoint[]): FitResult | FitFailure {
  if (points.length < 3) {
    return { ok: false, family: "abs", reason: "Not enough usable points for this model" };
  }
  const xs = points.map((p) => p.x).sort((a, b) => a - b);
  const candidates = new Set<number>(xs);
  for (let i = 1; i < xs.length; i++) candidates.add((xs[i]! + xs[i - 1]!) / 2);

  let best: { h: number; a: number; k: number; ssr: number } | null = null;
  for (const h of candidates) {
    const r = linearInBasis(points, (x) => Math.abs(x - h));
    if (r && (!best || r[2] < best.ssr)) best = { h, a: r[0], k: r[1], ssr: r[2] };
  }
  if (!best) return { ok: false, family: "abs", reason: "Could not fit an absolute-value model" };
  const coeffs = [best.a, best.h, best.k];
  const r2 = rSquared(points, (x) => predict("abs", coeffs, x));
  return {
    ok: true,
    family: "abs",
    coefficients: coeffs,
    rSquared: r2,
    preciseExpression: `f(x) = ${fixed(best.a)}|x - ${fixed(best.h)}| + ${fixed(best.k)}`.replace(
      "+ -",
      "- ",
    ),
  };
}

function fitSqrt(points: readonly ClassroomPoint[]): FitResult | FitFailure {
  if (points.length < 3) {
    return { ok: false, family: "sqrt", reason: "Not enough usable points for this model" };
  }
  const minX = Math.min(...points.map((p) => p.x));
  let best: { h: number; a: number; k: number; ssr: number } | null = null;
  for (const off of [0, 0.25, 0.5, 1]) {
    const h = minX - off;
    const r = linearInBasis(points, (x) => Math.sqrt(x - h));
    if (r && Number.isFinite(r[0]) && (!best || r[2] < best.ssr)) {
      best = { h, a: r[0], k: r[1], ssr: r[2] };
    }
  }
  if (!best) return { ok: false, family: "sqrt", reason: "This point set does not support a square-root fit" };
  const coeffs = [best.a, best.h, best.k];
  const r2 = rSquared(points, (x) => predict("sqrt", coeffs, x));
  if (r2 < 0.9) {
    return { ok: false, family: "sqrt", reason: "This point set does not support a square-root fit" };
  }
  return {
    ok: true,
    family: "sqrt",
    coefficients: coeffs,
    rSquared: r2,
    preciseExpression: `f(x) = ${fixed(best.a)}√(x - ${fixed(best.h)}) + ${fixed(best.k)}`.replace(
      "+ -",
      "- ",
    ),
  };
}

function fitExp(points: readonly ClassroomPoint[]): FitResult | FitFailure {
  if (points.length < 3) {
    return { ok: false, family: "exp", reason: "Not enough usable points for this model" };
  }
  const ys = points.map((p) => p.y);
  const allPos = ys.every((y) => y > 1e-9);
  const allNeg = ys.every((y) => y < -1e-9);
  if (!allPos && !allNeg) {
    return { ok: false, family: "exp", reason: "This point set does not support an exponential fit" };
  }
  const sign = allPos ? 1 : -1;
  // ln(|y|) = ln(|a|) + b x  -> OLS
  let n = 0;
  let sx = 0;
  let sl = 0;
  let sxx = 0;
  let sxl = 0;
  for (const p of points) {
    const l = Math.log(Math.abs(p.y));
    n++;
    sx += p.x;
    sl += l;
    sxx += p.x * p.x;
    sxl += p.x * l;
  }
  const det = n * sxx - sx * sx;
  if (Math.abs(det) < 1e-12) {
    return { ok: false, family: "exp", reason: "This point set does not support an exponential fit" };
  }
  const b = (n * sxl - sx * sl) / det;
  const lnA = (sl - b * sx) / n;
  const a = sign * Math.exp(lnA);
  if (Math.abs(b) < 0.05) {
    return { ok: false, family: "exp", reason: "This point set does not support an exponential fit" };
  }
  const coeffs = [a, b];
  const r2 = rSquared(points, (x) => predict("exp", coeffs, x));
  if (r2 < 0.9) {
    return { ok: false, family: "exp", reason: "This point set does not support an exponential fit" };
  }
  return {
    ok: true,
    family: "exp",
    coefficients: coeffs,
    rSquared: r2,
    preciseExpression: `f(x) = ${fixed(a)}e^(${fixed(b)}x)`,
  };
}

export function fitModel(
  family: ModelFamily,
  points: readonly ClassroomPoint[],
): FitResult | FitFailure {
  if (points.length === 0) {
    return { ok: false, family, reason: "No points to fit" };
  }
  switch (family) {
    case "constant":
      return fitConstant(points);
    case "linear":
      return fitPolynomial("linear", 1, points);
    case "quadratic":
      return fitPolynomial("quadratic", 2, points);
    case "cubic":
      return fitPolynomial("cubic", 3, points);
    case "abs":
      return fitAbs(points);
    case "sqrt":
      return fitSqrt(points);
    case "exp":
      return fitExp(points);
  }
}
