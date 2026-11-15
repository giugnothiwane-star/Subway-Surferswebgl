/**
 * MNNROW — AudioSystem
 *
 * 100% procedural audio built on the Web Audio API: one-shot SFX, looping
 * per-map music (lookahead scheduler + seeded melody generation) and ambient
 * beds. No audio files, no dependencies — every sound is synthesized here.
 *
 * Routing:
 *   tracks ─┐
 *   fx ─────┼─> musicBus(vol) ─> duckFilter ─> duckGain ─┐
 *   amb ────┘                                            ├─> master ─> compressor ─> destination
 *   sfx ──────> sfxBus(vol) ─────────────────────────────┘
 *
 * If Web Audio is unavailable every public method is a silent no-op.
 */

const LOOKAHEAD = 0.12; // seconds of audio scheduled ahead of currentTime
const TICK_MS = 25; // scheduler interval
const XFADE = 0.6; // music crossfade time (s)
const RAMP = 0.06; // time constant for volume changes
const MUSIC_TRIM = 0.7; // headroom: music bus = music volume * trim

const MAP_IDS = ['metro', 'neon', 'beach', 'snow', 'desert', 'forest'];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d;
};
const mod = (n, m) => ((n % m) + m) % m;
const rand = (a, b) => a + Math.random() * (b - a);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

function getAudioContextCtor() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  return (g && (g.AudioContext || g.webkitAudioContext)) || null;
}

/* ------------------------------------------------------------------------ */
/* Music data                                                               */
/* ------------------------------------------------------------------------ */

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygDom: [0, 1, 4, 5, 7, 8, 10],
};

// Synth voice presets. oscs: partials; cutoff/cutEnd: lowpass + envelope;
// wet: also feed the track's delay send.
const INST = {
  square: { oscs: [{ type: 'square', gain: 0.45 }, { type: 'triangle', gain: 0.6 }], attack: 0.006, decay: 0.14, sustain: 0.5, release: 0.08, cutoff: 2600, cutEnd: 1100, cutTime: 0.12, Q: 1, wet: true },
  saw: { oscs: [{ type: 'sawtooth', detune: -9, gain: 0.45 }, { type: 'sawtooth', detune: 9, gain: 0.45 }], attack: 0.008, decay: 0.16, sustain: 0.55, release: 0.12, cutoff: 3200, cutEnd: 1300, cutTime: 0.14, Q: 2, wet: true },
  marimba: { oscs: [{ type: 'sine', gain: 1 }, { type: 'sine', mult: 4, gain: 0.3, decay: 0.035 }, { type: 'triangle', mult: 1, gain: 0.25, decay: 0.06 }], attack: 0.003, decay: 0.22, sustain: 0, release: 0.1, wet: true },
  bell: { oscs: [{ type: 'sine', gain: 1 }, { type: 'sine', mult: 3, gain: 0.22, decay: 0.12 }, { type: 'sine', mult: 4.2, gain: 0.08, decay: 0.05 }], attack: 0.003, decay: 0.7, sustain: 0, release: 0.4, wet: true },
  pluck: { oscs: [{ type: 'triangle', gain: 1 }, { type: 'sawtooth', gain: 0.22 }], attack: 0.003, decay: 0.22, sustain: 0, release: 0.1, cutoff: 4200, cutEnd: 650, cutTime: 0.12, Q: 3, wet: true },
  flute: { oscs: [{ type: 'sine', gain: 1 }, { type: 'triangle', mult: 2, gain: 0.1 }], attack: 0.06, decay: 0.3, sustain: 0.75, release: 0.15, vib: { rate: 5.2, depth: 7 }, wet: true },
  keys: { oscs: [{ type: 'sine', gain: 1 }, { type: 'triangle', mult: 2, gain: 0.22, decay: 0.08 }], attack: 0.004, decay: 0.45, sustain: 0.3, release: 0.2, wet: true },
  sinepad: { oscs: [{ type: 'sine', detune: -5, gain: 0.6 }, { type: 'sine', detune: 5, gain: 0.6 }, { type: 'triangle', mult: 2, gain: 0.08 }], attack: 0.5, decay: 1.2, sustain: 0.8, release: 0.9, wet: true },
  softpad: { oscs: [{ type: 'triangle', detune: -7, gain: 0.55 }, { type: 'triangle', detune: 7, gain: 0.55 }], attack: 0.35, decay: 1, sustain: 0.8, release: 0.7, cutoff: 1800, wet: true },
  sawpad: { oscs: [{ type: 'sawtooth', detune: -11, gain: 0.45 }, { type: 'sawtooth', detune: 11, gain: 0.45 }], attack: 0.3, decay: 1, sustain: 0.8, release: 0.7, cutoff: 1300, Q: 0.7, wet: true },
  tripad: { oscs: [{ type: 'triangle', gain: 0.7 }, { type: 'sine', mult: 0.5, gain: 0.4 }], attack: 0.4, decay: 1, sustain: 0.8, release: 0.8, cutoff: 1500, wet: true },
  funk: { oscs: [{ type: 'sawtooth', gain: 0.6 }, { type: 'square', mult: 0.5, gain: 0.3 }], attack: 0.004, decay: 0.12, sustain: 0.45, release: 0.06, cutoff: 1700, cutEnd: 300, cutTime: 0.08, Q: 7 },
  sawbass: { oscs: [{ type: 'sawtooth', gain: 0.55 }, { type: 'sine', gain: 0.6 }], attack: 0.004, decay: 0.1, sustain: 0.5, release: 0.05, cutoff: 900, cutEnd: 240, cutTime: 0.1, Q: 4 },
  sub: { oscs: [{ type: 'sine', gain: 1 }, { type: 'triangle', gain: 0.3 }], attack: 0.008, decay: 0.3, sustain: 0.6, release: 0.1 },
  tribass: { oscs: [{ type: 'triangle', gain: 1 }, { type: 'sine', gain: 0.4 }], attack: 0.005, decay: 0.25, sustain: 0.4, release: 0.08, cutoff: 1200 },
};

