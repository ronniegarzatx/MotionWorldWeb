/**
 * A lightweight, non-destructive term-cleanup range for Sequence Lab — just
 * enough to drop a poor first/last detected event. 1-based inclusive indices
 * into the *full* detected series. Excluded events are never deleted; the view
 * shows them muted. This is deliberately NOT a general sequence-analysis-range
 * framework.
 */
export interface SequenceRange {
  readonly start: number;
  readonly end: number;
}

export function fullRange(count: number): SequenceRange {
  return count <= 0 ? { start: 1, end: 0 } : { start: 1, end: count };
}

export function clampRange(r: SequenceRange, count: number): SequenceRange {
  if (count <= 0) return { start: 1, end: 0 };
  let start = Math.round(r.start);
  let end = Math.round(r.end);
  start = Math.min(Math.max(1, start), count);
  end = Math.min(Math.max(1, end), count);
  if (start > end) end = start;
  return { start, end };
}

export function withStart(r: SequenceRange, count: number, n: number): SequenceRange {
  const end = clampRange(r, count).end;
  const start = Math.min(Math.max(1, Math.round(n)), Math.max(1, end));
  return clampRange({ start, end }, count);
}

export function withEnd(r: SequenceRange, count: number, n: number): SequenceRange {
  const start = clampRange(r, count).start;
  const end = Math.max(start, Math.min(Math.round(n), count));
  return clampRange({ start, end }, count);
}

export function includedIndices(r: SequenceRange): number[] {
  const out: number[] = [];
  for (let n = r.start; n <= r.end; n++) out.push(n);
  return out;
}

export interface IndexedItem<T> {
  readonly n: number;
  readonly item: T;
}

/** Partition a detected series into included / excluded, keeping order + n. */
export function applyRange<T>(
  events: readonly T[],
  r: SequenceRange,
): { included: IndexedItem<T>[]; excluded: IndexedItem<T>[] } {
  const included: IndexedItem<T>[] = [];
  const excluded: IndexedItem<T>[] = [];
  events.forEach((item, i) => {
    const n = i + 1;
    (n >= r.start && n <= r.end ? included : excluded).push({ n, item });
  });
  return { included, excluded };
}
