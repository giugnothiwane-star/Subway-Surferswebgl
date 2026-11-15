// Simulation complète d'une course (pure, déterministe, pas fixe).
// Le rendu lit l'état ; aucune dépendance à Three.js.
import {
  COIN, JETPACK, LAVA, MAGNET_RANGE, MAX_FRAME_DT, PLAYER, SIM_DT, TRAIN, jumpVelocity, laneX, speedAt, DEFAULT_SPEED,
} from './constants.js';
import { entityBox, groundHeight, laneOfX, rampSolidTop } from './obstacles.js';
import { TrackGenerator, MAX_LOOKAHEAD } from './TrackGenerator.js';
import { PowerupSystem } from './PowerupSystem.js';

const overlap1 = (a0, a1, b0, b1) => a0 < b1 && a1 > b0;

export class Simulation {
  constructor(opts = {}) {
    this.opts = opts;
    this.speedProfile = opts.speedProfile || DEFAULT_SPEED;
    this.speedMult = opts.speedMult ?? 1;
    this.scoreMult = opts.scoreMult ?? 1;
    this.baseMultiplier = opts.baseMultiplier ?? 1;
    this.zen = !!opts.zen;
    this.invincible = !!opts.invincible; // option « Invincible » : aucun choc ne termine la partie
    this.lava = !!opts.lava; // mode « Floor is Lava »
    this.generator = new TrackGenerator({
      seed: opts.seed ?? 1,
      speedProfile: this.speedProfile,
      powerups: opts.powerups,
      density: opts.density ?? 1,
      trainVariants: opts.trainVariants,
      features: opts.features,
    });
    this.powerups = new PowerupSystem(opts.durations);
    this.events = [];
    this.inputs = [];
    this.accumulator = 0;
    this.reset();
  }

  reset() {
    this.generator.reset();
    this.powerups.reset();
    this.time = 0;
    this.s = 0;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.v = speedAt(0, this.speedProfile) * this.speedMult;
    this.targetLane = 0;
    this.prevLane = 0;
    this.onGround = true;
    this.groundTime = 0;
    this.airTime = 0;
    this.rollTime = 0;
    this.rollQueued = false;
    this.jumpBuffer = 0;
    this.invuln = 0;
    this.heat = 0; // chaleur de la lave (0 à 1)
    this.stumbles = [];
    this.alive = true;
    this.jet = 'off';
    this.jetT = 0;
    this.score = 0;
    this.coins = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.lastSide = 0;
    this.onPlatform = false;
    this.deathCause = null;
    this.lastCoinAt = 0; // chrono « pièce » : temps écoulé depuis la dernière pièce
    this.lastCoinGap = 0;
    this.longestNoCoin = 0;
    this.stats = { jumps: 0, rolls: 0, laneChanges: 0, powerups: 0, boards: 0, trainTops: 0, stumbles: 0, dodges: 0 };
    this.events.length = 0;
    this.inputs.length = 0;
    this.accumulator = 0;
    this.generator.generateUntil(MAX_LOOKAHEAD);
    this.prevState = this.snapshot();
  }

  snapshot() {
    return { s: this.s, x: this.x, y: this.y, h: this.height };
  }