// Part types: drum (i = kick|snare|clap|hat|shaker|rim|hand), bass, pad, stab, arp, lead.
// Patterns are 16 steps (16ths). 'x' = hit, 'o' = soft/alt (bass: octave), '5' = fifth (bass).
const MAPS = {
  metro: {
    root: 45, scale: 'dorian', bpm: { menu: 98, run: 128 }, swing: 0.12, leadOct: 2, send: 0.16,
    progs: [[0, 3, 0, 4], [0, 3, 6, 4], [0, 2, 3, 6, 0, 2, 3, 4]],
    run: [
      { t: 'drum', i: 'kick', p: 'x.....x...x..x..', v: 0.9 },
      { t: 'drum', i: 'snare', p: '....x.......x...', v: 0.5, fill: true },
      { t: 'drum', i: 'hat', p: 'x.xox.xox.xox.xo', v: 0.24, dense: true },
      { t: 'bass', i: 'funk', p: 'x..x..o.x.x..o.5', v: 0.42 },
      { t: 'stab', i: 'keys', p: '..x...x...x..x..', v: 0.07 },
      { t: 'lead', i: 'square', v: 0.11 },
    ],
    menu: [
      { t: 'drum', i: 'kick', p: 'x.......x.......', v: 0.55 },
      { t: 'drum', i: 'hat', p: '..x...x...x...x.', v: 0.16 },
      { t: 'bass', i: 'funk', p: 'x.......x..o....', v: 0.36 },
      { t: 'pad', i: 'keys', v: 0.07 },
      { t: 'lead', i: 'square', v: 0.09 },
    ],
  },
  neon: {
    root: 42, scale: 'aeolian', bpm: { menu: 102, run: 136 }, swing: 0, leadOct: 2, send: 0.28,
    progs: [[0, 5, 2, 6], [0, 3, 5, 6], [0, 5, 3, 4], [0, 6, 5, 6, 0, 6, 3, 4]],
    run: [
      { t: 'drum', i: 'kick', p: 'x...x...x...x...', v: 0.95 },
      { t: 'drum', i: 'clap', p: '....x.......x...', v: 0.4, fill: true },
      { t: 'drum', i: 'hat', p: '..x...x...x...x.', v: 0.26, dense: true },
      { t: 'bass', i: 'sawbass', p: 'x.o.x.o.x.o.x.o.', v: 0.34 },
      { t: 'arp', i: 'saw', p: 'xxxxxxxxxxxxxxxx', v: 0.045 },
      { t: 'pad', i: 'sawpad', v: 0.045 },
      { t: 'lead', i: 'saw', v: 0.08 },
    ],
    menu: [
      { t: 'drum', i: 'kick', p: 'x.......x.......', v: 0.5 },
      { t: 'drum', i: 'hat', p: '..x...x...x...x.', v: 0.14 },
      { t: 'bass', i: 'sawbass', p: 'x.......x.......', v: 0.3 },
      { t: 'arp', i: 'saw', p: 'x.x.x.x.x.x.x.x.', v: 0.045 },
      { t: 'pad', i: 'sawpad', v: 0.05 },
      { t: 'lead', i: 'saw', v: 0.065 },
    ],
  },
  beach: {
    root: 48, scale: 'major', bpm: { menu: 96, run: 124 }, swing: 0.08, leadOct: 2, send: 0.14,
    progs: [[0, 4, 5, 3], [0, 3, 4, 3], [0, 5, 3, 4], [0, 3, 0, 4, 5, 3, 4, 4]],
    run: [
      { t: 'drum', i: 'kick', p: 'x.......x.x.....', v: 0.7 },
      { t: 'drum', i: 'rim', p: '....x.......x...', v: 0.3, fill: true },
      { t: 'drum', i: 'shaker', p: 'xoxoxoxoxoxoxoxo', v: 0.18, dense: true },
      { t: 'bass', i: 'tribass', p: 'x..x..x.x..x..5.', v: 0.4 },
      { t: 'arp', i: 'marimba', p: 'x.xx.x.xx.x.x.x.', v: 0.09 },
      { t: 'lead', i: 'marimba', v: 0.14 },
    ],
    menu: [
      { t: 'drum', i: 'kick', p: 'x.......x.......', v: 0.45 },
      { t: 'drum', i: 'shaker', p: 'x.o.x.o.x.o.x.o.', v: 0.13 },
      { t: 'bass', i: 'tribass', p: 'x.......x.....5.', v: 0.34 },
      { t: 'arp', i: 'marimba', p: 'x...x.x...x.x...', v: 0.08 },
      { t: 'lead', i: 'marimba', v: 0.12 },
    ],
  },
  snow: {
    root: 50, scale: 'lydian', bpm: { menu: 96, run: 120 }, swing: 0, leadOct: 2, send: 0.38,
    progs: [[0, 1, 5, 4], [0, 4, 5, 1], [0, 1, 0, 4], [0, 5, 1, 4, 0, 5, 1, 1]],
    run: [
      { t: 'drum', i: 'kick', p: 'x.......x.......', v: 0.62 },
      { t: 'drum', i: 'snare', p: '....x.......x...', v: 0.26, fill: true },
      { t: 'drum', i: 'hat', p: 'x.x.x.x.x.x.x.x.', v: 0.12, dense: true },
      { t: 'bass', i: 'sub', p: 'x.......x...x...', v: 0.4 },
      { t: 'pad', i: 'sinepad', v: 0.05 },
      { t: 'arp', i: 'bell', p: 'x..x..x.x..x..x.', v: 0.06 },
      { t: 'lead', i: 'bell', v: 0.1 },
    ],
    menu: [
      { t: 'drum', i: 'kick', p: 'x.......x.......', v: 0.3 },
      { t: 'bass', i: 'sub', p: 'x...............', v: 0.32 },
      { t: 'pad', i: 'sinepad', v: 0.06 },
      { t: 'arp', i: 'bell', p: 'x...x...x...x...', v: 0.055 },
      { t: 'lead', i: 'bell', v: 0.09 },
    ],
  },
  desert: {
    root: 40, scale: 'phrygDom', bpm: { menu: 100, run: 130 }, swing: 0.05, leadOct: 2, send: 0.2,
    progs: [[0, 1, 0, 6], [0, 1, 6, 0], [0, 6, 5, 1], [0, 1, 0, 6, 5, 6, 1, 0]],
    run: [
      { t: 'drum', i: 'kick', p: 'x.......x.......', v: 0.72 },
      { t: 'drum', i: 'hand', p: 'x..o..x.o.x.o.oo', v: 0.36, fill: true },
      { t: 'drum', i: 'shaker', p: 'x.x.x.x.x.x.x.x.', v: 0.12, dense: true },
      { t: 'bass', i: 'tribass', p: 'x.....x.x.......', v: 0.4 },
      { t: 'pad', i: 'tripad', v: 0.04 },
      { t: 'arp', i: 'pluck', p: '..x...x...x...x.', v: 0.07 },
      { t: 'lead', i: 'pluck', v: 0.14 },
    ],
    menu: [
      { t: 'drum', i: 'hand', p: 'x.....o...x..o..', v: 0.28 },
      { t: 'bass', i: 'tribass', p: 'x.......x.......', v: 0.32 },
      { t: 'pad', i: 'tripad', v: 0.045 },
      { t: 'lead', i: 'pluck', v: 0.12 },
    ],
  },
  forest: {
    root: 43, scale: 'major', mask: [0, 1, 2, 4, 5], bpm: { menu: 95, run: 122 }, swing: 0.1, leadOct: 2, send: 0.28,
    progs: [[0, 3, 0, 4], [0, 5, 3, 4], [0, 4, 5, 3], [0, 3, 5, 4, 0, 3, 4, 0]],
    run: [
      { t: 'drum', i: 'kick', p: 'x.......x.x.....', v: 0.58 },
      { t: 'drum', i: 'rim', p: '....x.......x...', v: 0.26, fill: true },
      { t: 'drum', i: 'shaker', p: 'x.o.x.o.x.o.x.oo', v: 0.14, dense: true },
      { t: 'bass', i: 'sub', p: 'x...x...x...x.5.', v: 0.38 },
      { t: 'arp', i: 'pluck', p: 'x.x.x.x.x.x.x.x.', v: 0.05 },
      { t: 'pad', i: 'softpad', v: 0.04 },
      { t: 'lead', i: 'flute', v: 0.11 },
    ],
    menu: [
      { t: 'drum', i: 'shaker', p: '....x.......x...', v: 0.09 },
      { t: 'bass', i: 'sub', p: 'x.......x.......', v: 0.32 },
      { t: 'pad', i: 'softpad', v: 0.055 },
      { t: 'arp', i: 'pluck', p: 'x...x...x...x...', v: 0.055 },
      { t: 'lead', i: 'flute', v: 0.1 },
    ],
  },
};

