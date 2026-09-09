import type { ArtEffectFactory } from "../art-types.js";
import { createColorWashEffect } from "./color-wash.js";
import { createConfettiPartyEffect } from "./confetti-party.js";
import { createNeonRingsEffect } from "./neon-rings.js";
import { createParticleBurstEffect } from "./particle-burst.js";
import { createRadialGeometryEffect } from "./radial-geometry.js";
import { createWaveFieldEffect } from "./wave-field.js";

/** The V1 effect roster, in a fixed order (design spec §11). */
export const EFFECT_FACTORIES: readonly ArtEffectFactory[] = [
  createColorWashEffect,
  createNeonRingsEffect,
  createParticleBurstEffect,
  createWaveFieldEffect,
  createRadialGeometryEffect,
  createConfettiPartyEffect,
];
