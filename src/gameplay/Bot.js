// Pilote automatique : suit le « chemin garanti » produit par le générateur.
// Sert aux tests d'équité (une solution existe toujours) et au mode démo.
import { JUMP_LEAD, ROLL_LEAD } from './TrackGenerator.js';

export class Bot {
  constructor(sim) {
    this.sim = sim;
    this.done = new Set();
  }
  update() {
    const sim = this.sim;
    if (!sim.alive) return;
    // Floor is Lava : saute dès que le sol devient trop chaud
    if (sim.lava && sim.onGround && sim.heat > 0.35) sim.input('jump');
    const path = sim.generator.path;
    let w = null;
    for (const p of path) {
      if (p.s1 > sim.s) { w = p; break; }
    }
    if (!w) return;
    const jetOn = sim.jet === 'rise' || sim.jet === 'fly';
    if (!jetOn && sim.targetLane !== w.lane) {
      sim.input(w.lane < sim.targetLane ? 'left' : 'right');
    }
    // actions des rangées à venir (on regarde les deux prochains waypoints)
    for (const p of path) {
      if (p.s1 <= sim.s) continue;
      if (p.at === undefined || this.done.has(p)) { if (p.s > sim.s + 60) break; continue; }
      const lead = p.action === 'jump' ? JUMP_LEAD : ROLL_LEAD;
      if (sim.s >= p.at - sim.v * lead) {
        this.done.add(p);
        if (p.action === 'jump') sim.input('jump');
        else if (p.action === 'roll') sim.input('roll');
      }
      if (p.s > sim.s + 60) break;
    }
    if (this.done.size > 400) this.done = new Set([...this.done].slice(-100));
  }
}