// Melody rhythm templates: [startStep, lengthInSteps] within a 16-step bar.
const RHYTHMS = {
  run: [
    [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
    [[0, 3], [3, 3], [6, 2], [8, 4], [12, 2], [14, 2]],
    [[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]],
    [[2, 2], [4, 2], [6, 4], [10, 2], [12, 4]],
    [[0, 2], [2, 1], [3, 3], [6, 2], [8, 2], [10, 2], [12, 4]],
    [[0, 6], [6, 2], [8, 4], [12, 4]],
  ],
  menu: [
    [[0, 6], [6, 2], [8, 8]],
    [[0, 4], [4, 4], [8, 8]],
    [[0, 3], [3, 5], [8, 4], [12, 4]],
    [[2, 2], [4, 4], [8, 8]],
    [[0, 8], [8, 4], [12, 4]],
  ],
  cadence: { run: [[0, 4], [4, 4], [8, 8]], menu: [[0, 4], [4, 12]] },
};

const COIN_STEPS = [0, 2, 4, 7, 9, 12, 14, 16]; // major pentatonic climb

/* ------------------------------------------------------------------------ */
/* Music track                                                              */
/* ------------------------------------------------------------------------ */

class MusicTrack {
  constructor(sys, kind, mapId, salt) {
    const ctx = sys.ctx;
    this.sys = sys;
    this.kind = kind;
    this.mapId = mapId;
    this.cfg = MAPS[mapId];
    this.parts = this.cfg[kind];
    this.scale = SCALES[this.cfg.scale];
    this.stepDur = 60 / this.cfg.bpm[kind] / 4;
    this.rng = mulberry32(hashStr(mapId + ':' + kind) + salt * 7919);
    this.prog = pick(this.rng, this.cfg.progs);
    this.phrases = [this._genPhrase(), this._genPhrase()];
    this.plan = [0, 0, 1, 0];
    this.arpIdx = 0;
    this.step = 0;
    this.stopAt = null;
    this.killAt = null;

    const now = ctx.currentTime;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 0.5;
    this.filter.frequency.value = kind === 'run' ? sys._intensityFreq() : 16000;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.gain.setValueAtTime(0, now);
    this.out.gain.linearRampToValueAtTime(1, now + XFADE);
    this.fadeInAt = now;
    this.filter.connect(this.out);
    this.out.connect(sys.musicBus);
    this.send = ctx.createGain();
    this.send.gain.value = this.cfg.send;
    this.send.connect(sys.fxIn);
    this.nextTime = now + 0.06;
  }

  degToMidi(base, deg) {
    const oct = Math.floor(deg / 7);
    return base + oct * 12 + this.scale[deg - oct * 7];
  }

  chordTones(chordDeg, base) {
    const out = [];
    for (const k of [0, 2, 4]) {
      let m = this.degToMidi(this.cfg.root, chordDeg + k);
      while (m < base) m += 12;
      while (m >= base + 12) m -= 12;
      out.push(m);
    }
    return out.sort((a, b) => a - b);
  }

  _genPhrase() {
    const rng = this.rng;
    const kind = this.kind;
    const mask = this.cfg.mask || null;
    const lo = -1;
    const hi = 9;
    const restP = kind === 'run' ? 0.12 : 0.2;
    const isTone = (d, c) => [0, 2, 4].includes(mod(d - c, 7));
    const nearestTone = (cur, chord, rootOnly) => {
      let best = cur;
      let bestScore = Infinity;
      for (let d = cur - 4; d <= cur + 4; d++) {
        if (d < lo || d > hi) continue;
        if (rootOnly ? mod(d - chord, 7) !== 0 : !isTone(d, chord)) continue;
        const score = Math.abs(d - cur) + rng() * 1.5 + 0.15 * Math.abs(d - 4);
        if (score < bestScore) {
          bestScore = score;
          best = d;
        }
      }
      return best;
    };
    const bars = [];
    let cur = 4;
    const P = this.prog.length;
    for (let b = 0; b < P; b++) {
      const chord = this.prog[b];
      const last = b === P - 1;
      const rhythm = last ? RHYTHMS.cadence[kind] : pick(rng, RHYTHMS[kind]);
      const notes = [];
      rhythm.forEach(([s, len], i) => {
        if (i > 0 && !last && rng() < restP) return;
        const strong = s % 4 === 0;
        let d;
        if (last && i === rhythm.length - 1) d = nearestTone(cur, chord, true);
        else if (strong || i === 0) d = nearestTone(cur, chord, false);
        else {
          d = cur + pick(rng, [-1, -1, 1, 1, -2, 2, 0]);
          if (mask && !mask.includes(mod(d, 7))) d += d >= cur ? 1 : -1;
          if (d > hi) d = cur - 1;
          if (d < lo) d = cur + 1;
        }
        cur = d;
        notes.push({ s, len, d, acc: strong });
      });
      bars.push(notes);
    }
    return bars;
  }

  schedule(now, horizon) {
    if (this.nextTime < now - 0.25) this.nextTime = now + 0.03; // recover from timer stalls
    while (this.nextTime < horizon) {
      if (this.stopAt !== null && this.nextTime >= this.stopAt) return;
      this._step(this.step, this.nextTime);
      this.nextTime += this.stepDur;
      this.step++;
    }
  }

  _step(step, t) {
    const sys = this.sys;
    const cfg = this.cfg;
    const run = this.kind === 'run';
    const s = step & 15;
    const bar = step >> 4;
    const P = this.prog.length;
    const bi = bar % P;
    const cycle = Math.floor(bar / P);
    if (s === 0 && bi === 0 && cycle > 0 && cycle % 4 === 0) this.phrases[1] = this._genPhrase();
    const chord = this.prog[bi];
    const tt = t + (s & 1 ? cfg.swing * this.stepDur : 0);
    const lastBar = bi === P - 1;
    const dry = this.filter;
    const wet = this.send;

    for (const part of this.parts) {
      const ch = part.p ? part.p[s % part.p.length] : '.';
      switch (part.t) {
        case 'drum': {
          let v = ch === 'x' ? 1 : ch === 'o' ? 0.55 : 0;
          if (part.fill && run && lastBar && cycle % 2 === 1 && s >= 12) v = Math.max(v, 0.4 + (s - 12) * 0.15);
          if (!v && part.dense && run && s & 1) {
            const p = (sys._intensity - 0.35) * 0.9;
            if (p > 0 && this.rng() < p) v = 0.4;
          }
          if (v) sys._drum(part.i, tt, v * part.v, dry, ch === 'o');
          break;
        }
        case 'bass': {
          if (ch === '.') break;
          const deg = chord + (ch === '5' ? 4 : 0);
          const midi = this.degToMidi(cfg.root, deg) + (ch === 'o' ? 12 : 0);
          let len = 1;
          while (len < 4 && part.p[(s + len) % 16] === '.') len++;
          sys._synth(INST[part.i], tt, mtof(midi), len * this.stepDur * 0.85, part.v, dry, null);
          break;
        }
        case 'pad': {
          if (s !== 0) break;
          for (const m of this.chordTones(chord, cfg.root + 12)) {
            sys._synth(INST[part.i], tt, mtof(m), 16 * this.stepDur * 0.92, part.v, dry, wet);
          }
          break;
        }
        case 'stab': {
          if (ch === '.') break;
          for (const m of this.chordTones(chord, cfg.root + 15)) {
            sys._synth(INST[part.i], tt, mtof(m), this.stepDur * 1.2, part.v, dry, wet);
          }
          break;
        }
        case 'arp': {
          if (ch === '.') break;
          const tones = this.chordTones(chord, cfg.root + 24);
          tones.push(tones[0] + 12);
          const seq = [0, 1, 2, 3, 2, 1];
          const m = tones[seq[this.arpIdx++ % seq.length]];
          sys._synth(INST[part.i], tt, mtof(m), this.stepDur * 1.6, part.v * (ch === 'o' ? 0.6 : 1), dry, wet);
          break;
        }
        case 'lead': {
          const notes = this.phrases[this.plan[cycle % this.plan.length]][bi];
          for (const n of notes) {
            if (n.s !== s) continue;
            const midi = this.degToMidi(cfg.root + 12 * cfg.leadOct, n.d);
            sys._synth(INST[part.i], tt, mtof(midi), n.len * this.stepDur * 0.9, part.v * (n.acc ? 1 : 0.82), dry, wet);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  fadeOut(fade) {
    const ctx = this.sys.ctx;
    const now = ctx.currentTime;
    const f = Math.max(0.02, fade);
    // Compute the current level ourselves: AudioParam.value can lag behind
    // scheduled automation (e.g. a track created and faded in the same tick).
    const level = Math.min(1, Math.max(0, (now - this.fadeInAt) / XFADE));
    for (const [p, v] of [[this.out.gain, level], [this.send.gain, this.cfg.send]]) {
      p.cancelScheduledValues(now);
      p.setValueAtTime(v, now);
      p.linearRampToValueAtTime(0, now + f);
    }
    // A track that never really faded in stops at once (cheap rapid switching).
    this.stopAt = level < 0.05 ? now : now + f;
    this.killAt = level < 0.05 ? now + 0.1 : now + f + 1.5;
  }

  dispose() {
    try {
      this.filter.disconnect();
      this.out.disconnect();
      this.send.disconnect();
    } catch (e) {
      /* already disconnected */
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Ambience                                                                 */
/* ------------------------------------------------------------------------ */

class Ambience {
  constructor(sys, mapId) {
    const ctx = sys.ctx;
    this.sys = sys;
    this.ctx = ctx;
    this.mapId = mapId;
    this.nodes = [];
    this.sources = [];
    this.events = [];
    this.killAt = null;
    const now = ctx.currentTime;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.gain.setValueAtTime(0, now);
    this.out.gain.linearRampToValueAtTime(1, now + 1.2);
    this.fadeInAt = now;
    this.out.connect(sys.ambBus);
    this.nodes.push(this.out);
    AMBIENCES[mapId](this);
  }

  noise(rate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.sys.noiseBuf;
    src.loop = true;
    src.playbackRate.value = rate;
    src.start(this.ctx.currentTime, Math.random() * src.buffer.duration);
    this.sources.push(src);
    this.nodes.push(src);
    return src;
  }

  osc(type, freq) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start();
    this.sources.push(o);
    this.nodes.push(o);
    return o;
  }

  filter(type, freq, Q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    this.nodes.push(f);
    return f;
  }

  gain(v) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    this.nodes.push(g);
    return g;
  }

  /** LFO: sine oscillator scaled by depth, summed onto an AudioParam. */
  lfo(rate, depth, param, phaseDelay = 0) {
    const o = this.ctx.createOscillator();
    o.frequency.value = rate;
    const g = this.gain(depth);
    o.connect(g);
    g.connect(param);
    o.start(this.ctx.currentTime + phaseDelay);
    this.sources.push(o);
    this.nodes.push(o);
    return o;
  }

  chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  }

  every(range, fn) {
    this.events.push({ range, fn, next: this.ctx.currentTime + rand(range[0] * 0.3, range[1]) });
  }

  /** Optional random stereo position for one-shot ambient events. */
  panned(dest) {
    if (!this.ctx.createStereoPanner) return { input: dest, nodes: [] };
    const p = this.ctx.createStereoPanner();
    p.pan.value = rand(-0.8, 0.8);
    p.connect(dest);
    return { input: p, nodes: [p] };
  }

  tick(now) {
    if (this.killAt !== null) return;
    for (const ev of this.events) {
      if (now >= ev.next) {
        try {
          ev.fn(Math.max(now, ev.next) + 0.05);
        } catch (e) {
          /* ignore */
        }
        ev.next = now + rand(ev.range[0], ev.range[1]);
      }
    }
  }

  fadeOut(fade) {
    const now = this.ctx.currentTime;
    const g = this.out.gain;
    const v = Math.min(1, Math.max(0, (now - this.fadeInAt) / 1.2));
    g.cancelScheduledValues(now);
    g.setValueAtTime(v, now);
    g.linearRampToValueAtTime(0, now + Math.max(0.02, fade));
    this.killAt = v < 0.05 ? now + 0.05 : now + Math.max(0.02, fade) + 0.1;
  }

  dispose() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch (e) {
        /* not started / already stopped */
      }
    }
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch (e) {
        /* ignore */
      }
    }
    this.sources = [];
    this.nodes = [];
    this.events = [];
  }
}

const AMBIENCES = {
  metro(a) {
    a.chain(a.noise(0.5), a.filter('lowpass', 220, 0.7), a.gain(0.09), a.out); // traffic rumble
    a.chain(a.osc('sawtooth', 55), a.filter('lowpass', 170, 1), a.gain(0.02), a.out); // electrical hum
    const hg = a.gain(0.01);
    a.chain(a.osc('sine', 110), hg, a.out);
    a.lfo(0.15, 0.005, hg.gain);
    a.every([9, 20], (t) => {
      // distant two-tone horn, with a slight downward drift
      const ctx = a.ctx;
      const env = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 750;
      const pan = a.panned(a.out);
      lp.connect(env);
      env.connect(pan.input);
      env.connect(a.sys.fxIn);
      const dur = rand(0.5, 0.9);
      const peak = rand(0.012, 0.02);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(peak, t + 0.12);
      env.gain.setValueAtTime(peak, t + dur);
      env.gain.linearRampToValueAtTime(0, t + dur + 0.45);
      const oscs = [311.1, 370].map((f) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        o.frequency.linearRampToValueAtTime(f * 0.975, t + dur + 0.45);
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.5);
        return o;
      });
      oscs[0].onended = () => [...oscs, lp, env, ...pan.nodes].forEach((n) => n.disconnect());
    });
  },

  neon(a) {
    const rain = a.gain(0.045);
    a.chain(a.noise(1), a.filter('highpass', 1200), a.filter('lowpass', 7000), rain, a.out);
    a.lfo(0.2, 0.01, rain.gain);
    a.chain(a.noise(0.7), a.filter('bandpass', 3500, 0.5), a.gain(0.02), a.out);
    const buzz = a.gain(0.005);
    a.chain(a.osc('sawtooth', 120), a.filter('bandpass', 360, 4), buzz, a.out);
    a.every([1.5, 5], (t) => {
      // neon sign flicker + tiny crackle
      const g = buzz.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.005, t);
      g.linearRampToValueAtTime(0.018, t + 0.03);
      g.linearRampToValueAtTime(0.002, t + 0.08);
      g.linearRampToValueAtTime(0.014, t + 0.12);
      g.linearRampToValueAtTime(0.005, t + 0.25);
      a.sys._noiseHit(t, { dur: 0.04, peak: 0.015, type: 'highpass', f: 3500, dest: a.out });
    });
  },

  beach(a) {
    const g1 = a.gain(0.06);
    const f1 = a.filter('lowpass', 600, 0.5);
    a.chain(a.noise(1), f1, g1, a.out);
    a.lfo(0.085, 400, f1.frequency);
    a.lfo(0.085, 0.045, g1.gain);
    const g2 = a.gain(0.03);
    const f2 = a.filter('lowpass', 1000, 0.5);
    a.chain(a.noise(0.8), f2, g2, a.out);
    a.lfo(0.13, 600, f2.frequency, 1.7);
    a.lfo(0.13, 0.025, g2.gain, 1.7);
    const foam = a.gain(0.008);
    a.chain(a.noise(1.1), a.filter('highpass', 3000), foam, a.out);
    a.lfo(0.085, 0.006, foam.gain);
  },

  snow(a) {
    const wf = a.filter('bandpass', 600, 1.4);
    const wg = a.gain(0.06);
    a.chain(a.noise(1), wf, wg, a.out);
    const sf = a.filter('bandpass', 1600, 12);
    const sg = a.gain(0.12);
    a.chain(a.noise(0.9), sf, sg, a.out);
    a.chain(a.noise(0.5), a.filter('lowpass', 300), a.gain(0.03), a.out);
    a.every([0.8, 2.2], (t) => {
      wf.frequency.setTargetAtTime(rand(300, 1300), t, 0.8);
      wg.gain.setTargetAtTime(rand(0.03, 0.09), t, 1.0);
      sf.frequency.setTargetAtTime(rand(1000, 2200), t, 1.2);
      sg.gain.setTargetAtTime(rand(0.03, 0.18), t, 1.0);
    });
  },

  desert(a) {
    const df = a.filter('bandpass', 500, 0.7);
    const dg = a.gain(0.04);
    a.chain(a.noise(1), df, dg, a.out);
    a.chain(a.noise(1.2), a.filter('highpass', 4000), a.gain(0.006), a.out);
    const gf = a.filter('bandpass', 700, 0.8);
    const gg = a.gain(0);
    a.chain(a.noise(0.9), gf, gg, a.out);
    a.every([1, 3], (t) => {
      df.frequency.setTargetAtTime(rand(350, 800), t, 0.9);
      dg.gain.setTargetAtTime(rand(0.03, 0.05), t, 1.0);
    });
    a.every([6, 14], (t) => {
      // gust: swell up then die away
      gg.gain.setTargetAtTime(rand(0.06, 0.1), t, 0.5);
      gf.frequency.setTargetAtTime(rand(1100, 1600), t, 0.6);
      gg.gain.setTargetAtTime(0, t + rand(1.2, 2.2), 0.8);
      gf.frequency.setTargetAtTime(700, t + 1.8, 1.0);
    });
  },

  forest(a) {
    const lg = a.gain(0.012);
    a.chain(a.noise(1), a.filter('highpass', 2500), a.filter('lowpass', 8000), lg, a.out);
    a.chain(a.noise(0.5), a.filter('lowpass', 500), a.gain(0.015), a.out);
    a.every([0.4, 1.4], (t) => lg.gain.setTargetAtTime(rand(0.004, 0.028), t, 0.3));
    a.every([2.5, 7], (t) => {
      // bird: a few quick sine chirps
      const ctx = a.ctx;
      const pan = a.panned(a.out);
      const n = 2 + Math.floor(Math.random() * 4);
      const base = rand(2400, 4000);
      const up = Math.random() < 0.5;
      let t0 = t;
      const all = [...pan.nodes];
      let lastOsc = null;
      for (let i = 0; i < n; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const f = base * rand(0.95, 1.08);
        o.frequency.setValueAtTime(f, t0);
        o.frequency.exponentialRampToValueAtTime(f * (up ? 1.35 : 0.72), t0 + 0.06);
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(rand(0.015, 0.03), t0 + 0.008);
        g.gain.setTargetAtTime(0, t0 + 0.03, 0.015);
        o.connect(g);
        g.connect(pan.input);
        o.start(t0);
        o.stop(t0 + 0.14);
        all.push(o, g);
        lastOsc = o;
        t0 += rand(0.09, 0.15);
      }
      lastOsc.onended = () => all.forEach((nd) => nd.disconnect());
    });
  },
};

