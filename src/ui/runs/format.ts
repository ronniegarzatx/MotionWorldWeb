/** Small display helpers shared by the Runs views. */

export function formatSavedAt(epochMs: number): string {
  const d = new Date(epochMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m} min ${s} s`;
}

export function interruptedLabel(stopReason: string | null): string | null {
  switch (stopReason) {
    case "navigation":
      return "interrupted — left the tool";
    case "device_lost":
      return "interrupted — sensor disconnected";
    case "error":
      return "interrupted — sensor error";
    default:
      return null;
  }
}
