/**
 * Per-target vertical offset (metres) for the current app session. Each target
 * keeps its own; switching away and back restores it. NOT persisted (no
 * IndexedDB) — one instance is built in the composition root and passed to the
 * Walk the Line view so it survives view remounts without module-global state.
 */
export class TargetOffsets {
  private readonly byId = new Map<string, number>();

  get(id: string): number {
    return this.byId.get(id) ?? 0;
  }

  set(id: string, meters: number): void {
    this.byId.set(id, meters);
  }

  reset(id: string): void {
    this.byId.delete(id);
  }
}