/* ------------------------------------------------------------------------ */
/* AudioSystem                                                              */
/* ------------------------------------------------------------------------ */

export class AudioSystem {
  constructor(volumes = { master: 0.8, music: 0.6, sfx: 0.8, muted: false }) {
    const v = volumes || {};
    this._vol = {
      master: clamp01(v.master, 0.8),
      music: clamp01(v.music, 0.6),
      sfx: clamp01(v.sfx, 0.8),
      muted: !!v.muted,
    };
    this.ctx = null;
    this._disposed = false;
    this._userSuspended = false;
    this._intensity = 0;
    this._ducked = false;
    this._tracks = [];
    this._current = null;
    this._amb = null;
    this._ambs = [];
    this._pendingMusic = null;
    this._pendingAmb = undefined;
    this._lastPlay = Object.create(null);
    this._runCount = 0;
    this._timer = null;
  }

  /* ---------------- lifecycle ---------------- */

  unlock() {
    if (this._disposed) return;
    try {
      if (!this.ctx) {
        const AC = getAudioContextCtor();
        if (!AC) return;
        try {
          this.ctx = new AC({ latencyHint: 'interactive' });
        } catch (e) {
          this.ctx = new AC();
        }
        this._build();
        // iOS-style unlock: play one silent sample inside the gesture.
        const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
        const s = this.ctx.createBufferSource();
        s.buffer = b;
        s.connect(this.ctx.destination);
        s.onended = () => s.disconnect();
        s.start();
        this._timer = setInterval(() => this._tick(), TICK_MS);
        if (this._pendingAmb !== undefined) {
          const id = this._pendingAmb;
          this._pendingAmb = undefined;
          this.setAmbience(id);
        }
        if (this._pendingMusic) {
          const { kind, mapId } = this._pendingMusic;
          this._pendingMusic = null;
          this.startMusic(kind, mapId);
        }
      }
      if (this.ctx.state === 'suspended' && !this._userSuspended) {
        const p = this.ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) {
      // Never let audio break the game.
      this.ctx = null;
    }
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  suspend() {
    this._userSuspended = true;
    if (!this.ctx) return;
    try {
      const p = this.ctx.suspend();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }

  resume() {
    this._userSuspended = false;
    if (!this.ctx) return;
    try {
      const p = this.ctx.resume();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }

  dispose() {
    this._disposed = true;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    for (const t of this._tracks) t.dispose();
    for (const a of this._ambs) a.dispose();
    this._tracks = [];
    this._ambs = [];
    this._current = null;
    this._amb = null;
    this._pendingMusic = null;
    this._pendingAmb = undefined;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) {
      try {
        const p = ctx.close();
        if (p && p.catch) p.catch(() => {});
      } catch (e) {
        /* ignore */
      }
    }
  }

  _build() {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 3);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -8;
    this.comp.knee.value = 6;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;
    this.comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this._masterTarget();
    this.master.connect(this.comp);

    this.duckGain = ctx.createGain();
    this.duckGain.gain.value = 1;
    this.duckGain.connect(this.master);
    this.duckFilter = ctx.createBiquadFilter();
    this.duckFilter.type = 'lowpass';
    this.duckFilter.frequency.value = 20000;
    this.duckFilter.Q.value = 0.5;
    this.duckFilter.connect(this.duckGain);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this._vol.music * MUSIC_TRIM;
    this.musicBus.connect(this.duckFilter);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this._vol.sfx;
    this.sfxBus.connect(this.master);

    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 1.3;
    this.ambBus.connect(this.musicBus);

    // Cheap "reverb": two damped feedback delays in parallel.
    this.fxIn = ctx.createGain();
    this.fxOut = ctx.createGain();
    this.fxOut.gain.value = 0.5;
    this.fxOut.connect(this.musicBus);
    this._fxNodes = [];
    for (const [time, fb] of [[0.23, 0.38], [0.37, 0.32]]) {
      const dl = ctx.createDelay(1);
      dl.delayTime.value = time;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      const g = ctx.createGain();
      g.gain.value = fb;
      this.fxIn.connect(dl);
      dl.connect(lp);
      lp.connect(g);
      g.connect(dl);
      lp.connect(this.fxOut);
      this._fxNodes.push(dl, lp, g);
    }
  }

  _masterTarget() {
    return this._vol.muted ? 0 : this._vol.master;
  }

  _intensityFreq() {
    return 4000 * Math.pow(2, this._intensity * 2);
  }

  _tick() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime;
      const horizon = now + LOOKAHEAD;
      for (const tr of this._tracks) tr.schedule(now, horizon);
      for (const a of this._ambs) a.tick(now);
      if (this._tracks.some((t) => t.killAt !== null && now > t.killAt)) {
        this._tracks = this._tracks.filter((t) => {
          if (t.killAt !== null && now > t.killAt) {
            t.dispose();
            return false;
          }
          return true;
        });
      }
      if (this._ambs.some((a) => a.killAt !== null && now > a.killAt)) {
        this._ambs = this._ambs.filter((a) => {
          if (a.killAt !== null && now > a.killAt) {
            a.dispose();
            return false;
          }
          return true;
        });
      }
    } catch (e) {
      /* keep ticking */
    }
  }

