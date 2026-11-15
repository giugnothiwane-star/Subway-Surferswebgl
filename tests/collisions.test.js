import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/gameplay/Simulation.js';
import { SIM_DT, TRAIN, RAMP } from '../src/gameplay/constants.js';

// Simulation contrôlée : on remplace la piste générée par un scénario précis.
function scenario(entities, opts = {}) {
  const sim = new Simulation({ seed: 1, powerups: [], ...opts });
  const g = sim.generator;
  g.entities = entities.map((e, i) => ({ id: 1000 + i, collected: false, ...e }));
  g.generateUntil = () => {}; // pas de génération supplémentaire
  g.prune = () => {};
  g.path = [];
  return sim;
}
function runUntil(sim, s, onStep) {
  let n = 0;
  while (sim.alive && sim.s < s && n++ < 100000) {
    onStep?.(sim);
    sim.step(SIM_DT);
  }
  return sim;
}
const events = (sim) => sim.drainEvents().map((e) => e.type);

test('barrière basse : collision sans saut, franchie avec un saut au bon moment', () => {
  const a = runUntil(scenario([{ kind: 'barrier', type: 'low', lane: 0, s: 30 }]), 40);
  assert.equal(a.alive, false);
  assert.equal(a.deathCause, 'barrierLow');
  let jumped = false;
  const b = runUntil(scenario([{ kind: 'barrier', type: 'low', lane: 0, s: 30 }]), 40, (sim) => {
    if (!jumped && sim.s >= 30 - sim.v * 0.27) { sim.input('jump'); jumped = true; }
  });
  assert.equal(b.alive, true);
});

test('barrière haute : la roulade réduit la hauteur de collision', () => {
  const a = runUntil(scenario([{ kind: 'barrier', type: 'high', lane: 0, s: 30 }]), 40);
  assert.equal(a.deathCause, 'barrierHigh');
  let rolled = false;
  const b = runUntil(scenario([{ kind: 'barrier', type: 'high', lane: 0, s: 30 }]), 40, (sim) => {
    if (!rolled && sim.s >= 29) { sim.input('roll'); rolled = true; }
  });
  assert.equal(b.alive, true);
  // sauter ne suffit pas sous une barrière haute
  let j = false;
  const c = runUntil(scenario([{ kind: 'barrier', type: 'high', lane: 0, s: 30 }]), 40, (sim) => {
    if (!j && sim.s >= 30 - sim.v * 0.27) { sim.input('jump'); j = true; }
  });
  assert.equal(c.alive, false);
});

test('train de face : fin de partie ; rampe : on monte sur le toit sans dommage', () => {
  const a = runUntil(scenario([{ kind: 'train', lane: 0, s: 30, length: 14, cars: 1, moving: false, k: 0 }]), 50);
  assert.equal(a.deathCause, 'front');
  const b = scenario([
    { kind: 'ramp', lane: 0, s: 30, length: RAMP.length },
    { kind: 'train', lane: 0, s: 30 + RAMP.length, length: 14, cars: 1, moving: false, k: 0 },
  ]);
  let maxY = 0;
  runUntil(b, 30 + RAMP.length + 10, (sim) => { maxY = Math.max(maxY, sim.y); });
  assert.equal(b.alive, true);
  assert.ok(Math.abs(maxY - TRAIN.height) < 0.05, `hauteur max ${maxY}`);
  // en bout de train, le joueur retombe au sol
  runUntil(b, 30 + RAMP.length + 30);
  assert.equal(b.y, 0);
  assert.equal(b.alive, true);
});

test('train mobile : la collision a lieu exactement au point de rencontre', () => {
  const sim = scenario([{ kind: 'train', lane: 0, s: 60, length: 14, cars: 1, moving: true, k: 0.65 }]);
  runUntil(sim, 100);
  assert.equal(sim.alive, false);
  assert.ok(Math.abs(sim.s - 60) < 1, `collision en ${sim.s}`);
});

