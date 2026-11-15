// Minuteries des bonus : états indépendants, sans conflit (chaque bonus a son
// propre compteur ; les protections sont consommées dans un ordre défini).
import { POWERUP_DURATION } from './constants.js';

export const TIMED = ['magnet', 'jetpack', 'multiplier', 'sneakers', 'shield', 'hoverboard'];

export class PowerupSystem {
  constructor(durations = POWERUP_DURATION) {
    this.durations = { ...POWERUP_DURATION, ...durations };
    this.timers = {};
    this.reset();
  }
  reset() {
    for (const t of TIMED) this.timers[t] = 0;
  }
  activate(type) {
    if (!(type in this.timers)) return false;
    this.timers[type] = this.durations[type];
    return true;
  }
  active(type) {
    return this.timers[type] > 0;
  }
  remaining(type) {
    return Math.max(0, this.timers[type]);
  }
  fraction(type) {
    return this.durations[type] ? Math.max(0, this.timers[type]) / this.durations[type] : 0;
  }
  cancel(type) {
    this.timers[type] = 0;
  }
  // Retourne la liste des bonus expirés pendant ce pas.
  update(dt, paused = {}) {
    const expired = [];
    for (const t of TIMED) {
      if (this.timers[t] <= 0 || paused[t]) continue;
      this.timers[t] -= dt;
      if (this.timers[t] <= 0) {
        this.timers[t] = 0;
        expired.push(t);
      }
    }
    return expired;
  }
  list() {
    return TIMED.filter((t) => this.timers[t] > 0).map((t) => ({ type: t, remaining: this.timers[t], fraction: this.fraction(t) }));
  }
}