  /* ---------------- mix controls ---------------- */

  setVolumes({ master, music, sfx, muted } = {}) {
    if (master !== undefined) this._vol.master = clamp01(master, this._vol.master);
    if (music !== undefined) this._vol.music = clamp01(music, this._vol.music);
    if (sfx !== undefined) this._vol.sfx = clamp01(sfx, this._vol.sfx);
    if (muted !== undefined) this._vol.muted = !!muted;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this._masterTarget(), now, RAMP);
    this.musicBus.gain.setTargetAtTime(this._vol.music * MUSIC_TRIM, now, RAMP);
    this.sfxBus.gain.setTargetAtTime(this._vol.sfx, now, RAMP);
  }

  setIntensity(x) {
    this._intensity = clamp01(x, this._intensity);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const t of this._tracks) {
      if (t.kind === 'run' && t.stopAt === null) t.filter.frequency.setTargetAtTime(this._intensityFreq(), now, 0.3);
    }
  }

  duck(on) {
    this._ducked = !!on;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.duckGain.gain.setTargetAtTime(on ? 0.3 : 1, now, 0.12);
    this.duckFilter.frequency.setTargetAtTime(on ? 700 : 20000, now, 0.12);
  }

  /* ---------------- music ---------------- */

  startMusic(kind, mapId) {
    const k = kind === 'run' ? 'run' : 'menu';
    const m = MAP_IDS.includes(mapId) ? mapId : 'metro';
    if (this._disposed) return;
    if (!this.ctx) {
      this._pendingMusic = { kind: k, mapId: m };
      return;
    }
    try {
      const cur = this._current;
      if (cur && cur.kind === k && cur.mapId === m && cur.stopAt === null) return;
      if (cur && cur.stopAt === null) cur.fadeOut(XFADE);
      const salt = k === 'run' ? ++this._runCount : 0;
      const tr = new MusicTrack(this, k, m, salt);
      this._tracks.push(tr);
      this._current = tr;
    } catch (e) {
      /* ignore */
    }
  }

  stopMusic(fade = 0.5) {
    this._pendingMusic = null;
    if (!this.ctx) return;
    try {
      for (const t of this._tracks) if (t.stopAt === null) t.fadeOut(Number(fade) || 0);
      this._current = null;
    } catch (e) {
      /* ignore */
    }
  }

  setAmbience(mapId) {
    if (this._disposed) return;
    const id = MAP_IDS.includes(mapId) ? mapId : null;
    if (!this.ctx) {
      this._pendingAmb = id;
      return;
    }
    try {
      if (this._amb && this._amb.mapId === id && this._amb.killAt === null) return;
      if (this._amb) this._amb.fadeOut(1.0);
      this._amb = null;
      if (id) {
        this._amb = new Ambience(this, id);
        this._ambs.push(this._amb);
      }
    } catch (e) {
      /* ignore */
    }
  }

  /* ---------------- synthesis primitives ---------------- */

  /** Music voice from an INST preset. */
  _synth(spec, t, freq, dur, vel, dry, wet) {
    const ctx = this.ctx;
    const nodes = [];
    const env = ctx.createGain();
    nodes.push(env);
    let head = env;
    if (spec.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = spec.Q || 0.7;
      f.frequency.setValueAtTime(Math.min(spec.cutoff, 18000), t);
      if (spec.cutEnd) f.frequency.setTargetAtTime(spec.cutEnd, t + 0.005, spec.cutTime || 0.12);
      f.connect(env);
      head = f;
      nodes.push(f);
    }
    env.connect(dry);
    if (wet && spec.wet) env.connect(wet);

    const a = spec.attack;
    const g = env.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(vel, t + a);
    g.setTargetAtTime(vel * spec.sustain, t + a, spec.decay / 3);
    const relStart = Math.max(t + a, t + dur);
    g.setTargetAtTime(0, relStart, spec.release / 4);
    let stopAt = relStart + spec.release + 0.05;
    if (!spec.sustain) stopAt = Math.min(stopAt, t + a + spec.decay * 2 + 0.03);

    let vib = null;
    if (spec.vib) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = spec.vib.rate;
      vib = ctx.createGain();
      vib.gain.setValueAtTime(0, t);
      vib.gain.linearRampToValueAtTime(spec.vib.depth, t + 0.25);
      lfo.connect(vib);
      lfo.start(t);
      lfo.stop(stopAt);
      nodes.push(lfo, vib);
    }
    let first = null;
    for (const o of spec.oscs) {
      const osc = ctx.createOscillator();
      osc.type = o.type;
      osc.frequency.value = freq * (o.mult || 1);
      if (o.detune) osc.detune.value = o.detune;
      if (vib) vib.connect(osc.detune);
      const og = ctx.createGain();
      og.gain.setValueAtTime(o.gain, t);
      if (o.decay) og.gain.setTargetAtTime(0, t, o.decay / 3);
      osc.connect(og);
      og.connect(head);
      osc.start(t);
      osc.stop(stopAt);
      nodes.push(osc, og);
      if (!first) first = osc;
    }
    first.onended = () => {
      for (const n of nodes) n.disconnect();
    };
  }

  _noiseSrc(t, dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const maxOff = Math.max(0, this.noiseBuf.duration - dur - 0.05);
    src.start(t, Math.random() * maxOff);
    src.stop(t + dur);
    return src;
  }

  /** Enveloped oscillator for SFX. */
  _tone(t, o) {
    const ctx = this.ctx;
    const dest = o.dest || this.sfxBus;
    const a = o.a ?? 0.004;
    const dur = o.dur;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide ?? dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.peak, t + a);
    g.gain.setTargetAtTime(0, t + a + (o.hold || 0), dur / 4);
    const nodes = [osc, g];
    let out = osc;
    if (o.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.cutoff, t);
      if (o.cutoff2) f.frequency.exponentialRampToValueAtTime(o.cutoff2, t + dur);
      f.Q.value = o.q || 0.7;
      osc.connect(f);
      out = f;
      nodes.push(f);
    }
    out.connect(g);
    g.connect(dest);
    const stopAt = t + a + (o.hold || 0) + dur * 1.3 + 0.02;
    if (o.vib) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.vib.rate;
      const lg = ctx.createGain();
      lg.gain.value = o.vib.depth;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(stopAt);
      nodes.push(lfo, lg);
    }
    osc.start(t);
    osc.stop(stopAt);
    osc.onended = () => nodes.forEach((n) => n.disconnect());
  }

  /** Filtered noise burst. */
  _noiseHit(t, o) {
    const ctx = this.ctx;
    const dest = o.dest || this.sfxBus;
    const a = o.a ?? 0.003;
    const total = a + (o.hold || 0) + o.dur * 1.3 + 0.02;
    const src = this._noiseSrc(t, total);
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f || 2000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide ?? o.dur));
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.peak, t + a);
    g.gain.setTargetAtTime(0, t + a + (o.hold || 0), o.dur / 4);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.onended = () => {
      src.disconnect();
      f.disconnect();
      g.disconnect();
    };
  }

  _drum(name, t, vel, dest, alt) {
    switch (name) {
      case 'kick': {
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.13);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vel, t + 0.003);
        g.gain.setTargetAtTime(0, t + 0.02, 0.07);
        o.connect(g);
        g.connect(dest);
        o.start(t);
        o.stop(t + 0.45);
        o.onended = () => {
          o.disconnect();
          g.disconnect();
        };
        break;
      }
      case 'snare':
        this._noiseHit(t, { dur: 0.16, peak: vel * 0.8, type: 'bandpass', f: 1900, q: 0.9, a: 0.002, dest });
        this._tone(t, { type: 'triangle', f: 200, f2: 150, dur: 0.08, peak: vel * 0.45, a: 0.002, dest });
        break;
      case 'clap':
        for (let i = 0; i < 3; i++) {
          this._noiseHit(t + i * 0.011, { dur: i === 2 ? 0.14 : 0.02, peak: vel * (i === 2 ? 0.8 : 0.6), type: 'bandpass', f: 1300, q: 1.4, a: 0.002, dest });
        }
        break;
      case 'hat':
        this._noiseHit(t, { dur: alt ? 0.05 : 0.07, peak: vel, type: 'highpass', f: 7500, q: 0.7, a: 0.002, dest });
        break;
      case 'shaker':
        this._noiseHit(t, { dur: 0.08, peak: vel, type: 'bandpass', f: 5500, q: 1.2, a: 0.012, dest });
        break;
      case 'rim':
        this._tone(t, { type: 'triangle', f: 900, dur: 0.04, peak: vel * 0.6, a: 0.001, dest });
        this._noiseHit(t, { dur: 0.03, peak: vel * 0.5, type: 'bandpass', f: 3000, q: 1.5, a: 0.001, dest });
        break;
      case 'hand':
        if (alt) {
          // "tek": bright slap
          this._noiseHit(t, { dur: 0.05, peak: vel * 0.7, type: 'bandpass', f: 3200, q: 2, a: 0.001, dest });
          this._tone(t, { type: 'triangle', f: 620, f2: 560, dur: 0.05, peak: vel * 0.35, a: 0.001, dest });
        } else {
          // "doum": deep tone
          this._tone(t, { type: 'sine', f: 190, f2: 115, glide: 0.15, dur: 0.3, peak: vel, a: 0.002, dest });
          this._noiseHit(t, { dur: 0.04, peak: vel * 0.3, type: 'lowpass', f: 900, a: 0.001, dest });
        }
        break;
      default:
        break;
    }
  }

  /* ---------------- SFX ---------------- */

  play(name, opts = {}) {
    const ctx = this.ctx;
    if (!ctx || this._userSuspended || ctx.state === 'closed') return;
    const fn = SFX[name];
    if (!fn) return;
    const now = ctx.currentTime;
    const last = this._lastPlay[name];
    if (last !== undefined && now - last < 0.02 && now >= last) return; // anti-spam
    this._lastPlay[name] = now;
    try {
      fn(this, now + 0.005, opts || {});
    } catch (e) {
      /* ignore */
    }
  }
}