  get height() {
    return this.rollTime > 0 ? PLAYER.rollHeight : PLAYER.height;
  }
  get lane() {
    return laneOfX(this.x);
  }
  get multiplier() {
    return this.baseMultiplier * (this.powerups.active('multiplier') ? 2 : 1);
  }
  get entities() {
    return this.generator.entities;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  input(action) {
    if (this.alive) this.inputs.push(action);
  }

  // Avance la simulation d'un temps réel `frameDt` en pas fixes.
  advance(frameDt) {
    this.accumulator += Math.min(frameDt, MAX_FRAME_DT);
    let steps = 0;
    while (this.accumulator >= SIM_DT && steps < 16) {
      this.step(SIM_DT);
      this.accumulator -= SIM_DT;
      steps++;
    }
    return steps;
  }

  applyInput(a) {
    const jetOn = this.jet === 'rise' || this.jet === 'fly';
    switch (a) {
      case 'left':
      case 'right': {
        const dir = a === 'left' ? -1 : 1;
        const t = this.targetLane + dir;
        if (t < -1 || t > 1) {
          this.emit('bump', { dir });
          return;
        }
        this.prevLane = this.targetLane;
        this.targetLane = t;
        this.lastSide = dir;
        this.stats.laneChanges++;
        this.emit('lane', { dir });
        return;
      }
      case 'jump': {
        if (jetOn) return;
        if (this.onGround || this.groundTime < 0.09) this.doJump();
        else this.jumpBuffer = 0.16;
        return;
      }
      case 'roll': {
        if (jetOn) return;
        if (this.onGround) this.startRoll();
        else {
          this.vy = Math.min(this.vy, PLAYER.fastDropSpeed);
          this.rollQueued = true;
        }
        return;
      }
      case 'board': {
        if (!this.powerups.active('hoverboard') && (this.opts.canUseBoard ? this.opts.canUseBoard() : true)) {
          this.powerups.activate('hoverboard');
          this.stats.boards++;
          this.emit('hoverStart');
        }
        return;
      }
    }
  }

  doJump() {
    const sneakers = this.powerups.active('sneakers');
    this.vy = jumpVelocity(sneakers ? PLAYER.superJumpHeight : PLAYER.jumpHeight);
    this.onGround = false;
    this.groundTime = 1;
    this.rollTime = 0;
    this.jumpBuffer = 0;
    this.stats.jumps++;
    this.emit(sneakers ? 'superJump' : 'jump');
  }

  startRoll() {
    this.rollTime = PLAYER.rollDuration;
    this.rollQueued = false;
    this.stats.rolls++;
    this.emit('roll');
  }

  solidsNear(out) {
    out.length = 0;
    const list = this.generator.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.ghost) continue;
      if (e.kind === 'train' || e.kind === 'ramp' || e.kind === 'barrier') out.push(e);
    }
    return out;
  }

  step(dt) {
    if (!this.alive) return;
    this.time += dt;
    const prev = this.prevState;
    prev.s = this.s; prev.x = this.x; prev.y = this.y; prev.h = this.height;

    for (const a of this.inputs) this.applyInput(a);
    this.inputs.length = 0;

    // Vitesse progressive (fonction de la distance => génération équitable)
    this.v = speedAt(this.s, this.speedProfile) * this.speedMult;
    this.s += this.v * dt;
    this.score += this.v * dt * this.multiplier * this.scoreMult * 0.5;

    // Latéral : interpolation temporelle (pas de téléportation)
    const tx = laneX(this.targetLane);
    const dx = tx - this.x;
    if (dx !== 0) {
      const stepX = Math.max(PLAYER.laneSpeed * dt, Math.abs(dx) * (1 - Math.exp(-PLAYER.laneSmoothing * dt)));
      this.x += Math.sign(dx) * Math.min(Math.abs(dx), stepX);
    }

    // Bonus
    const expired = this.powerups.update(dt);
    for (const t of expired) {
      if (t === 'jetpack') {
        this.jet = 'descend';
        this.vy = 0;
        this.invuln = Math.max(this.invuln, 1.6);
        this.emit('jetpackEnd');
      } else this.emit('powerupEnd', { power: t });
    }
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.rollTime > 0) this.rollTime = Math.max(0, this.rollTime - dt);
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

    // Vertical
    const solids = this.solidsNear(this._solids || (this._solids = []));
    const g = groundHeight(solids, this.x, this.s, this.s);
    if (this.jet === 'rise' || this.jet === 'fly') {
      this.jetT += dt;
      const target = JETPACK.altitude;
      if (this.jet === 'rise') {
        const k = Math.min(1, this.jetT / JETPACK.riseTime);
        this.y = this.y + (target - this.y) * Math.min(1, dt * 6) ;
        if (k >= 1) this.jet = 'fly';
      } else this.y += (target - this.y) * Math.min(1, dt * 8);
      this.vy = 0;
      this.onGround = false;
      this.rollTime = 0;
    } else if (this.onGround) {
      if (g <= this.y + PLAYER.stepUp && g >= this.y - 0.03) this.y = g;
      else if (g < this.y - 0.03) {
        this.onGround = false;
        this.vy = 0;
        this.groundTime = 0;
      }
    } else {
      const grav = this.jet === 'descend' ? PLAYER.gravity * 0.55 : PLAYER.gravity;
      this.vy -= grav * dt;
      this.y += this.vy * dt;
      this.airTime += dt;
      if (this.y <= g && prev.y >= g - PLAYER.stepUp) this.land(g);
      else if (this.y <= 0) this.land(0);
    }
    if (!this.onGround) this.groundTime += dt;
    else this.groundTime = 0;

    // Collisions avec les obstacles (test balayé : on compare l'état précédent)
    this.resolveCollisions(solids, prev);
    if (!this.alive) return;
    if (this.lava) this.updateLava(dt);
    if (!this.alive) return;
    this.onPlatform = this.onGround && this.y > 0.5;

    // Pièces et bonus
    this.collect(dt);

    // Génération / recyclage
    this.generator.generateUntil(this.s + MAX_LOOKAHEAD);
    if ((this._pruneTick = (this._pruneTick || 0) + 1) % 30 === 0) this.generator.prune(this.s);
  }

  // Floor is Lava : rester au sol chauffe, être en l'air ou sur un toit refroidit.
  // Hoverboard et jetpack protègent. Invincible / Zen : on rebondit hors de la lave.
  updateLava(dt) {
    const jet = this.jet === 'rise' || this.jet === 'fly';
    const onLava = this.onGround && this.y < LAVA.safeHeight && !jet && !this.powerups.active('hoverboard') && this.time > LAVA.grace;
    this.heat = onLava ? Math.min(1, this.heat + dt / LAVA.burnTime) : Math.max(0, this.heat - dt * LAVA.coolRate);
    if (this.heat < 1) return;
    this.heat = 0;
    if (this.zen || this.invincible || this.powerups.active('shield')) {
      if (this.powerups.active('shield') && !this.zen && !this.invincible) this.powerups.cancel('shield');
      this.vy = jumpVelocity(1.2);
      this.onGround = false;
      this.rollTime = 0;
      this.emit('lavaBounce');
      return;
    }
    this.alive = false;
    this.deathCause = 'lava';
    this.emit('crash', { cause: 'lava', kind: 'lava' });
  }

  land(g) {
    const fall = -this.vy;
    this.y = g;
    this.vy = 0;
    this.onGround = true;
    this.airTime = 0;
    if (this.jet === 'descend') this.jet = 'off';
    if (g > 0.5) this.stats.trainTops++;
    this.emit('land', { hard: fall > 14, height: g });
    if (this.rollQueued) this.startRoll();
    else if (this.jumpBuffer > 0) this.doJump();
  }

  resolveCollisions(solids, prev) {
    if (this.jet === 'rise' || this.jet === 'fly') return; // le jetpack survole tout
    const box = this._box || (this._box = {});
    const pbox = this._pbox || (this._pbox = {});
    const px0 = this.x - PLAYER.halfWidth, px1 = this.x + PLAYER.halfWidth;
    const ps0 = this.s - PLAYER.halfDepth, ps1 = this.s + PLAYER.halfDepth;
    const py0 = this.y, py1 = this.y + this.height;
    for (let i = 0; i < solids.length; i++) {
      const e = solids[i];
      entityBox(e, this.s, box);
      if (box.s1 < ps0 - 1 || box.s0 > ps1 + 1) continue;
      if (!overlap1(px0, px1, box.x0, box.x1) || !overlap1(ps0, ps1, box.s0, box.s1)) continue;
      if (e.kind === 'ramp') {
        // Le dessus est géré par le sol ; seul un contact latéral sous la pente compte.
        const top = rampSolidTop(e, this.s);
        if (py0 >= top - PLAYER.stepUp) continue;
        if (Math.abs(this.x - laneX(e.lane)) <= 1.15) continue;
        this.stumble(e);
        return;
      }
      if (!overlap1(py0, py1, box.y0, box.y1)) continue;
      entityBox(e, prev.s, pbox);
      const wasS = overlap1(prev.s - PLAYER.halfDepth, prev.s + PLAYER.halfDepth, pbox.s0, pbox.s1);
      const wasX = overlap1(prev.x - PLAYER.halfWidth, prev.x + PLAYER.halfWidth, pbox.x0, pbox.x1);
      const wasY = overlap1(prev.y, prev.y + prev.h, pbox.y0, pbox.y1);
      if (e.kind === 'train') {
        if (!wasY || this.y >= box.y1 - PLAYER.stepUp) {
          this.land(box.y1);
          continue;
        }
        if (wasS && !wasX) { this.stumble(e); if (!this.alive) return; continue; }
        // Choc de face : un train reste TOUJOURS solide. Si le choc est absorbé
        // (bouclier, hoverboard, Zen, invulnérabilité), on rebondit sur le toit
        // au lieu de traverser le wagon.
        if (this.hit(e, 'front', { ghost: false })) this.vault(box.y1);
      } else {
        if (wasS && !wasX) this.stumble(e);
        else this.hit(e, e.type === 'low' ? 'barrierLow' : 'barrierHigh');
      }
      if (!this.alive) return;
    }
  }

  stumble(e) {
    // Retour vers la voie précédente + secousse ; deux fois rapprochées = chute.
    this.targetLane = this.prevLane;
    this.x = Math.max(-2.5, Math.min(2.5, this.x - this.lastSide * 0.35));
    this.stats.stumbles++;
    this.stumbles = this.stumbles.filter((t) => this.time - t < PLAYER.stumbleWindow);
    this.stumbles.push(this.time);
    this.emit('stumble');
    if (this.stumbles.length >= 2) {
      this.stumbles.length = 0;
      this.hit(e, 'stumble');
    }
  }

  // Renvoie true si le choc est absorbé (le joueur reste en vie).
  // `ghost` : l'obstacle devient traversable (barrières brisées) ; jamais pour un train.
  hit(e, cause, { ghost = true } = {}) {
    if (this.invuln > 0) return true;
    let absorbed = null;
    if (this.powerups.active('shield')) { this.powerups.cancel('shield'); absorbed = 'shieldBreak'; }
    else if (this.powerups.active('hoverboard')) { this.powerups.cancel('hoverboard'); absorbed = 'hoverBreak'; }
    else if (this.zen || this.invincible) absorbed = 'zenHit';
    if (absorbed) {
      this.invuln = PLAYER.invulnAfterHit;
      if (ghost) e.ghost = true;
      this.emit(absorbed);
      return true;
    }
    this.alive = false;
    this.deathCause = cause;
    this.emit('crash', { cause, kind: e.kind });
    return false;
  }

  // Rebond sur le toit d'un train après un choc absorbé.
  vault(top) {
    this.y = top;
    this.vy = jumpVelocity(0.7);
    this.onGround = false;
    this.rollTime = 0;
    this.emit('vault', { height: top });
  }

  collect(dt) {
    const list = this.generator.entities;
    const magnet = this.powerups.active('magnet');
    const cy0 = this.y - COIN.collectPadY;
    const cy1 = this.y + this.height + COIN.collectPadY;
    const pyc = this.y + this.height * 0.55;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if ((e.kind !== 'coin' && e.kind !== 'powerup') || e.collected) continue;
      const ex = e.ax ?? laneX(e.lane);
      const es = e.as ?? e.s;
      const ey = e.ay ?? e.y;
      const ds = es - this.s;
      if (ds > MAGNET_RANGE.ahead + 2 || ds < -3) continue;
      if (e.kind === 'coin' && magnet && !e.attracted && ds < MAGNET_RANGE.ahead && ds > -MAGNET_RANGE.behind && Math.abs(ex - this.x) < MAGNET_RANGE.lateral) {
        e.attracted = true;
        e.ax = ex; e.as = es; e.ay = ey;
      }
      if (e.attracted) {
        // Aimantation : la pièce rejoint le joueur de façon fluide.
        const k = Math.min(1, dt * 11);
        e.as += (this.s + 0.2 - e.as) * k + this.v * dt * 0.35;
        e.ax += (this.x - e.ax) * k;
        e.ay += (pyc - e.ay) * k;
        const dd = Math.hypot(e.as - this.s, e.ax - this.x, e.ay - pyc);
        if (dd < 0.9) this.take(e);
        continue;
      }
      if (Math.abs(ds) <= COIN.collectRadiusXZ && Math.abs(ex - this.x) <= COIN.collectRadiusXZ && ey >= cy0 && ey <= cy1) this.take(e);
    }
  }

  take(e) {
    if (e.collected) return; // jamais compté deux fois
    e.collected = true;
    e.collectedAt = this.time;
    if (e.kind === 'coin') {
      this.lastCoinGap = this.time - this.lastCoinAt;
      this.longestNoCoin = Math.max(this.longestNoCoin, this.lastCoinGap);
      this.lastCoinAt = this.time;
      this.coins += COIN.value;
      this.combo++;
      this.comboTimer = 0.6;
      this.score += 5 * this.multiplier * this.scoreMult;
      this.emit('coin', { combo: this.combo, id: e.id });
    } else {
      this.stats.powerups++;
      this.activatePowerup(e.type);
      this.emit('powerup', { power: e.type, id: e.id });
    }
  }

  activatePowerup(type) {
    this.powerups.activate(type);
    if (type === 'jetpack') {
      this.jet = 'rise';
      this.jetT = 0;
      this.rollTime = 0;
      this.generator.addSkyCoins(this.s + this.v * 1.0, this.s + this.v * (this.powerups.durations.jetpack - 0.6));
      this.emit('jetpackStart');
    }
  }

  // Résumé pour l'interface et les tests.
  summary() {
    return {
      score: Math.floor(this.score),
      coins: this.coins,
      distance: Math.floor(this.s),
      time: this.time,
      longestNoCoin: Math.max(this.longestNoCoin, this.alive ? 0 : this.time - this.lastCoinAt),
      stats: { ...this.stats },
      seed: this.generator.seed,
      cause: this.deathCause,
    };
  }
}

export { TRAIN };
