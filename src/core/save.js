// Schéma de sauvegarde + validation stricte (module pur, testé).
// Une sauvegarde corrompue ou partielle est réparée champ par champ à partir
// des valeurs par défaut, jamais acceptée telle quelle.
import { BOARDS, CHARACTERS, COIN_SKINS, MISSION_POOL, VERSIONS } from '../data/catalog.js';
import { MAPS } from '../data/maps.js';
import { cloneDefaults, validateKeys } from '../gameplay/keymap.js';
import { defaultSkins, validateSkins } from '../skins/SkinManager.js';

export const SAVE_VERSION = 1;

export function defaultSave() {
  return {
    v: SAVE_VERSION,
    bank: 0,
    best: 0,
    bestDistance: 0,
    hoverboards: 3,
    stats: { runs: 0, coins: 0, distance: 0, jumps: 0, rolls: 0, powerups: 0, boards: 0, trainTops: 0, laneChanges: 0 },
    unlocked: { characters: ['nova'], boards: ['classic'] },
    selected: { character: 'nova', board: 'classic', map: 'metro', version: 'ultimate', mode: 'standard' },
    look: {},
    board: { color: null, color2: null },
    missions: { level: 1, active: [], completedTotal: 0 },
    settings: {
      quality: 'auto', shadows: null, reducedMotion: false, touchButtons: true, showFps: false,
      master: 0.8, music: 0.6, sfx: 0.8, muted: false, swipeSensitivity: 1, vibrate: true, autoFullscreen: false, saturation: 1, invincible: false, keys: cloneDefaults(),
    },
    studio: {
      coinTint: null,
      coinPreset: null,
      coinLib: [], // « Mes images » : images de pièces gardées sur l'appareil (IndexedDB)
      coinGlow: { enabled: false, color: '#ffd23a', intensity: 0.6 },
      trainLivery: { enabled: false, body: '#2f7fd8', stripe: '#ffd23a', accent: '#ff4f6d' },
      lighting: { exposure: 1, sun: 1, hemi: 1 },
      files: { shirt: null, coin: null, board: null, train: null, model: null, skin: null, cape: null },
    },
    skins: defaultSkins(),
    lastSeed: null,
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const num = (v, d, min = -Infinity, max = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const int = (v, d, min = 0, max = 1e12) => Math.round(num(v, d, min, max));
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const HEX = /^#[0-9a-fA-F]{6}$/;
const color = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
const strId = (v, d) => (typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : d);

export function validateSave(input) {
  const d = defaultSave();
  if (!isObj(input)) return d;
  const out = d;
  out.bank = int(input.bank, 0);
  out.best = int(input.best, 0);
  out.bestDistance = int(input.bestDistance, 0);
  out.hoverboards = int(input.hoverboards, 3, 0, 999);
  if (isObj(input.stats)) for (const k of Object.keys(out.stats)) out.stats[k] = int(input.stats[k], 0);
  const charIds = CHARACTERS.map((c) => c.id);
  const boardIds = BOARDS.map((b) => b.id);
  if (isObj(input.unlocked)) {
    const c = Array.isArray(input.unlocked.characters) ? input.unlocked.characters.filter((x) => charIds.includes(x)) : [];
    const b = Array.isArray(input.unlocked.boards) ? input.unlocked.boards.filter((x) => boardIds.includes(x)) : [];
    out.unlocked.characters = [...new Set(['nova', ...c])];
    out.unlocked.boards = [...new Set(['classic', ...b])];
  }
  if (isObj(input.selected)) {
    const s = input.selected;
    out.selected.character = out.unlocked.characters.includes(s.character) ? s.character : 'nova';
    out.selected.board = out.unlocked.boards.includes(s.board) ? s.board : 'classic';
    out.selected.map = oneOf(s.map, MAPS.map((m) => m.id), 'metro');
    out.selected.version = oneOf(s.version, VERSIONS.filter((v) => !v.disabled).map((v) => v.id), 'ultimate');
    out.selected.mode = oneOf(s.mode, ['standard', 'training', 'lava', 'speed', 'zen'], 'standard');
  }
  if (isObj(input.look)) {
    const L = {};
    for (const k of ['skin', 'hairColor', 'shirt', 'accent', 'pants', 'shoes', 'sole', 'accessory']) if (input.look[k] !== undefined) L[k] = color(input.look[k], undefined);
    if (input.look.hair !== undefined) L.hair = oneOf(input.look.hair, ['spiky', 'short', 'bun', 'mohawk', 'long'], undefined);
    if (Array.isArray(input.look.accessories)) L.accessories = input.look.accessories.filter((a) => ['cap', 'headphones', 'glasses', 'backpack', 'scarf'].includes(a)).slice(0, 5);
    for (const k of Object.keys(L)) if (L[k] === undefined) delete L[k];
    out.look = L;
  }
  if (isObj(input.board)) {
    out.board.color = color(input.board.color, null);
    out.board.color2 = color(input.board.color2, null);
  }
  if (isObj(input.missions)) {
    out.missions.level = int(input.missions.level, 1, 1, 99);
    out.missions.completedTotal = int(input.missions.completedTotal, 0);
    const ids = MISSION_POOL.map((m) => m.id);
    if (Array.isArray(input.missions.active)) {
      out.missions.active = input.missions.active
        .filter((m) => isObj(m) && ids.includes(m.id))
        .slice(0, 3)
        .map((m) => ({ id: m.id, progress: num(m.progress, 0, 0, 1e9), done: bool(m.done, false), claimed: bool(m.claimed, false) }));
    }
  }
  if (isObj(input.settings)) {
    const s = input.settings;
    const o = out.settings;
    o.quality = oneOf(s.quality, ['auto', 'low', 'medium', 'high'], 'auto');
    o.shadows = s.shadows === null || typeof s.shadows === 'boolean' ? s.shadows : null;
    o.reducedMotion = bool(s.reducedMotion, false);
    o.invincible = bool(s.invincible, false);
    o.touchButtons = bool(s.touchButtons, true);
    o.showFps = bool(s.showFps, false);
    o.master = num(s.master, 0.8, 0, 1);
    o.music = num(s.music, 0.6, 0, 1);
    o.sfx = num(s.sfx, 0.8, 0, 1);
    o.muted = bool(s.muted, false);
    o.swipeSensitivity = num(s.swipeSensitivity, 1, 0.5, 2);
    o.vibrate = bool(s.vibrate, true);
    o.autoFullscreen = bool(s.autoFullscreen, false);
    o.saturation = num(s.saturation, 1, 0, 2);
    o.keys = validateKeys(s.keys);
  }
  if (isObj(input.studio)) {
    const s = input.studio;
    out.studio.coinTint = color(s.coinTint, null);
    if (isObj(s.coinGlow)) {
      out.studio.coinGlow = { enabled: bool(s.coinGlow.enabled, false), color: color(s.coinGlow.color, '#ffd23a'), intensity: num(s.coinGlow.intensity, 0.6, 0.1, 1) };
    }
    const preset = s.coinPreset === 'samoyede' ? 'husky' : s.coinPreset; // ancien nom du chien
    if (Array.isArray(s.coinLib)) {
      out.studio.coinLib = s.coinLib
        .filter((e) => isObj(e) && /^[\w-]{1,40}$/.test(e.id || ''))
        .slice(0, 16)
        .map((e) => ({ id: e.id, name: typeof e.name === 'string' ? e.name.slice(0, 40) : 'Image' }));
    }
    const localIds = out.studio.coinLib.map((e) => `local:${e.id}`);
    out.studio.coinPreset = oneOf(preset, [...COIN_SKINS.map((c) => c.id), ...localIds], null);
    if (isObj(s.trainLivery)) {
      out.studio.trainLivery = {
        enabled: bool(s.trainLivery.enabled, false),
        body: color(s.trainLivery.body, '#2f7fd8'),
        stripe: color(s.trainLivery.stripe, '#ffd23a'),
        accent: color(s.trainLivery.accent, '#ff4f6d'),
      };
    }
    if (isObj(s.lighting)) {
      out.studio.lighting = { exposure: num(s.lighting.exposure, 1, 0.5, 1.8), sun: num(s.lighting.sun, 1, 0.2, 2), hemi: num(s.lighting.hemi, 1, 0.2, 2) };
    }
    if (isObj(s.files)) for (const k of Object.keys(out.studio.files)) out.studio.files[k] = strId(s.files[k], null);
  }
  // skins (Galaxie…) : absents des anciennes sauvegardes -> valeurs par défaut
  out.skins = validateSkins(input.skins);
  out.lastSeed = typeof input.lastSeed === 'string' && input.lastSeed.length < 40 ? input.lastSeed : null;
  return out;
}

// Migration des données du prototype d'origine (clés mnnrow_best / mnnrow_custom).
export function migrateLegacy(storage, save) {
  const notes = [];
  try {
    const best = Number(storage.getItem('mnnrow_best'));
    if (Number.isFinite(best) && best > save.best) {
      save.best = Math.floor(best);
      notes.push('meilleur score');
    }
    const raw = storage.getItem('mnnrow_custom');
    if (raw) {
      const c = JSON.parse(raw);
      if (c && HEX.test(c.charColor || '')) { save.look.shirt = c.charColor; notes.push('couleur du personnage'); }
      if (c && HEX.test(c.boardColor || '')) { save.board.color = c.boardColor; notes.push('couleur du hoverboard'); }
      const images = {};
      for (const [from, to] of [['charImage', 'shirt'], ['coinImage', 'coin'], ['boardImage', 'board']]) {
        if (typeof c?.[from] === 'string' && c[from].startsWith('data:image/')) images[to] = c[from];
      }
      return { notes, images };
    }
  } catch {
    /* ancienne donnée illisible : ignorée */
  }
  return { notes, images: {} };
}
