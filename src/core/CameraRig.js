// Caméra à la troisième personne : suivi lissé, ajustements saut / roulade,
// champ de vision dynamique, secousses atténuées, évitement des trains et des
// plafonds de tunnel, option « mouvements réduits ».
import * as THREE from 'three';
import { TRAIN } from '../gameplay/constants.js';
import { entityBox } from '../gameplay/obstacles.js';

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class CameraRig {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);
    this.pos = new THREE.Vector3(0, 3.4, 6);
    this.look = new THREE.Vector3(0, 1.2, -8);
    this.groundY = 0;
    this.shake = 0;
    this.reduced = false;
    this.aspect = 1;
    this.screenH = 800;
    this.mode = 'game';
    this.orbit = 0;
    this._box = {};
    this.roll = 0;
    this.blend = null; // transition menu -> course
    this.deathT = 0;
    this._from = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  }

  // Démarre une transition douce depuis la vue actuelle (menu) vers la course.
  beginTransition(duration = 0.75) {
    this._from.pos.copy(this.camera.position);
    this._from.look.copy(this.look);
    this.blend = { t: 0, d: this.reduced ? 0.4 : duration };
    this.deathT = 0;
    this.roll = 0;
  }

  setAspect(aspect, screenH = 800) {
    this.aspect = aspect;
    this.screenH = screenH;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  addShake(amount) {
    if (!this.reduced) this.shake = Math.min(1, this.shake + amount);
  }

  // Paramètres adaptés à l'écran : en portrait, on recule et on monte pour
  // garder les trois voies lisibles.
  framing() {
    const portrait = this.aspect < 0.8;
    return {
      dist: portrait ? 7.6 : 5.8,
      height: portrait ? 4.9 : 3.8,
      baseFov: portrait ? 60 : 58,
      lookAhead: portrait ? 15 : 14,
    };
  }

  updateGame(dt, sim, zones) {
    this.viewShift(0);
    const f = this.framing();
    const s = sim.s;
    // plus la course est rapide, plus on recule et on regarde loin (obstacles visibles plus tôt)
    const speedK = Math.max(0, Math.min(1, (sim.v - 14) / 16));
    f.dist += speedK * 0.8;
    f.lookAhead += speedK * 6;
    // Sol « lissé » : la caméra suit les toits des trains sans suivre chaque saut.
    const supportY = sim.onGround ? sim.y : Math.min(sim.y, this.groundY + 1.2);
    this.groundY = damp(this.groundY, supportY, sim.onGround ? 6 : 2.5, dt);
    const jumpLift = Math.max(0, sim.y - this.groundY) * 0.35;
    const rollDrop = sim.rollTime > 0 ? -0.35 : 0;
    const jet = sim.jet === 'rise' || sim.jet === 'fly';
    let ty = this.groundY + f.height + jumpLift + rollDrop + (jet ? 1.0 : 0);
    const tx = sim.x * 0.78;
    let tz = -(s - f.dist);
    // Évitement : ne pas entrer dans un train proche de la caméra
    const camS = s - f.dist;
    for (const e of sim.entities) {
      if (e.kind !== 'train') continue;
      const b = entityBox(e, s, this._box);
      if (camS < b.s0 - 1 || camS > b.s1 + 1) continue;
      if (Math.abs(tx - (b.x0 + b.x1) / 2) < TRAIN.width / 2 + 0.4) ty = Math.max(ty, TRAIN.height + 1.4);
    }
    // Plafond de tunnel
    for (const z of zones) {
      if (z.type === 'tunnel' && camS > z.s0 - 2 && camS < z.s1 + 2) ty = Math.min(ty, 6.9);
    }
    // fin de partie : la caméra se rapproche lentement du personnage
    let lookZ = -(s + f.lookAhead);
    let lookY = this.groundY + 0.6 + jumpLift * 0.6 + (jet ? 0.8 : 0);
    if (!sim.alive) {
      this.deathT = Math.min(1, this.deathT + dt * 0.8);
      const k = this.deathT * this.deathT * (3 - 2 * this.deathT);
      ty += (sim.y + 2.4 - ty) * k;
      tz += (-(s - 3.6) - tz) * k;
      lookZ += (-s - lookZ) * k;
      lookY += (sim.y + 0.8 - lookY) * k;
    }
    const kx = this.reduced ? 5 : 8;
    const prevX = this.pos.x;
    this.pos.x = damp(this.pos.x, tx, kx, dt);
    this.pos.y = damp(this.pos.y, ty, this.reduced ? 4 : 6, dt);
    this.pos.z = sim.alive ? tz : damp(this.pos.z, tz, 4, dt); // suivi exact en profondeur pendant la course
    this.look.set(damp(this.look.x, sim.x * 0.55, 7, dt), damp(this.look.y, lookY, 6, dt), sim.alive ? lookZ : damp(this.look.z, lookZ, 4, dt));
    // légère inclinaison dans les changements de voie
    const vx = dt > 0 ? (this.pos.x - prevX) / dt : 0;
    this.roll = damp(this.roll, this.reduced ? 0 : Math.max(-0.05, Math.min(0.05, -vx * 0.012)), 8, dt);
    // FOV dynamique selon la vitesse (désactivé en mouvements réduits)
    const portraitView = this.aspect < 0.8;
    const fov = f.baseFov + (this.reduced ? 0 : speedK * (portraitView ? 4 : 7) + (jet ? 3 : 0));
    this.camera.fov = damp(this.camera.fov, fov, 2, dt);
    this.apply(dt);
  }

  // Vue du menu : orbite lente autour du personnage.
  // Décale l'image verticalement (menu portrait : le personnage au-dessus des boutons).
  viewShift(k, kx = 0) {
    const c = this.camera;
    const key = `${k}:${kx}`;
    if (this._shift === key) return;
    this._shift = key;
    if (!k && !kx) c.clearViewOffset();
    else c.setViewOffset(1000, 1000, 1000 * kx, 1000 * k, 1000, 1000);
  }

  updateMenu(dt, target) {
    this.roll = 0;
    this.blend = null;
    const portrait = this.aspect < 0.8;
    const wideShort = this.aspect >= 1.6 && this.screenH < 560; // téléphone en paysage
    if (wideShort) this.viewShift(0.16, 0);
    else this.viewShift(portrait ? 0.2 : 0, !portrait ? 0.12 : 0);
    this.orbit += dt * (this.reduced ? 0.05 : 0.12);
    const r = portrait ? 8.2 : wideShort ? 10.5 : 6.2;
    const a = Math.sin(this.orbit) * 0.55;
    this.pos.set(target.x + Math.sin(a) * r, target.y + 1.5, target.z + Math.cos(a) * r);
    this.look.set(target.x, target.y + 0.95, target.z);
    this.camera.fov = damp(this.camera.fov, portrait ? 38 : 34, 3, dt);
    this.apply(dt);
  }

  apply(dt) {
    const c = this.camera;
    let lookAt = this.look;
    c.position.copy(this.pos);
    if (this.blend) {
      // transition : interpolation douce (ease in-out) depuis la vue précédente
      this.blend.t += dt;
      const t = Math.min(1, this.blend.t / this.blend.d);
      const k = t * t * (3 - 2 * t);
      c.position.lerpVectors(this._from.pos, this.pos, k);
      lookAt = this._tmpLook || (this._tmpLook = new THREE.Vector3());
      lookAt.lerpVectors(this._from.look, this.look, k);
      if (t >= 1) this.blend = null;
    }
    if (this.shake > 0) {
      const t = performance.now() * 0.05;
      const a = this.shake * this.shake * 0.25;
      c.position.x += Math.sin(t * 1.7) * a;
      c.position.y += Math.cos(t * 2.3) * a;
      this.shake = Math.max(0, this.shake - dt * 2.4);
    }
    c.lookAt(lookAt);
    if (this.roll) c.rotateZ(this.roll);
    c.updateProjectionMatrix();
  }
}
