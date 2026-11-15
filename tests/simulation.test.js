import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/gameplay/Simulation.js';
import { Bot } from '../src/gameplay/Bot.js';
import { SIM_DT } from '../src/gameplay/constants.js';

function run(seed, meters, opts = {}) {
  const sim = new Simulation({ seed, powerups: [], ...opts });
  const bot = new Bot(sim);
  let steps = 0;
  while (sim.alive && sim.s < meters && steps < 200000) {
    bot.update();
    sim.step(SIM_DT);
    steps++;
  }
  return sim;
}

test('le pilote automatique survit sur 4 km pour 25 graines (chemin toujours faisable)', () => {
  const failures = [];
  for (let seed = 1; seed <= 25; seed++) {
    const sim = run(seed, 4000);
    if (!sim.alive) failures.push({ seed, s: Math.round(sim.s), cause: sim.deathCause });
  }
  assert.deepEqual(failures, []);
});

test('génération déterministe : même graine => mêmes entités', () => {
  const a = new Simulation({ seed: 'ABC' });
  const b = new Simulation({ seed: 'ABC' });
  const sig = (sim) => sim.generator.entities.slice(0, 120).map((e) => `${e.kind}:${e.lane}:${e.s.toFixed(2)}:${e.type || e.variant || ''}`).join('|');
  assert.equal(sig(a), sig(b));
  const c = new Simulation({ seed: 'ABD' });
  assert.notEqual(sig(a), sig(c));
});

test('avec tous les bonus (jetpack compris), le chemin reste faisable : 8 graines × 3 km', () => {
  const failures = [];
  for (let seed = 101; seed <= 108; seed++) {
    const sim = run(seed, 3000, { powerups: undefined });
    if (!sim.alive) failures.push({ seed, s: Math.round(sim.s), cause: sim.deathCause });
  }
  assert.deepEqual(failures, []);
});
