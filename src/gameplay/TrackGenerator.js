// Générateur procédural de piste, déterministe (graine) et garantissant
// toujours au moins une solution. Il produit :
//  - des entités (trains, rampes, barrières, pièces, bonus) ;
//  - des zones de décor (tunnels, ponts, gares) ;
//  - un « chemin garanti » (waypoints) qui prouve la faisabilité et sert
//    au pilote automatique des tests.
// Module pur : aucune dépendance au rendu.
import { RNG } from './rng.js';
import {
  COIN, DEFAULT_SPEED, JETPACK, LANES, PLAYER, POWERUP_TYPES, RAMP, TRAIN,
  jumpVelocity, speedAt,
} from './constants.js';
import { trainEffectiveLength, trainFront } from './obstacles.js';

export const JUMP_LEAD = 0.27; // s : le pilote saute ~0.27 s avant la barrière
export const ROLL_LEAD = 0.16;
export const MAX_LOOKAHEAD = 260; // le monde est généré jusqu'à joueur + 260 m
const MOVING_K = 0.65; // vitesse d'un train mobile = 0.65 × vitesse du joueur

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class TrackGenerator {
  constructor(opts = {}) {
    this.seed = opts.seed ?? 1;
    this.rng = new RNG(this.seed);
    this.speedProfile = opts.speedProfile || DEFAULT_SPEED;
    this.powerups = opts.powerups || POWERUP_TYPES;
    this.density = opts.density ?? 1; // multiplicateur de difficulté (versions / modes)
    this.trainVariants = opts.trainVariants || ['urban', 'modern', 'freight'];
    this.features = Object.assign({ movingTrains: true, plateaus: true, tunnels: true, bridges: true, stations: true }, opts.features || {});
    this.reset();
  }

  reset() {
    this.rng = new RNG(this.seed);
    this.cursor = 0;
    this.lane = 0;
    this.nextId = 1;
    this.entities = [];
    this.zones = [];
    this.path = [];
    this.spawned = [];
    this.removed = [];
    this.laneEnd = { '-1': -1e9, 0: -1e9, 1: -1e9 }; // fin de la dernière entité solide par voie
    this.reservedUntil = { '-1': -1e9, 0: -1e9, 1: -1e9 }; // couloirs de trains mobiles (pas d'objet)
    this.pathForbidden = []; // [{lane, s0, s1}]
    this.nextPowerupAt = 260 + this.rng.range(0, 120);
    this.nextZoneAt = 300 + this.rng.range(0, 200);
    this.recentBlocks = [];
    this.stats = { blocks: {} };
    // Départ : ligne droite avec quelques pièces.
    this.addPath(0, 70, 0, 'none');
    this.coinLine(0, 22, 62, COIN.groundY);
    this.cursor = 80;
  }

  v(s) {
    return speedAt(s, this.speedProfile);
  }
  difficulty(s) {
    return clamp((s / 2600) * this.density, 0, 1);
  }

  // ---- utilitaires d'émission -------------------------------------------------
  emit(e) {
    e.id = this.nextId++;
    this.entities.push(e);
    this.spawned.push(e);
    if (e.kind === 'train' || e.kind === 'barrier' || e.kind === 'ramp') {
      const end = e.kind === 'barrier' ? e.s + 0.2 : e.s + e.length;
      this.laneEnd[e.lane] = Math.max(this.laneEnd[e.lane], end);
    }
    return e;
  }
  addPath(s, s1, lane, action, extra = {}) {
    this.path.push({ s, s1, lane, action, ...extra });
  }
  coin(lane, s, y) {
    return this.emit({ kind: 'coin', lane, s, y, collected: false });
  }
  coinLine(lane, s0, s1, y) {
    for (let s = s0; s <= s1 + 1e-6; s += COIN.spacing) this.coin(lane, s, typeof y === 'function' ? y(s) : y);
  }
  coinArc(lane, sBarrier) {
    const v = this.v(sBarrier);
    const v0 = jumpVelocity(PLAYER.jumpHeight);
    const sJ = sBarrier - v * JUMP_LEAD;
    const airtime = (2 * v0) / PLAYER.gravity;
    const n = Math.max(4, Math.floor((v * airtime) / COIN.spacing));
    for (let i = 1; i < n; i++) {
      const t = (i / n) * airtime;
      this.coin(lane, sJ + v * t, COIN.groundY + v0 * t - 0.5 * PLAYER.gravity * t * t);
    }
  }
  laneFree(lane, s) {
    return s > this.reservedUntil[lane] && s > this.laneEnd[lane] + 1;
  }
  pathAllowed(lane, s0, s1) {
    for (const f of this.pathForbidden) if (f.lane === lane && s1 > f.s0 && s0 < f.s1) return false;
    return true;
  }
  laneChangeDistance(s, delta) {
    return this.v(s) * (0.23 * Math.abs(delta) + 0.32);
  }
  // Déplace le chemin vers `target` (une voie à la fois) en insérant la
  // distance nécessaire. Retourne false si impossible.
  movePathTo(target) {
    if (target === this.lane) return true;
    const step = Math.sign(target - this.lane);
    while (this.lane !== target) {
      const next = this.lane + step;
      const d = this.laneChangeDistance(this.cursor, 1);
      const s0 = this.cursor;
      const s1 = this.cursor + d;
      if (!this.laneFree(next, s0) || !this.pathAllowed(next, s0, s1 + 40)) return false;
      this.cursor = s1;
      this.lane = next;
    }
    return true;
  }
  otherLanes(exclude) {
    return LANES.filter((l) => l !== exclude);
  }
  trainVariant() {
    return this.rng.pick(this.trainVariants);
  }

  // ---- génération -----------------------------------------------------------
  generateUntil(sTarget) {
    let guard = 0;
    while (this.cursor < sTarget && guard++ < 200) this.nextBlock();
  }

  nextBlock() {
    const s = this.cursor;
    const d = this.difficulty(s);
    const recent = this.recentBlocks.slice(-2);
    const options = [
      ['coins', s < 200 ? 3 : 1.2 - d * 0.6],
      ['barriers', 2.2 + d],
      ['trains', s > 140 ? 2 + d : 0],
      ['plateau', this.features.plateaus && s > 320 ? 1.4 + d : 0],
      ['moving', this.features.movingTrains && s > 650 ? 0.9 + d * 1.6 : 0],
      ['mixed', s > 900 ? 1 + d * 1.5 : 0],
    ].map(([k, w]) => [k, recent.length === 2 && recent[0] === k && recent[1] === k ? 0 : w]);
    const kind = this.rng.weighted(options);
    const before = this.cursor;
    let ok = false;
    switch (kind) {
      case 'coins': ok = this.blockCoins(); break;
      case 'barriers': ok = this.blockBarriers(); break;
      case 'trains': ok = this.blockTrains(false); break;
      case 'plateau': ok = this.blockPlateau(); break;
      case 'moving': ok = this.blockMoving(); break;
      case 'mixed': ok = this.blockTrains(true); break;
    }
    if (!ok) {
      this.cursor = Math.max(this.cursor, before);
      this.blockCoins();
    }
    this.recentBlocks.push(kind);
    if (this.recentBlocks.length > 6) this.recentBlocks.shift();
    this.stats.blocks[kind] = (this.stats.blocks[kind] || 0) + 1;
    this.maybeZone(before, this.cursor);
  }

  maybeZone(s0, s1) {
    if (s1 < this.nextZoneAt) return;
    const types = [];
    if (this.features.tunnels) types.push(['tunnel', 3]);
    if (this.features.bridges) types.push(['bridge', 2]);
    if (this.features.stations) types.push(['station', 1.5]);
    if (!types.length) return;
    const type = this.rng.weighted(types);
    const start = Math.max(s0, this.nextZoneAt);
    const len = type === 'tunnel' ? this.rng.range(70, 150) : type === 'bridge' ? this.rng.range(60, 120) : this.rng.range(50, 70);
    this.zones.push({ type, s0: start, s1: start + len, id: this.nextId++ });
    this.nextZoneAt = start + len + this.rng.range(220, 520);
  }

  maybePowerup(lane, s) {
    if (s < this.nextPowerupAt || !this.powerups.length) return false;
    const type = this.rng.pick(this.powerups);
    this.emit({ kind: 'powerup', type, lane, s, y: COIN.groundY, collected: false });
    this.nextPowerupAt = s + this.rng.range(330, 620);
    return true;
  }

  blockCoins() {
    const s0 = this.cursor;
    const v = this.v(s0);
    const len = v * this.rng.range(1.6, 2.6);
    // Petit zigzag éventuel
    if (this.rng.chance(0.35)) {
      const target = clamp(this.lane + this.rng.pick([-1, 1]), -1, 1);
      this.movePathTo(target);
    }
    const a = this.cursor;
    const b = a + len;
    this.addPath(a, b, this.lane, 'none');
    const hasPower = this.maybePowerup(this.lane, a + len * 0.5);
    this.coinLine(this.lane, a + 4, hasPower ? a + len * 0.5 - 4 : b - 4, COIN.groundY);
    if (hasPower) this.coinLine(this.lane, a + len * 0.5 + 4, b - 4, COIN.groundY);
    this.cursor = b + 2;
    return true;
  }

  blockBarriers() {
    const d = this.difficulty(this.cursor);
    const rows = this.rng.int(2, 3 + Math.round(d * 2));
    for (let r = 0; r < rows; r++) {
      const v = this.v(this.cursor);
      // décalage éventuel du chemin entre deux rangées
      if (r > 0 && this.rng.chance(0.45)) {
        const target = clamp(this.lane + this.rng.pick([-1, 1]), -1, 1);
        this.movePathTo(target);
      }
      const gap = v * this.rng.range(0.95, 1.35) * (1.15 - d * 0.25);
      const sRow = this.cursor + gap;
      const pathAction = this.rng.weighted([['none', 0.8 - d * 0.4], ['jump', 1], ['roll', 1]]);
      // Voie du chemin
      if (!this.laneFree(this.lane, sRow - 6)) return r > 0;
      if (pathAction === 'jump') {
        this.emit({ kind: 'barrier', type: 'low', lane: this.lane, s: sRow });
        this.coinArc(this.lane, sRow);
      } else if (pathAction === 'roll') {
        this.emit({ kind: 'barrier', type: 'high', lane: this.lane, s: sRow });
        this.coinLine(this.lane, sRow - 6, sRow + 6, COIN.rollY);
      } else {
        this.coinLine(this.lane, sRow - 6, sRow + 6, COIN.groundY);
      }
      this.addPath(this.cursor, sRow + 1, this.lane, pathAction, { at: sRow });
      // Autres voies : obstacles aléatoires, jamais dans un couloir de train mobile
      let blockedOthers = 0;
      for (const l of this.otherLanes(this.lane)) {
        if (!this.laneFree(l, sRow - 6)) continue;
        if (this.rng.chance(0.45 + d * 0.35)) {
          this.emit({ kind: 'barrier', type: this.rng.chance(0.5) ? 'low' : 'high', lane: l, s: sRow });
          blockedOthers++;
        }
      }
      if (blockedOthers === 0 && pathAction === 'none' && this.rng.chance(0.6)) {
        const l = this.rng.pick(this.otherLanes(this.lane));
        if (this.laneFree(l, sRow - 6)) this.emit({ kind: 'barrier', type: this.rng.chance(0.5) ? 'low' : 'high', lane: l, s: sRow });
      }
      this.cursor = sRow + 1.5;
    }
    this.cursor += this.v(this.cursor) * 0.4;
    return true;
  }

  trainLength(cars) {
    return cars * TRAIN.carLength + (cars - 1) * TRAIN.gap;
  }

  // Bloc de trains immobiles. `mixed` ajoute des barrières dans la voie libre.
  blockTrains(mixed) {
    const d = this.difficulty(this.cursor);
    const useRamp = this.features.plateaus && this.rng.chance(0.3);
    // voie libre (ou à rampe) = chemin ; on peut la déplacer d'abord
    const candidates = LANES.filter((l) => this.pathAllowed(l, this.cursor, this.cursor + 80));
    if (!candidates.length) return false;
    let target = this.rng.pick(candidates);
    if (Math.abs(target - this.lane) > 1) target = this.lane + Math.sign(target - this.lane);
    if (!this.movePathTo(target)) return false;
    const v = this.v(this.cursor);
    const start = this.cursor + v * 0.6;
    const cars = this.rng.int(1, d > 0.4 ? 3 : 2);
    const len = this.trainLength(cars);
    let end = start + len;
    let placed = 0;
    for (const l of this.otherLanes(this.lane)) {
      if (!this.laneFree(l, start - 2)) continue;
      if (placed === 0 || this.rng.chance(0.55 + d * 0.3)) {
        const off = this.rng.range(-4, 8);
        const c = Math.max(1, cars + this.rng.int(-1, 1));
        const L = this.trainLength(c);
        this.emit({ kind: 'train', lane: l, s: start + off, length: L, cars: c, moving: false, k: 0, variant: this.trainVariant() });
        end = Math.max(end, start + off + L);
        placed++;
      }
    }
    if (!placed) return false;
    if (useRamp) {
      this.emit({ kind: 'ramp', lane: this.lane, s: start, length: RAMP.length });
      const ts = start + RAMP.length;
      this.emit({ kind: 'train', lane: this.lane, s: ts, length: len, cars, moving: false, k: 0, variant: this.trainVariant() });
      this.coinLine(this.lane, start + 1, start + RAMP.length - 0.5, (s) => (TRAIN.height * (s - start)) / RAMP.length + COIN.groundY);
      this.coinLine(this.lane, ts + 1, ts + len - 2, TRAIN.height + COIN.groundY);
      this.maybePowerupOnTop(this.lane, ts + len * 0.5);
      end = Math.max(end, ts + len);
      this.addPath(this.cursor, end, this.lane, 'none', { platform: true });
      this.cursor = end + v * 1.15;
      return true;
    }
    // voie libre, éventuellement avec des barrières (mode « mixed »)
    this.addPath(this.cursor, start, this.lane, 'none');
    let s = start + v * 0.35;
    const barrierCount = mixed ? this.rng.int(1, Math.max(1, Math.floor(len / (v * 1.1)))) : 0;
    let lastS = this.cursor;
    for (let i = 0; i < barrierCount; i++) {
      const bs = s + v * this.rng.range(0.1, 0.4);
      if (bs > end - 4) break;
      const type = this.rng.chance(0.5) ? 'low' : 'high';
      this.emit({ kind: 'barrier', type, lane: this.lane, s: bs });
      if (type === 'low') this.coinArc(this.lane, bs);
      else this.coinLine(this.lane, bs - 4, bs + 4, COIN.rollY);
      this.addPath(lastS, bs + 1, this.lane, type === 'low' ? 'jump' : 'roll', { at: bs });
      lastS = bs + 1;
      s = bs + v * 1.05;
    }
    if (!mixed) this.coinLine(this.lane, start + 2, end - 2, COIN.groundY);
    this.addPath(lastS, end + 1, this.lane, 'none');
    this.cursor = end + v * 0.45;
    return true;
  }

  maybePowerupOnTop(lane, s) {
    if (s < this.nextPowerupAt || !this.powerups.length) return;
    const type = this.rng.pick(this.powerups.filter((p) => p !== 'jetpack').length ? this.powerups.filter((p) => p !== 'jetpack') : this.powerups);
    this.emit({ kind: 'powerup', type, lane, s, y: TRAIN.height + COIN.groundY, collected: false });
    this.nextPowerupAt = s + this.rng.range(330, 620);
  }

  // Grand plateau : rampe + trains côte à côte, on court sur les toits.
  blockPlateau() {
    const candidates = LANES.filter((l) => this.laneFree(l, this.cursor) && this.pathAllowed(l, this.cursor, this.cursor + 120));
    if (candidates.length < 2) return false;
    let target = this.rng.pick(candidates);
    if (Math.abs(target - this.lane) > 1) target = this.lane + Math.sign(target - this.lane);
    if (!this.movePathTo(target)) return false;
    const v = this.v(this.cursor);
    const start = this.cursor + v * 0.5;
    const cars = this.rng.int(2, 3);
    const len = this.trainLength(cars);
    const ts = start + RAMP.length;
    this.emit({ kind: 'ramp', lane: this.lane, s: start, length: RAMP.length });
    this.emit({ kind: 'train', lane: this.lane, s: ts, length: len, cars, moving: false, k: 0, variant: this.trainVariant() });
    let end = ts + len;
    const tops = [];
    for (const l of this.otherLanes(this.lane)) {
      if (!this.laneFree(l, start - 2)) continue;
      if (this.rng.chance(0.75)) {
        const off = this.rng.range(-3, 3);
        this.emit({ kind: 'train', lane: l, s: ts + off, length: len, cars, moving: false, k: 0, variant: this.trainVariant() });
        end = Math.max(end, ts + off + len);
        if (Math.abs(l - this.lane) === 1) tops.push({ lane: l, s0: ts + off, s1: ts + off + len });
      }
    }
    this.coinLine(this.lane, start + 1, start + RAMP.length - 0.5, (s) => (TRAIN.height * (s - start)) / RAMP.length + COIN.groundY);
    // Le chemin peut changer de toit à mi-parcours si un toit adjacent couvre toute la longueur
    let pathLane = this.lane;
    const mid = ts + len * 0.45;
    const alt = tops.length ? tops[0] : null;
    if (alt && alt.s0 < mid - 4 && this.rng.chance(0.5)) {
      this.coinLine(pathLane, ts + 1, mid - 2, TRAIN.height + COIN.groundY);
      this.addPath(this.cursor, mid, pathLane, 'none', { platform: true });
      pathLane = alt.lane;
      this.coinLine(pathLane, mid + v * 0.4, alt.s1 - 2, TRAIN.height + COIN.groundY);
      this.addPath(mid, end, pathLane, 'none', { platform: true });
    } else {
      this.coinLine(pathLane, ts + 1, ts + len - 2, TRAIN.height + COIN.groundY);
      this.addPath(this.cursor, end, pathLane, 'none', { platform: true });
    }
    this.maybePowerupOnTop(pathLane, ts + len * 0.7);
    this.lane = pathLane;
    this.cursor = end + v * 1.2;
    return true;
  }

  // Train mobile qui vient en sens inverse dans une voie non empruntée par le chemin.
  blockMoving() {
    const v = this.v(this.cursor);
    const sm = this.cursor + v * 0.9;
    const lanes = this.otherLanes(this.lane).filter((l) => this.laneEnd[l] < sm - 28 && this.reservedUntil[l] < sm - 28);
    if (!lanes.length) return false;
    const m = this.rng.pick(lanes);
    const cars = this.rng.int(1, 3);
    const L = this.trainLength(cars);
    const train = this.emit({ kind: 'train', lane: m, s: sm, length: L, cars, moving: true, k: MOVING_K, variant: this.trainVariant() });
    const eff = trainEffectiveLength(train);
    this.reservedUntil[m] = sm + MOVING_K * MAX_LOOKAHEAD + L + 12;
    this.pathForbidden.push({ lane: m, s0: sm - v * 0.6, s1: sm + eff + 2 });
    // la troisième voie peut recevoir un train immobile ou des barrières
    const third = LANES.find((l) => l !== m && l !== this.lane);
    let end = sm + eff;
    if (third !== undefined && this.laneFree(third, sm - 4) && this.rng.chance(0.6)) {
      const c = this.rng.int(1, 2);
      const L2 = this.trainLength(c);
      this.emit({ kind: 'train', lane: third, s: sm + this.rng.range(-4, 6), length: L2, cars: c, moving: false, k: 0, variant: this.trainVariant() });
      end = Math.max(end, sm + 6 + L2);
    }
    this.addPath(this.cursor, end + 1, this.lane, 'none');
    this.coinLine(this.lane, this.cursor + 3, end - 2, COIN.groundY);
    this.cursor = end + v * 0.5;
    // élaguer les interdictions périmées
    this.pathForbidden = this.pathForbidden.filter((f) => f.s1 > this.cursor - 50);
    return true;
  }

  // Pièces dans le ciel pendant le jetpack (appelé par le système de bonus).
  addSkyCoins(s0, s1) {
    const out = [];
    let lane = this.rng.pick(LANES);
    let s = s0;
    while (s < s1) {
      const segLen = this.rng.range(18, 34);
      for (let t = s; t < Math.min(s1, s + segLen); t += COIN.spacing) out.push(this.coin(lane, t, JETPACK.altitude + 0.85));
      s += segLen + 5;
      lane = clamp(lane + this.rng.pick([-1, 1]), -1, 1);
    }
    return out;
  }

  // Retire ce qui est derrière le joueur (sp = position du joueur).
  prune(sp) {
    const behind = sp - 30;
    const keep = [];
    for (const e of this.entities) {
      let end;
      if (e.kind === 'train') end = trainFront(e, sp) + e.length;
      else if (e.kind === 'ramp') end = e.s + e.length;
      else end = e.s;
      if (end < behind) this.removed.push(e);
      else keep.push(e);
    }
    this.entities = keep;
    // personne ne consomme ces listes en jeu : on les vide pour ne pas accumuler
    this.spawned.length = 0;
    this.removed.length = 0;
    this.zones = this.zones.filter((z) => z.s1 > behind - 200);
    this.path = this.path.filter((p) => p.s1 > behind + 10);
  }

  drainEvents() {
    const spawned = this.spawned;
    const removed = this.removed;
    this.spawned = [];
    this.removed = [];
    return { spawned, removed };
  }
}
