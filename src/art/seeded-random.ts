/**
 * A tiny deterministic PRNG (mulberry32). Art Party effects must draw all of
 * their randomness — palette choice, geometry variation, per-frame jitter —
 * from an instance of this, never `Math.random()`, so a given seed
 * reproduces an effect's entire visual life (design spec §10).
 */
export interface SeededRandom {
  /** Next value in [0, 1). */
  next(): number;
  /** A value in [min, max). */
  range(min: number, max: number): number;
  /** An integer in [minInclusive, maxExclusive). */
  int(minInclusive: number, maxExclusive: number): number;
  /** A uniformly chosen element of `items` (never empty). */
  pick<T>(items: readonly T[]): T;
}

export function createSeededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (minInclusive, maxExclusive) =>
      minInclusive + Math.floor(next() * (maxExclusive - minInclusive)),
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
  };
}
