// Touches du clavier configurables (module pur, testé).
// Chaque action a 3 emplacements ; une valeur vide ('') = emplacement libre.
// Les touches sont stockées sous la forme de KeyboardEvent.key en minuscules,
// ce qui respecte la disposition du clavier (AZERTY, QWERTY…).

export const ACTIONS = [
  ['left', 'Aller à gauche'],
  ['right', 'Aller à droite'],
  ['jump', 'Sauter'],
  ['roll', 'Roulade'],
  ['board', 'Hoverboard'],
  ['pause', 'Pause'],
];
export const SLOTS = 3;

export const DEFAULT_KEYS = {
  left: ['arrowleft', 'q', 'a'],
  right: ['arrowright', 'd', ''],
  jump: ['arrowup', ' ', 'z'],
  roll: ['arrowdown', 's', ''],
  board: ['e', 'shift', ''],
  pause: ['escape', 'p', ''],
};

// Touches réservées au navigateur ou au système : jamais capturées.
const RESERVED = new Set(['tab', 'f1', 'f5', 'f11', 'f12', 'meta', 'os', 'contextmenu', 'dead', 'unidentified', 'process']);

export function normalizeKey(key) {
  if (typeof key !== 'string' || !key.length || key.length > 20) return null;
  const k = key.toLowerCase();
  if (RESERVED.has(k)) return null;
  return k;
}

export function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_KEYS));
}

// Valide une configuration sauvegardée (forme, types, doublons).
export function validateKeys(input) {
  const out = cloneDefaults();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  const seen = new Set();
  for (const [action] of ACTIONS) {
    const list = Array.isArray(input[action]) ? input[action] : null;
    if (!list) continue;
    const slots = [];
    for (let i = 0; i < SLOTS; i++) {
      const k = list[i] === '' ? '' : normalizeKey(list[i]);
      slots.push(k && !seen.has(k) ? k : '');
      if (k) seen.add(k);
    }
    out[action] = slots;
  }
  // une action sans aucune touche reprend ses touches par défaut (non utilisées ailleurs)
  for (const [action] of ACTIONS) {
    if (out[action].every((k) => !k)) {
      const used = new Set(Object.values(out).flat());
      out[action] = DEFAULT_KEYS[action].map((k) => (k && !used.has(k) ? k : ''));
    }
  }
  return out;
}

// Attribue une touche ; si elle servait ailleurs, elle y est retirée.
export function bindKey(map, action, slot, key) {
  const k = normalizeKey(key);
  if (!k) return { ok: false, reason: 'Touche réservée au navigateur.' };
  let movedFrom = null;
  for (const [a] of ACTIONS) {
    map[a] = map[a].map((x, i) => {
      if (x === k && !(a === action && i === slot)) {
        movedFrom = a;
        return '';
      }
      return x;
    });
  }
  map[action][slot] = k;
  return { ok: true, movedFrom };
}

export function actionFor(map, key) {
  const k = typeof key === 'string' ? key.toLowerCase() : '';
  for (const [a] of ACTIONS) if (map[a].includes(k)) return a;
  return null;
}

const LABELS = {
  arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', ' ': 'Espace', escape: 'Échap',
  enter: 'Entrée', shift: 'Maj', control: 'Ctrl', alt: 'Alt', altgraph: 'Alt Gr', backspace: 'Retour arr.',
  capslock: 'Verr. maj', delete: 'Suppr', insert: 'Inser', home: 'Début', end: 'Fin', pageup: 'Page ↑', pagedown: 'Page ↓',
};
export function keyLabel(k) {
  if (!k) return '—';
  return LABELS[k] || (k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1));
}
