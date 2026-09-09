import type { SeededRandom } from "./seeded-random.js";

export interface ArtPalette {
  readonly name: string;
  readonly colors: readonly string[]; // "#rrggbb", at least 3
}

/**
 * Rich, saturated palette families (design spec §35 / parent prompt §35).
 * These are used only inside the art canvas — the overlay/control chrome
 * around it still uses the app's ordinary semantic theme tokens.
 */
export const ART_PALETTES: readonly ArtPalette[] = [
  { name: "neon", colors: ["#ff2bd6", "#00f0ff", "#7cff2b", "#ffe600"] },
  { name: "warm", colors: ["#ff5e3a", "#ff9500", "#ffcc00", "#ff375f"] },
  { name: "cool", colors: ["#0a84ff", "#5ac8fa", "#30d5c8", "#64d2ff"] },
  { name: "rainbow", colors: ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#0a84ff", "#af52de"] },
  { name: "complementary", colors: ["#ff5c00", "#00a3ff", "#ffb27a", "#7ad4ff"] },
  { name: "kusama", colors: ["#d0342c", "#fffdf9", "#241c17"] },
  { name: "electric", colors: ["#00fff0", "#ff00e5", "#7000ff"] },
  { name: "sunset", colors: ["#ff7e5f", "#feb47b", "#6a3093", "#a044ff"] },
];

export function pickPalette(rng: SeededRandom): ArtPalette {
  return rng.pick(ART_PALETTES);
}

/** A color from the palette other than `exclude`, when one exists. */
export function pickOtherColor(rng: SeededRandom, palette: ArtPalette, exclude: string): string {
  const rest = palette.colors.filter((c) => c !== exclude);
  return rest.length > 0 ? rng.pick(rest) : palette.colors[0]!;
}
