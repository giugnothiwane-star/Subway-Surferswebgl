// Constantes de gameplay partagées (unités : mètres, secondes).
// Ce module est volontairement pur (aucune dépendance à Three.js) afin
// d'être testable avec `node --test`.

export const LANE_WIDTH = 2.5;
export const LANES = [-1, 0, 1];
export const laneX = (lane) => lane * LANE_WIDTH;

// Pas de simulation fixe : indépendant du nombre d'images par seconde.
export const SIM_DT = 1 / 120;
export const MAX_FRAME_DT = 0.1; // au-delà, on ralentit plutôt que d'exploser le nombre de pas

export const PLAYER = {
  halfWidth: 0.34,
  halfDepth: 0.3,
  height: 1.75,
  rollHeight: 0.85,
  laneSpeed: 17, // m/s minimum pendant un changement de voie
  laneSmoothing: 20, // facteur exponentiel
  gravity: 38,
  jumpHeight: 2.1,
  superJumpHeight: 4.3,
  rollDuration: 0.56,
  fastDropSpeed: -24,
  stepUp: 0.45, // marche franchissable automatiquement (rampes)
  stumbleWindow: 5, // deux trébuchements dans cette fenêtre = fin de partie
  invulnAfterHit: 1.2,
};

export const TRAIN = {
  width: 2.3,
  height: 3.0,
  carLength: 14,
  gap: 0.6,
};

export const RAMP = { length: 7, width: 2.3 };

export const BARRIER = {
  low: { width: 2.0, depth: 0.35, y0: 0, y1: 1.0 },
  high: { width: 2.2, depth: 0.35, y0: 1.05, y1: 2.6 },
};

export const COIN = {
  spacing: 2.1,
  groundY: 1.0,
  rollY: 0.55,
  collectRadiusXZ: 0.95,
  collectPadY: 0.45,
  value: 1,
};

export const JETPACK = { altitude: 5.2, riseTime: 0.9, duration: 7.5 };

export const POWERUP_TYPES = ['magnet', 'jetpack', 'multiplier', 'sneakers', 'shield'];

export const POWERUP_DURATION = {
  magnet: 10,
  jetpack: JETPACK.duration,
  multiplier: 12,
  sneakers: 10,
  shield: 9,
  hoverboard: 30,
};

export const MAGNET_RANGE = { ahead: 26, behind: 2, lateral: 4.2 };

// Vitesse de course en fonction de la distance parcourue (déterministe,
// ce qui permet au générateur d'adapter les espacements à la vitesse).
export function speedAt(s, profile = DEFAULT_SPEED) {
  const t = 1 - Math.exp(-Math.max(0, s) / profile.rampDistance);
  return profile.v0 + (profile.vMax - profile.v0) * t;
}

export const DEFAULT_SPEED = { v0: 14, vMax: 30, rampDistance: 3200 };
// Entraînement : vitesse lente et constante.
export const TRAINING_SPEED = { v0: 11, vMax: 11, rampDistance: 3200 };
// Floor is Lava : temps maximal au sol (s) avant de brûler ; refroidissement en l'air / sur un toit.
export const LAVA = { burnTime: 1.1, coolRate: 1.6, grace: 2.5, safeHeight: 0.3 };

export function jumpVelocity(height, gravity = PLAYER.gravity) {
  return Math.sqrt(2 * gravity * height);
}
