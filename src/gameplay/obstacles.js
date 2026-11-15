// Volumes de collision des entités, indépendants du rendu.
// Repère : s = distance le long de la piste (croissante vers l'avant),
// x = latéral, y = hauteur. Le rendu utilise z = -s.
import { BARRIER, LANE_WIDTH, RAMP, TRAIN, laneX } from './constants.js';

// Position d'un train à l'instant où le joueur est en `sp`.
// Les trains mobiles sont décrits dans « l'espace de rencontre » : leur avant
// se trouve exactement en `e.s` quand le joueur y arrive. Leur position est une
// fonction continue de la progression du joueur, ce qui garantit que le
// générateur raisonne sur des intervalles exacts (occupation effective =
// length / (1 + k)).
export function trainFront(e, sp) {
  return e.moving ? e.s + e.k * (e.s - sp) : e.s;
}

export function trainEffectiveLength(e) {
  return e.moving ? e.length / (1 + e.k) : e.length;
}

export function entityBox(e, sp, out = {}) {
  const x = laneX(e.lane);
  switch (e.kind) {
    case 'train': {
      const f = trainFront(e, sp);
      out.s0 = f;
      out.s1 = f + e.length;
      out.x0 = x - TRAIN.width / 2;
      out.x1 = x + TRAIN.width / 2;
      out.y0 = 0;
      out.y1 = TRAIN.height;
      out.platform = true;
      return out;
    }
    case 'barrier': {
      const b = BARRIER[e.type];
      out.s0 = e.s - b.depth / 2;
      out.s1 = e.s + b.depth / 2;
      out.x0 = x - b.width / 2;
      out.x1 = x + b.width / 2;
      out.y0 = b.y0;
      out.y1 = b.y1;
      out.platform = false;
      return out;
    }
    case 'ramp': {
      out.s0 = e.s;
      out.s1 = e.s + e.length;
      out.x0 = x - RAMP.width / 2;
      out.x1 = x + RAMP.width / 2;
      out.y0 = 0;
      out.y1 = TRAIN.height;
      out.platform = true;
      return out;
    }
    default:
      return null;
  }
}

// Hauteur de la surface supérieure d'une plateforme à la distance s (ou -Infinity).
export function platformTop(e, s, sp) {
  if (e.kind === 'train') {
    const f = trainFront(e, sp);
    return s >= f && s <= f + e.length ? TRAIN.height : -Infinity;
  }
  if (e.kind === 'ramp') {
    if (s < e.s || s > e.s + e.length) return -Infinity;
    return (TRAIN.height * (s - e.s)) / e.length;
  }
  return -Infinity;
}

// Hauteur du « sol » sous le centre du joueur (rails = 0).
export function groundHeight(entities, x, s, sp) {
  let g = 0;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if ((e.kind !== 'train' && e.kind !== 'ramp') || e.ghost) continue;
    const half = (e.kind === 'train' ? TRAIN.width : RAMP.width) / 2;
    if (Math.abs(x - laneX(e.lane)) > half) continue;
    const top = platformTop(e, s, sp);
    if (top > g) g = top;
  }
  return g;
}

// Hauteur « solide » d'une rampe sous une position (pour les collisions latérales).
export function rampSolidTop(e, s) {
  if (s < e.s || s > e.s + e.length) return 0;
  return (TRAIN.height * (s - e.s)) / e.length;
}

export function laneOfX(x) {
  return Math.max(-1, Math.min(1, Math.round(x / LANE_WIDTH)));
}