const SFX = {
  coin(s, t, o) {
    const combo = Math.max(0, Math.floor(Number(o.combo) || 0));
    const idx = combo > 0 ? (combo - 1) % COIN_STEPS.length : 0;
    const f1 = mtof(81) * Math.pow(2, COIN_STEPS[idx] / 12);
    const f2 = f1 * Math.pow(2, 5 / 12);
    s._tone(t, { f: f1, dur: 0.07, peak: 0.15, a: 0.002 });
    s._tone(t, { f: f1 * 2, dur: 0.04, peak: 0.035, a: 0.002 });
    s._tone(t + 0.055, { f: f2, dur: 0.2, peak: 0.15, a: 0.002 });
    s._tone(t + 0.055, { f: f2 * 2, dur: 0.07, peak: 0.035, a: 0.002 });
  },
  jump(s, t) {
    s._tone(t, { type: 'triangle', f: 320, f2: 640, glide: 0.12, dur: 0.14, peak: 0.17 });
    s._tone(t, { f: 640, f2: 1280, glide: 0.1, dur: 0.08, peak: 0.045 });
    s._noiseHit(t, { dur: 0.1, peak: 0.045, f: 1200, f2: 3000, q: 1.2, a: 0.01 });
  },
  superJump(s, t) {
    s._tone(t, { type: 'triangle', f: 220, f2: 880, glide: 0.25, dur: 0.3, peak: 0.18 });
    s._tone(t, { type: 'square', f: 330, f2: 1320, glide: 0.25, dur: 0.25, peak: 0.04, cutoff: 2000 });
    [1568, 2093, 2637].forEach((f, i) => s._tone(t + 0.08 + i * 0.06, { f, dur: 0.12, peak: 0.055 }));
    s._noiseHit(t, { dur: 0.3, peak: 0.06, f: 600, f2: 4000, q: 1, a: 0.03 });
  },
  roll(s, t) {
    s._noiseHit(t, { dur: 0.22, peak: 0.13, f: 2500, f2: 500, q: 1.5, a: 0.02 });
    s._tone(t, { f: 200, f2: 110, dur: 0.12, peak: 0.07 });
  },
  lane(s, t) {
    s._noiseHit(t, { dur: 0.09, peak: 0.08, f: 1800, f2: 3600, q: 2, a: 0.01 });
    s._tone(t, { f: 520, f2: 640, dur: 0.04, peak: 0.025 });
  },
  land(s, t) {
    s._tone(t, { f: 140, f2: 55, glide: 0.08, dur: 0.12, peak: 0.24, a: 0.002 });
    s._noiseHit(t, { dur: 0.06, peak: 0.07, type: 'lowpass', f: 700, a: 0.002 });
  },
  powerup(s, t) {
    const notes = [72, 76, 79, 84, 88];
    notes.forEach((m, i) => {
      const last = i === notes.length - 1;
      s._tone(t + i * 0.055, { type: 'triangle', f: mtof(m), dur: last ? 0.3 : 0.12, peak: 0.11 });
      s._tone(t + i * 0.055, { f: mtof(m + 12), dur: last ? 0.2 : 0.08, peak: 0.035 });
    });
  },
  powerdown(s, t) {
    [79, 76, 72, 67].forEach((m, i) => {
      const f = mtof(m);
      s._tone(t + i * 0.08, { type: 'triangle', f, f2: f * 0.97, dur: i === 3 ? 0.25 : 0.1, peak: 0.1, cutoff: 2500 });
    });
  },
  magnet(s, t) {
    s._tone(t, { f: 400, f2: 800, glide: 0.35, dur: 0.4, peak: 0.1, a: 0.02, vib: { rate: 18, depth: 30 } });
    s._tone(t, { type: 'triangle', f: 800, f2: 1600, glide: 0.35, dur: 0.3, peak: 0.035, a: 0.02 });
  },
  shield(s, t) {
    s._tone(t, { type: 'triangle', f: 300, f2: 900, glide: 0.2, dur: 0.2, peak: 0.06 });
    [784, 1175, 1568].forEach((f, i) => s._tone(t + 0.03 * i, { f, dur: 0.5, peak: 0.065, a: 0.01 }));
    s._noiseHit(t, { dur: 0.3, peak: 0.025, type: 'highpass', f: 6000, a: 0.05 });
  },
  shieldBreak(s, t) {
    s._noiseHit(t, { dur: 0.25, peak: 0.12, f: 4000, f2: 1500, q: 3, a: 0.002 });
    [[1760, 1320], [2349, 1760], [2960, 2217]].forEach(([f, f2], i) =>
      s._tone(t + i * 0.02, { type: 'triangle', f, f2, dur: 0.25, peak: 0.045, a: 0.002 }));
    s._tone(t, { f: 180, f2: 80, dur: 0.15, peak: 0.12, a: 0.002 });
  },
  hoverStart(s, t) {
    s._tone(t, { type: 'sawtooth', f: 110, f2: 220, glide: 0.4, dur: 0.45, peak: 0.07, a: 0.03, cutoff: 400, cutoff2: 2400 });
    s._tone(t, { f: 220, f2: 440, glide: 0.4, dur: 0.4, peak: 0.07, a: 0.03 });
    s._noiseHit(t, { dur: 0.4, peak: 0.04, f: 800, f2: 2400, q: 1, a: 0.1 });
  },
  hoverBreak(s, t) {
    s._tone(t, { type: 'square', f: 440, f2: 110, glide: 0.3, dur: 0.3, peak: 0.06, cutoff: 1500 });
    s._noiseHit(t, { dur: 0.25, peak: 0.1, type: 'lowpass', f: 1200, f2: 300, a: 0.003 });
    s._tone(t, { f: 160, f2: 60, dur: 0.2, peak: 0.12, a: 0.002 });
  },
  jetpackStart(s, t) {
    s._noiseHit(t, { dur: 0.6, peak: 0.14, type: 'lowpass', f: 400, f2: 3000, glide: 0.5, q: 2, a: 0.08 });
    s._tone(t, { f: 60, f2: 90, dur: 0.5, peak: 0.14, a: 0.05 });
    s._tone(t, { type: 'triangle', f: 300, f2: 900, dur: 0.4, peak: 0.045, a: 0.05 });
  },
  stumble(s, t) {
    s._tone(t, { type: 'triangle', f: 330, f2: 247, dur: 0.1, peak: 0.11 });
    s._tone(t + 0.1, { type: 'triangle', f: 262, f2: 196, dur: 0.15, peak: 0.11 });
    s._noiseHit(t, { dur: 0.08, peak: 0.09, type: 'lowpass', f: 900, a: 0.002 });
    s._tone(t, { f: 120, f2: 60, dur: 0.1, peak: 0.14, a: 0.002 });
  },
  crash(s, t) {
    s._noiseHit(t, { dur: 0.55, peak: 0.32, type: 'lowpass', f: 4000, f2: 200, glide: 0.5, q: 0.7, a: 0.002 });
    s._noiseHit(t, { dur: 0.12, peak: 0.14, f: 1500, q: 1, a: 0.001 });
    s._tone(t, { f: 110, f2: 35, glide: 0.35, dur: 0.45, peak: 0.38, a: 0.002 });
    s._tone(t, { type: 'triangle', f: 220, f2: 55, dur: 0.3, peak: 0.07, a: 0.002 });
  },
  gameover(s, t) {
    const seq = [[67, 0, 0.18], [63, 0.2, 0.18], [60, 0.4, 0.2], [55, 0.62, 0.7]];
    for (const [m, dt, dur] of seq) {
      const last = m === 55;
      s._tone(t + dt, { type: 'triangle', f: mtof(m), dur, peak: 0.13, a: 0.01, hold: last ? 0.15 : 0.05, vib: last ? { rate: 5, depth: 3 } : null });
      s._tone(t + dt, { type: 'square', f: mtof(m), dur, peak: 0.03, a: 0.01, cutoff: 1200, hold: last ? 0.15 : 0.05 });
      if (last) s._tone(t + dt, { f: mtof(m - 12), dur, peak: 0.1, a: 0.02, hold: 0.15 });
    }
  },
  click(s, t) {
    s._tone(t, { f: 1100, dur: 0.035, peak: 0.09, a: 0.002 });
    s._tone(t, { type: 'triangle', f: 2200, dur: 0.02, peak: 0.025, a: 0.002 });
  },
  mission(s, t) {
    [72, 76, 79].forEach((m, i) => {
      s._tone(t + i * 0.09, { type: 'triangle', f: mtof(m), dur: 0.1, peak: 0.1 });
      s._tone(t + i * 0.09, { type: 'square', f: mtof(m), dur: 0.08, peak: 0.025, cutoff: 2500 });
    });
    [76, 79, 84].forEach((m) => {
      s._tone(t + 0.3, { type: 'triangle', f: mtof(m), dur: 0.5, peak: 0.075, a: 0.01, hold: 0.1 });
    });
    s._tone(t + 0.3, { f: mtof(96), dur: 0.3, peak: 0.03, a: 0.005 });
  },
  unlock(s, t) {
    [84, 88, 91, 96, 100].forEach((m, i) => {
      s._tone(t + i * 0.05, { f: mtof(m), dur: 0.25, peak: 0.07, a: 0.002 });
      s._tone(t + i * 0.05, { f: mtof(m) * 3, dur: 0.06, peak: 0.015, a: 0.002 });
    });
    [60, 67, 76].forEach((m) => s._tone(t, { type: 'triangle', f: mtof(m), dur: 0.6, peak: 0.045, a: 0.05, hold: 0.1 }));
    s._noiseHit(t, { dur: 0.5, peak: 0.022, type: 'highpass', f: 7000, a: 0.1 });
  },
  countdown(s, t, o) {
    const hi = !!(o.final || o.go || o.n === 0 || o.step === 0 || o.value === 0);
    const f = hi ? 1318.5 : 659.25;
    const dur = hi ? 0.35 : 0.14;
    s._tone(t, { f, dur, peak: 0.13, a: 0.003, hold: hi ? 0.08 : 0.02 });
    s._tone(t, { type: 'triangle', f: f * 2, dur: dur * 0.5, peak: 0.03, a: 0.003 });
  },
};

export default AudioSystem;
