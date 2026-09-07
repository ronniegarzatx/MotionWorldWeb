import { createEmitter } from "../sensor/emitter.js";
import type { Unsubscribe } from "../sensor/types.js";

export interface LogLine {
  readonly tMs: number;
  readonly wallClock: string; // "12:04:01"
  readonly message: string;
}

function clockString(epochMs: number): string {
  const d = new Date(epochMs);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Bounded, timestamped diagnostic log (spec §2, §11). Newest first. Capped so
 * the DOM never grows unbounded.
 */
export class DiagnosticLog {
  private lines: LogLine[] = [];
  private readonly changed = createEmitter<readonly LogLine[]>();

  constructor(
    private readonly max = 500,
    private readonly now: () => number = () => Date.now(),
  ) {}

  add(message: string): void {
    const t = this.now();
    this.lines.unshift({ tMs: t, wallClock: clockString(t), message });
    if (this.lines.length > this.max) this.lines.length = this.max;
    this.changed.emit(this.snapshot());
  }

  clear(): void {
    this.lines = [];
    this.changed.emit(this.snapshot());
  }

  snapshot(): readonly LogLine[] {
    return this.lines.slice();
  }

  toText(): string {
    return this.lines
      .slice()
      .reverse()
      .map((l) => `${l.wallClock} ${l.message}`)
      .join("\n");
  }

  subscribe(listener: (lines: readonly LogLine[]) => void): Unsubscribe {
    return this.changed.subscribe(listener);
  }
}
