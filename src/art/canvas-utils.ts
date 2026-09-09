/** Small Canvas 2D drawing helpers shared by every effect family. */

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** "#rrggbb" -> "rgba(r, g, b, alpha)". */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha).toFixed(3)})`;
}

/**
 * Every effect must paint an opaque background across the full canvas every
 * frame — without it, the theme's own background (including the Kusama Dots
 * ambient pattern painted on <body>) would show through the canvas, which
 * must stay visually clean (design spec §7/§12).
 */
export function paintOpaqueBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fillStyle: string | CanvasGradient,
): void {
  ctx.fillStyle = fillStyle;
  ctx.fillRect(0, 0, width, height);
}