test('changement de voie contre le flanc d\'un train : trébuchement puis retour', () => {
  const sim = scenario([{ kind: 'train', lane: 1, s: 10, length: 60, cars: 4, moving: false, k: 0 }]);
  runUntil(sim, 30);
  sim.input('right');
  runUntil(sim, 40);
  assert.equal(sim.alive, true);
  assert.ok(events(sim).includes('stumble'));
  assert.equal(sim.targetLane, 0);
  // deuxième trébuchement rapproché = fin de partie
  sim.input('right');
  runUntil(sim, 50);
  assert.equal(sim.alive, false);
  assert.equal(sim.deathCause, 'stumble');
});

test('bouclier puis hoverboard : chacun absorbe un choc, dans cet ordre', () => {
  const sim = scenario([
    { kind: 'barrier', type: 'low', lane: 0, s: 30 },
    { kind: 'barrier', type: 'low', lane: 0, s: 60 },
    { kind: 'barrier', type: 'low', lane: 0, s: 90 },
  ]);
  sim.powerups.activate('shield');
  sim.input('board');
  sim.step(SIM_DT);
  runUntil(sim, 40);
  assert.equal(sim.alive, true);
  assert.equal(sim.powerups.active('shield'), false);
  assert.equal(sim.powerups.active('hoverboard'), true);
  runUntil(sim, 70);
  assert.equal(sim.alive, true);
  assert.equal(sim.powerups.active('hoverboard'), false);
  runUntil(sim, 100);
  assert.equal(sim.alive, false);
});

test('une pièce n\'est jamais comptée deux fois', () => {
  const sim = scenario([{ kind: 'coin', lane: 0, s: 20, y: 1 }, { kind: 'coin', lane: 1, s: 25, y: 1 }]);
  runUntil(sim, 40);
  assert.equal(sim.coins, 1);
  sim.take(sim.entities[0]);
  sim.take(sim.entities[0]);
  assert.equal(sim.coins, 1);
});

test('aimant : attire les pièces des autres voies et les compte une fois', () => {
  const coins = [];
  for (let i = 0; i < 10; i++) coins.push({ kind: 'coin', lane: i % 2 ? 1 : -1, s: 20 + i * 2, y: 1 });
  const sim = scenario(coins);
  sim.powerups.activate('magnet');
  runUntil(sim, 60);
  assert.equal(sim.coins, 10);
});

test('jetpack : survole les obstacles puis redescend avec invulnérabilité', () => {
  const ents = [];
  for (let s = 40; s < 100; s += 12) ents.push({ kind: 'barrier', type: 'low', lane: 0, s });
  const sim = scenario(ents);
  sim.activatePowerup('jetpack');
  let maxY = 0;
  runUntil(sim, 150, (x) => { maxY = Math.max(maxY, x.y); });
  assert.ok(maxY > 4.5);
  assert.equal(sim.alive, true);
});

test('super sneakers : saut plus haut', () => {
  const a = scenario([]);
  a.input('jump');
  let m1 = 0;
  runUntil(a, 30, (x) => { m1 = Math.max(m1, x.y); });
  const b = scenario([]);
  b.powerups.activate('sneakers');
  b.input('jump');
  let m2 = 0;
  runUntil(b, 30, (x) => { m2 = Math.max(m2, x.y); });
  assert.ok(m2 > m1 * 1.8, `${m1} vs ${m2}`);
});

test('déplacement latéral progressif (pas de téléportation) et indépendant des FPS', () => {
  const a = scenario([]);
  a.input('left');
  a.step(SIM_DT);
  assert.ok(a.x < 0 && a.x > -1, `après un pas : ${a.x}`);
  // 30 FPS vs 144 FPS : même position après 0,5 s
  const b = scenario([]);
  const c = scenario([]);
  b.input('right'); c.input('right');
  for (let i = 0; i < 15; i++) b.advance(1 / 30);
  for (let i = 0; i < 72; i++) c.advance(1 / 144);
  assert.ok(Math.abs(b.x - c.x) < 0.05 && Math.abs(b.s - c.s) < 0.3, `${b.x},${b.s} vs ${c.x},${c.s}`);
});

test('le mode Zen ne termine pas la partie', () => {
  const sim = scenario([{ kind: 'barrier', type: 'low', lane: 0, s: 30 }], { zen: true });
  runUntil(sim, 40);
  assert.equal(sim.alive, true);
});
