// Missions : trois missions actives tirées du catalogue, suivies via les
// statistiques réelles de la partie. Module pur (testé).
import { MISSION_POOL, MISSION_SET_REWARD } from '../data/catalog.js';

export function missionDef(id) {
  return MISSION_POOL.find((m) => m.id === id);
}

export function ensureMissions(state, rand = Math.random) {
  const active = state.active.filter((m) => missionDef(m.id));
  const used = new Set(active.map((m) => m.id));
  const pool = MISSION_POOL.filter((m) => !used.has(m.id));
  while (active.length < 3 && pool.length) {
    const i = Math.floor(rand() * pool.length);
    const def = pool.splice(i, 1)[0];
    active.push({ id: def.id, progress: 0, done: false, claimed: false });
  }
  state.active = active;
  return state;
}

// Valeur d'une statistique pour la partie en cours.
function runValue(stat, run) {
  if (stat === 'record') return run.newRecord ? 1 : 0;
  if (stat === 'score') return run.score;
  if (stat === 'coins') return run.coins;
  if (stat === 'distance') return run.distance;
  return run.stats?.[stat] ?? 0;
}

// Mise à jour pendant la partie (scope run) : retourne les missions venant d'être terminées.
export function trackRun(state, run, base = {}) {
  const finished = [];
  for (const m of state.active) {
    if (m.done) continue;
    const def = missionDef(m.id);
    const v = runValue(def.stat, run);
    if (def.scope === 'run') m.progress = Math.max(m.progress, v);
    else m.progress = (base[m.id] ?? m.progress) + v;
    if (m.progress >= def.target) {
      m.progress = def.target;
      m.done = true;
      finished.push(def);
    }
  }
  return finished;
}

// À la fin d'une partie : fige la progression cumulée.
export function commitRun(state, run, base) {
  trackRun(state, run, base);
}

export function snapshotBase(state) {
  const base = {};
  for (const m of state.active) base[m.id] = m.progress;
  return base;
}

// Encaisse les récompenses des missions terminées ; si les trois sont faites,
// passe au niveau suivant (multiplicateur de base +1) et tire un nouveau set.
export function claim(state, save, rand = Math.random) {
  let coins = 0;
  let levelUp = false;
  for (const m of state.active) {
    if (m.done && !m.claimed) {
      m.claimed = true;
      coins += missionDef(m.id).reward;
      state.completedTotal++;
    }
  }
  if (state.active.length === 3 && state.active.every((m) => m.claimed)) {
    state.level = Math.min(99, state.level + 1);
    coins += MISSION_SET_REWARD.coins;
    save.hoverboards += MISSION_SET_REWARD.boards;
    state.active = [];
    ensureMissions(state, rand);
    levelUp = true;
  }
  save.bank += coins;
  return { coins, levelUp };
}
