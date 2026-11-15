// Interface : navigation entre écrans, listes (cartes, versions,
// personnages, hoverboards, missions), paramètres, studio et HUD.
// Construction DOM sans innerHTML pour les données (pas d'injection HTML).
import { MAPS, getMap } from '../data/maps.js';
import { BOARDS, CHARACTERS, COIN_SKINS, MODES, VERSIONS } from '../data/catalog.js';
import { missionDef } from '../gameplay/Missions.js';
import { ensureMissions } from '../gameplay/Missions.js';
import { HAIR_STYLES, ACCESSORIES } from '../models/Character.js';
import { AssetDB } from '../core/Storage.js';

const $ = (id) => document.getElementById(id);
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const fmt = (n) => Math.floor(n).toLocaleString('fr-FR');
// Limite la fréquence d'un traitement coûteux (glisser un sélecteur de couleur
// déclenche des centaines d'événements) ; la dernière valeur est toujours appliquée.
function throttle(fn, ms = 150) {
  let last = 0;
  let timer = null;
  return (...args) => {
    const run = () => { last = performance.now(); timer = null; fn(...args); };
    const wait = ms - (performance.now() - last);
    clearTimeout(timer);
    if (wait <= 0) run();
    else timer = setTimeout(run, wait);
  };
}
const POWER_INFO = {
  magnet: ['Aimant', '#ff4d5e'], jetpack: ['Jetpack', '#ffd23a'], multiplier: ['Score ×2', '#b07aff'],
  sneakers: ['Sneakers', '#2fe07a'], shield: ['Bouclier', '#3aa8ff'], hoverboard: ['Hoverboard', '#65d9ff'],
};

export class UI {
  constructor() {
    this.current = 'boot';
    this.prev = 'menu';
    this.hudCache = {};
    this.base = import.meta.env?.BASE_URL ?? './';
  }

  attach(game, storage, audio) {
    this.game = game;
    this.storage = storage;
    this.save = storage.data;
    this.audio = audio;
    document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => this.nav(b.dataset.nav)));
    this.bindSettings();
    this.bindStudio();
    $('buyboard').addEventListener('click', () => this.buyBoard());
    $('m-fullscreen').addEventListener('click', () => { this.click(); this.toggleFullscreen(); });
    document.addEventListener('fullscreenchange', () => { $('m-fullscreen').textContent = document.fullscreenElement ? '🗗' : '⛶'; setTimeout(() => this.game.resize(), 150); });
    if (!document.fullscreenEnabled) $('m-fullscreen').classList.add('hidden');
    this.bindHistory();
    this.renderModes();
    this.applyBodyClasses();
  }

  // ---- intégration mobile --------------------------------------------------------
  vibrate(pattern) {
    if (this.save.settings.vibrate && navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch { /* non pris en charge */ }
    }
  }

  async toggleFullscreen(force) {
    try {
      const want = force ?? !document.fullscreenElement;
      if (want && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      else if (!want && document.fullscreenElement) await document.exitFullscreen();
    } catch { /* refusé par le navigateur : sans conséquence */ }
  }

  // Bouton « retour » d'Android : pause en course, retour au menu ailleurs (au lieu de quitter le site).
  bindHistory() {
    try {
      history.replaceState({ mnn: 'root' }, '');
      history.pushState({ mnn: 'game' }, '');
    } catch { return; }
    window.addEventListener('popstate', () => {
      const g = this.game;
      let handled = true;
      if (g.state === 'playing') g.pause();
      else if (this.current === 'studio') this.closeStudio();
      else if (this.current === 'settings') this.showScreen(this.prev === 'pause' ? 'pause' : 'menu');
      else if (this.current === 'pause') g.resume();
      else if (this.current === 'gameover') g.quitToMenu();
      else if (['maps', 'characters', 'boards', 'versions', 'missions'].includes(this.current)) this.nav('menu');
      else if (this.current === 'menu') handled = false;
      // chargement, erreur fatale, contexte perdu : on ne touche à rien
      if (handled) {
        try { history.pushState({ mnn: 'game' }, ''); } catch { /* ignoré */ }
      } else history.back(); // depuis le menu : on quitte vraiment
    });
  }

  click() {
    this.audio.unlock();
    this.audio.play('click');
  }

  nav(to) {
    this.click();
    const g = this.game;
    switch (to) {
      case 'reload': location.reload(); return;
      case 'play': g.startRun(); return;
      case 'resume': g.resume(); return;
      case 'restart': g.startRun(); return;
      case 'replayseed': g.startRun(g.seed); return;
      case 'quit': g.quitToMenu(); return;
      case 'back': this.showScreen(this.prev === 'pause' ? 'pause' : 'menu'); return;
      case 'studio': this.openStudio(); return;
      case 'studio-exit': this.closeStudio(); return;
      case 'menu': g.menuAnim = 'menu'; g.applyCharacter(); g.applyBoard(); this.showScreen('menu'); return;
      case 'characters': g.menuAnim = 'idle'; this.renderCharacters(); this.showScreen('characters'); return;
      case 'boards': g.menuAnim = 'hoverboard'; this.renderBoards(); this.showScreen('boards'); return;
      case 'maps': this.renderMaps(); this.showScreen('maps'); return;
      case 'versions': this.renderVersions(); this.showScreen('versions'); return;
      case 'missions': g.menuAnim = 'victory'; this.renderMissions(); this.showScreen('missions'); return;
      case 'settings': this.prev = this.current; this.syncSettings(); this.showScreen('settings'); return;
    }
  }

  showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    if (id !== 'settings') this.prev = id;
    this.current = id;
    document.body.classList.toggle('playing', id === 'hud');
    if (id === 'menu') this.renderMenu();
  }

  boot(progress, msg) {
    $('loadfill').style.width = `${Math.round(progress * 100)}%`;
    if (msg) $('bootmsg').textContent = msg;
  }

  fatal(msg) {
    $('fatalmsg').textContent = msg;
    this.showScreen('fatal');
  }

  toast(text, kind = '') {
    const box = $('toasts');
    const t = h('div', { class: `toast ${kind}`, text });
    box.append(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), 2500);
  }

  applyBodyClasses() {
    document.body.classList.toggle('no-touchpad', !this.save.settings.touchButtons);
    $('h-fps').classList.toggle('hidden', !this.save.settings.showFps);
  }

  // ---- menu ----------------------------------------------------------------------
  renderMenu() {
    const s = this.save;
    const v = this.game.version();
    const map = this.game.map || getMap(this.game.effectiveMapId());
    $('m-bank').textContent = fmt(s.bank);
    $('m-boards').textContent = s.hoverboards;
    $('m-best').textContent = fmt(s.best);
    $('m-mult').textContent = `×${s.missions.level}`;
    $('m-mode').textContent = this.game.mode().name;
    $('m-edition').textContent = `${v.name} · ${v.version}`;
    $('m-mapname').textContent = map.name;
    $('m-maptag').textContent = map.tagline;
    ensureMissions(s.missions);
    const ready = s.missions.active.filter((m) => m.done && !m.claimed).length;
    $('m-missionbadge').textContent = ready ? String(ready) : '';
  }

  onMapChanged() {
    if (this.current === 'menu') this.renderMenu();
  }

  renderMaps() {
    const v = this.game.version();
    const lock = $('maplock');
    lock.classList.toggle('hidden', !v.lockMap);
    lock.textContent = v.lockMap ? `L'édition « ${v.name} » impose sa carte. Choisis MNNROW Ultimate dans Versions pour changer librement.` : '';
    const list = $('maplist');
    list.replaceChildren(...MAPS.map((m) => {
      const sel = this.game.effectiveMapId() === m.id;
      return h('div', { class: `card${sel ? ' sel' : ''}` },
        h('img', { class: 'thumb', src: this.base + m.thumbnail, alt: `Aperçu ${m.name}`, loading: 'lazy', onerror: (e) => { e.target.style.visibility = 'hidden'; } }),
        h('h4', { text: m.name }),
        h('p', { class: 'muted small', text: m.tagline }),
        h('div', { class: 'tags' }, ...[m.ambience.particles !== 'none' ? `Ambiance : ${{ rain: 'pluie', snow: 'neige', dust: 'poussière', leaves: 'feuilles' }[m.ambience.particles]}` : null, `Trains : ${[...new Set(m.trains.variants)].join(', ')}`].filter(Boolean).map((t) => h('span', { text: t }))),
        h('div', { class: 'actions' }, h('button', {
          class: `btn small ${sel ? '' : 'primary'}`,
          disabled: v.lockMap || sel,
          text: sel ? 'Sélectionnée' : 'Choisir',
          onclick: () => { this.click(); this.game.setMap(m.id); this.renderMaps(); },
        })));
    }));
  }

  renderVersions() {
    const list = $('versionlist');
    list.replaceChildren(...VERSIONS.map((v) => {
      const sel = this.save.selected.version === v.id;
      const map = v.map ? getMap(v.map) : null;
      return h('div', { class: `card${sel ? ' sel' : ''}` },
        h('img', { class: 'thumb', src: this.base + (map ? map.thumbnail : 'assets/maps/ultimate.jpg'), alt: `Image ${v.name}`, loading: 'lazy', onerror: (e) => { e.target.src = this.base + MAPS[0].thumbnail; } }),
        h('div', { class: 'row-between' }, h('h4', { text: `${v.name}` }), h('span', { class: `badge${v.disabled ? ' dev' : ''}`, text: v.status })),
        h('p', { class: 'small', text: `Version ${v.version} · ${v.date ? `Sortie : ${new Date(v.date).toLocaleDateString('fr-FR')}` : 'Date : à venir'}${v.dateNote ? ` (${v.dateNote})` : ''}` }),
        h('p', { class: 'small muted', text: `Carte : ${map ? map.name : v.disabled ? '—' : 'au choix (6 cartes)'}` }),
        h('p', { class: 'small', text: v.description }),
        h('div', { class: 'tags' }, ...v.highlights.map((t) => h('span', { text: t }))),
        h('div', { class: 'actions' }, h('button', {
          class: `btn small ${sel ? '' : 'primary'}`,
          disabled: v.disabled || sel,
          text: v.disabled ? 'En développement' : sel ? 'Chargée' : 'Charger cette édition',
          onclick: () => {
            this.click();
            if (this.game.setVersion(v.id)) this.toast(`${v.name} chargée`, 'power');
            this.renderVersions();
          },
        })));
    }));
  }

  renderModes() {
    const box = $('modes');
    box.replaceChildren(...MODES.map((m) => h('button', {
      class: this.save.selected.mode === m.id ? 'on' : '',
      role: 'radio',
      'aria-checked': this.save.selected.mode === m.id ? 'true' : 'false',
      title: m.description,
      text: m.name,
      onclick: () => { this.click(); this.save.selected.mode = m.id; this.storage.save(); this.renderModes(); this.toast(`${m.name} : ${m.description}`); },
    })));
  }

  renderCharacters() {
    const s = this.save;
    $('charlist').replaceChildren(...CHARACTERS.map((c) => {
      const owned = s.unlocked.characters.includes(c.id);
      const sel = s.selected.character === c.id;
      const L = c.look;
      return h('div', { class: `card${sel ? ' sel' : ''}` },
        h('div', { class: 'swatches' }, ...[L.hairColor, L.skin, L.shirt, L.pants, L.shoes].map((col) => h('span', { style: { background: col } }))),
        h('h4', { text: c.name }),
        h('p', { class: 'small muted', text: `${{ spiky: 'Pics', short: 'Courte', bun: 'Chignon', mohawk: 'Crête', long: 'Longue' }[L.hair]} · ${L.accessories.map((a) => ({ cap: 'casquette', headphones: 'casque audio', glasses: 'lunettes', backpack: 'sac à dos', scarf: 'écharpe' }[a])).join(', ') || 'aucun accessoire'}` }),
        h('div', { class: 'actions' }, owned
          ? h('button', { class: `btn small ${sel ? '' : 'primary'}`, disabled: sel, text: sel ? 'Équipé' : 'Choisir', onclick: () => { this.click(); s.selected.character = c.id; s.look = {}; this.storage.save(); this.game.applyCharacter(); this.renderCharacters(); } })
          : h('button', { class: 'btn small', disabled: s.bank < c.price, text: `Débloquer · ${fmt(c.price)}`, onclick: () => this.buy('characters', c) })),
        h('button', { class: 'btn small ghost', text: 'Aperçu', onclick: () => { this.click(); this.game.player.setLook({ ...L }); } }));
    }));
  }

  renderBoards() {
    const s = this.save;
    $('b-stock').textContent = s.hoverboards;
    $('buyboard').disabled = s.bank < 300;
    $('boardlist').replaceChildren(...BOARDS.map((b) => {
      const owned = s.unlocked.boards.includes(b.id);
      const sel = s.selected.board === b.id;
      return h('div', { class: `card${sel ? ' sel' : ''}` },
        h('div', { class: 'swatches' }, h('span', { style: { background: b.color } }), h('span', { style: { background: b.color2 } })),
        h('h4', { text: b.name }),
        h('div', { class: 'actions' }, owned
          ? h('button', { class: `btn small ${sel ? '' : 'primary'}`, disabled: sel, text: sel ? 'Équipé' : 'Choisir', onclick: () => { this.click(); s.selected.board = b.id; s.board = { color: null, color2: null }; this.storage.save(); this.game.applyBoard(); this.renderBoards(); } })
          : h('button', { class: 'btn small', disabled: s.bank < b.price, text: `Débloquer · ${fmt(b.price)}`, onclick: () => this.buy('boards', b) })),
        h('button', { class: 'btn small ghost', text: 'Aperçu', onclick: () => { this.click(); this.game.player.setBoard(b.id, b.color, b.color2); } }));
    }));
  }

  buy(kind, item) {
    const s = this.save;
    if (s.bank < item.price) return this.toast('Pas assez de pièces', 'warn');
    s.bank -= item.price;
    s.unlocked[kind].push(item.id);
    this.audio.play('unlock');
    this.storage.save();
    this.toast(`${item.name} débloqué !`, 'power');
    kind === 'boards' ? this.renderBoards() : this.renderCharacters();
  }

  buyBoard() {
    const s = this.save;
    if (s.bank < 300) return this.toast('Pas assez de pièces', 'warn');
    s.bank -= 300;
    s.hoverboards++;
    this.audio.play('unlock');
    this.storage.save();
    this.renderBoards();
  }

  renderMissions() {
    const s = this.save;
    ensureMissions(s.missions);
    $('mi-level').textContent = s.missions.level;
    $('mi-mult').textContent = `×${s.missions.level}`;
    $('mi-total').textContent = s.missions.completedTotal;
    $('missionlist').replaceChildren(...s.missions.active.map((m) => {
      const d = missionDef(m.id);
      const pct = Math.min(100, (m.progress / d.target) * 100);
      return h('div', { class: `card${m.done ? ' sel' : ''}` },
        h('h4', { text: d.label }),
        h('div', { class: 'progress' }, h('div', { style: { width: `${pct}%` } })),
        h('p', { class: 'small muted', text: `${fmt(m.progress)} / ${fmt(d.target)} · ${d.scope === 'run' ? 'en une partie' : 'cumulé'} · récompense ${d.reward} pièces` }),
        m.done ? h('span', { class: 'badge', text: m.claimed ? 'récompense reçue' : 'réussie — récompense versée en fin de partie' }) : null);
    }));
    const st = s.stats;
    const rows = [['Parties', st.runs], ['Record', s.best], ['Meilleure distance', `${fmt(s.bestDistance)} m`], ['Pièces totales', st.coins], ['Distance totale', `${fmt(st.distance)} m`], ['Sauts', st.jumps], ['Roulades', st.rolls], ['Bonus utilisés', st.powerups], ['Hoverboards utilisés', st.boards], ['Toits de trains', st.trainTops]];
    $('statlist').replaceChildren(...rows.map(([k, v]) => h('div', {}, h('small', { text: k }), h('b', { text: typeof v === 'number' ? fmt(v) : v }))));
  }

  // ---- paramètres ----------------------------------------------------------------
  syncSettings() {
    const st = this.save.settings;
    $('s-quality').value = st.quality;
    $('s-shadows').value = st.shadows === null ? 'auto' : st.shadows ? 'on' : 'off';
    $('s-reduced').checked = st.reducedMotion;
    $('s-fps').checked = st.showFps;
    $('s-touch').checked = st.touchButtons;
    $('s-vibrate').checked = st.vibrate;
    $('s-autofs').checked = st.autoFullscreen;
    $('s-swipe').value = st.swipeSensitivity;
    $('s-master').value = st.master;
    $('s-music').value = st.music;
    $('s-sfx').value = st.sfx;
    $('s-mute').checked = st.muted;
    $('s-autopilot').checked = !!this.game.autopilot;
    if (this.save.lastSeed && !$('s-seed').value) $('s-seed').value = this.save.lastSeed;
    const i = this.game.r.info();
    $('s-perf').textContent = `Profil actif : ${i.profile} · résolution ×${i.dpr.toFixed(2)} · ${i.fps.toFixed(0)} FPS mesurés · ${i.calls} draw calls`;
    $('s-version').textContent = `MNNROW ${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'} · rendu ${this.game.r.renderer.capabilities.isWebGL2 ? 'WebGL 2' : 'WebGL 1'} · personnage : ${this.game.assets.source.character === 'glb' ? 'modèle GLB' : 'généré'}`;
  }

  bindSettings() {
    const st = () => this.save.settings;
    const persist = () => this.storage.save();
    $('s-quality').addEventListener('change', (e) => {
      st().quality = e.target.value;
      this.game.r.setQuality(e.target.value);
      this.game.env.invalidate();
      persist();
      if (e.target.value === 'high' && !this.game.r.profile.antialias) this.toast('L\'anticrénelage HIGH s\'appliquera au prochain chargement.');
    });
    $('s-shadows').addEventListener('change', (e) => {
      const v = e.target.value === 'auto' ? null : e.target.value === 'on';
      st().shadows = v;
      this.game.r.setShadows(v);
      persist();
    });
    $('s-reduced').addEventListener('change', (e) => { st().reducedMotion = e.target.checked; this.game.setReducedMotion(e.target.checked); persist(); });
    $('s-fps').addEventListener('change', (e) => { st().showFps = e.target.checked; this.applyBodyClasses(); persist(); });
    $('s-touch').addEventListener('change', (e) => { st().touchButtons = e.target.checked; this.applyBodyClasses(); persist(); });
    $('s-vibrate').addEventListener('change', (e) => { st().vibrate = e.target.checked; persist(); if (e.target.checked) this.vibrate(30); });
    $('s-autofs').addEventListener('change', (e) => { st().autoFullscreen = e.target.checked; persist(); });
    $('s-swipe').addEventListener('input', (e) => { st().swipeSensitivity = Number(e.target.value); if (this.game.controls) this.game.controls.sensitivity = st().swipeSensitivity; persist(); });
    for (const k of ['master', 'music', 'sfx']) $(`s-${k}`).addEventListener('input', (e) => { st()[k] = Number(e.target.value); this.audio.setVolumes(st()); persist(); });
    $('s-mute').addEventListener('change', (e) => { st().muted = e.target.checked; this.audio.setVolumes(st()); persist(); });
    $('s-autopilot').addEventListener('change', (e) => { this.game.autopilot = e.target.checked; });
    $('s-seedplay').addEventListener('click', () => {
      const v = $('s-seed').value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
      if (!v) return this.toast('Entre une graine (lettres et chiffres).', 'warn');
      this.click();
      this.game.startRun(v);
    });
    $('s-reset').addEventListener('click', async () => {
      if (!confirm('Effacer toute la progression, les personnalisations et les fichiers importés ?')) return;
      this.storage.reset();
      try { await AssetDB.clear(); } catch { /* IndexedDB indisponible */ }
      location.reload();
    });
  }

  // ---- studio --------------------------------------------------------------------
  openStudio() {
    this.game.enterStudio(this.studioSubject || 'character');
    document.body.classList.add('studio-mode');
    this.syncStudio();
    this.showScreen('studio');
  }

  closeStudio() {
    this.game.exitStudio();
    document.body.classList.remove('studio-mode');
    this.game.applyCharacter();
    this.game.applyBoard();
    this.showScreen('menu');
  }

  syncStudio() {
    const s = this.save;
    const look = this.game.look();
    $('st-hair').value = look.hair || 'spiky';
    const colors = [['skin', 'Peau'], ['hairColor', 'Cheveux'], ['shirt', 'Sweat'], ['accent', 'Détails'], ['pants', 'Pantalon'], ['shoes', 'Chaussures'], ['sole', 'Semelles'], ['accessory', 'Accessoire']];
    $('st-colors').replaceChildren(...colors.map(([k, label]) => h('label', {}, label, h('input', {
      type: 'color', value: look[k] || '#ffffff',
      oninput: (e) => { s.look[k] = e.target.value; this.game.applyCharacter(); },
    }))));
    $('st-acc').replaceChildren(...ACCESSORIES.map((a) => h('label', {}, h('input', {
      type: 'checkbox', checked: (look.accessories || []).includes(a),
      onchange: (e) => {
        const cur = new Set(this.game.look().accessories || []);
        e.target.checked ? cur.add(a) : cur.delete(a);
        s.look.accessories = [...cur];
        this.game.applyCharacter();
      },
    }), { cap: 'Casquette', headphones: 'Casque audio', glasses: 'Lunettes', backpack: 'Sac à dos', scarf: 'Écharpe' }[a])));
    const bs = $('st-boardstyle');
    bs.replaceChildren(...BOARDS.filter((b) => s.unlocked.boards.includes(b.id)).map((b) => h('option', { value: b.id, text: b.name })));
    bs.value = s.selected.board;
    const b = BOARDS.find((x) => x.id === s.selected.board);
    $('st-bc1').value = s.board.color || b.color;
    $('st-bc2').value = s.board.color2 || b.color2;
    $('st-coin').value = s.studio.coinTint || '#ffc23a';
    $('st-glowon').checked = s.studio.coinGlow.enabled;
    $('st-glow').value = s.studio.coinGlow.color;
    $('st-glowint').value = s.studio.coinGlow.intensity;
    this.renderCoinSkins();
    $('st-trainon').checked = s.studio.trainLivery.enabled;
    $('st-t1').value = s.studio.trainLivery.body;
    $('st-t2').value = s.studio.trainLivery.stripe;
    $('st-t3').value = s.studio.trainLivery.accent;
    const ms = $('st-map');
    ms.replaceChildren(...MAPS.map((m) => h('option', { value: m.id, text: m.name })));
    ms.value = this.game.effectiveMapId();
    ms.disabled = this.game.version().lockMap;
    $('st-exp').value = s.studio.lighting.exposure;
    $('st-sun').value = s.studio.lighting.sun;
    $('st-hemi').value = s.studio.lighting.hemi;
    $('st-modelinfo').textContent = s.studio.files.model ? 'Modèle personnalisé actif.' : 'Personnage MNNROW actif.';
  }

  bindStudio() {
    const s = () => this.save;
    const msg = (t, ok = true) => { $('st-msg').textContent = t; $('st-msg').style.color = ok ? 'var(--lime)' : 'var(--danger)'; };
    document.querySelectorAll('#st-tabs button').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#st-tabs button').forEach((x) => x.classList.toggle('on', x === b));
      document.querySelectorAll('.tabpane').forEach((p) => p.classList.toggle('on', p.dataset.pane === b.dataset.tab));
      const subject = { look: 'character', board: 'board', coin: 'coin', train: 'train', model: 'character', light: 'character' }[b.dataset.tab];
      this.setSubject(subject);
    }));
    document.querySelectorAll('#st-subject button').forEach((b) => b.addEventListener('click', () => this.setSubject(b.dataset.subject)));
    $('st-hair').addEventListener('change', (e) => { s().look.hair = e.target.value; this.game.applyCharacter(); });
    $('st-boardstyle').addEventListener('change', (e) => { s().selected.board = e.target.value; s().board = { color: null, color2: null }; this.game.applyBoard(); this.syncStudio(); });
    const board = throttle(() => this.game.applyBoard());
    $('st-bc1').addEventListener('input', (e) => { s().board.color = e.target.value; board(); });
    $('st-bc2').addEventListener('input', (e) => { s().board.color2 = e.target.value; board(); });
    const coin = throttle(() => { this.game.applyCustom({}); this.setSubject('coin', true); });
    $('st-coin').addEventListener('input', (e) => { s().studio.coinTint = e.target.value; coin(); });
    const glow = coin;
    $('st-glowon').addEventListener('change', (e) => { s().studio.coinGlow.enabled = e.target.checked; glow(); });
    $('st-glow').addEventListener('input', (e) => { s().studio.coinGlow.color = e.target.value; s().studio.coinGlow.enabled = true; $('st-glowon').checked = true; glow(); });
    $('st-glowint').addEventListener('input', (e) => { s().studio.coinGlow.intensity = Number(e.target.value); s().studio.coinGlow.enabled = true; $('st-glowon').checked = true; glow(); });
    const train = throttle(() => { this.game.applyCustom({}); this.setSubject('train', true); }, 200);
    $('st-trainon').addEventListener('change', (e) => { s().studio.trainLivery.enabled = e.target.checked; train(); });
    $('st-t1').addEventListener('input', (e) => { s().studio.trainLivery.body = e.target.value; s().studio.trainLivery.enabled = true; $('st-trainon').checked = true; train(); });
    $('st-t2').addEventListener('input', (e) => { s().studio.trainLivery.stripe = e.target.value; s().studio.trainLivery.enabled = true; $('st-trainon').checked = true; train(); });
    $('st-t3').addEventListener('input', (e) => { s().studio.trainLivery.accent = e.target.value; s().studio.trainLivery.enabled = true; $('st-trainon').checked = true; train(); });
    $('st-map').addEventListener('change', (e) => { this.game.setMap(e.target.value); this.game.env.setLighting(s().studio.lighting); });
    for (const [id, key] of [['st-exp', 'exposure'], ['st-sun', 'sun'], ['st-hemi', 'hemi']]) {
      $(id).addEventListener('input', (e) => { s().studio.lighting[key] = Number(e.target.value); this.game.env.setLighting(s().studio.lighting); });
    }
    const imageInput = (inputId, slot, apply) => $(inputId).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const tex = await this.game.assets.imageTexture(f, { repeat: slot === 'shirt' });
        await AssetDB.put(`img:${slot}`, { blob: f, name: f.name, type: tex.userData.kind });
        s().studio.files[slot] = `img-${slot}`;
        apply(tex);
        msg(`✓ Image « ${f.name} » appliquée (${tex.image.width}×${tex.image.height}).`);
      } catch (err) {
        msg(`✗ ${err.message}`, false);
      }
    });
    imageInput('st-shirtfile', 'shirt', (t) => { this.game.applyCustom({ shirtTexture: t }); this.setSubject('character', true); });
    imageInput('st-boardfile', 'board', (t) => { this.game.applyCustom({ boardTexture: t }); this.setSubject('board', true); });
    imageInput('st-coinfile', 'coin', (t) => { s().studio.coinPreset = null; this.game.applyCustom({ coinTexture: t }); this.renderCoinSkins(); this.setSubject('coin', true); });
    imageInput('st-trainfile', 'train', (t) => { s().studio.trainLivery.enabled = true; $('st-trainon').checked = true; this.game.applyCustom({ trainTexture: t }); this.setSubject('train', true); });
    document.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', async () => {
      const slot = b.dataset.clear;
      s().studio.files[slot] = null;
      try { await AssetDB.delete(slot === 'model' ? 'model' : `img:${slot}`); } catch { /* ignoré */ }
      if (slot === 'model') {
        const rig = await this.game.assets.loadCharacter();
        this.game.player.setRig(rig);
        this.game.applyCharacter();
        $('st-modelinfo').textContent = 'Personnage MNNROW actif.';
      } else {
        const key = { shirt: 'shirtTexture', board: 'boardTexture', coin: 'coinTexture', train: 'trainTexture' }[slot];
        this.game.custom[key] = null;
        if (slot === 'coin') { s().studio.coinPreset = null; this.renderCoinSkins(); }
        this.game.applyCustom({});
      }
      this.storage.save();
      msg('Élément retiré.');
    }));
    $('st-modelfile').addEventListener('change', async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      if (!files.length) return;
      $('st-modelinfo').textContent = 'Vérification et chargement…';
      try {
        const { record, rig, stats } = await this.game.assets.importModel(files);
        await AssetDB.put('model', record);
        s().studio.files.model = 'model';
        this.game.player.setRig(rig);
        this.storage.save();
        $('st-modelinfo').textContent = `✓ Modèle chargé : ${stats.meshes} maillage(s), ${fmt(stats.vertices)} sommets, ${stats.animations.length} animation(s)${stats.animations.length ? ` (${stats.animations.slice(0, 4).join(', ')})` : ' — animation procédurale appliquée'}.`;
        this.setSubject('character', true);
      } catch (err) {
        $('st-modelinfo').textContent = `✗ ${err.message}`;
      }
    });
    $('st-save').addEventListener('click', () => {
      this.click();
      msg(this.storage.save() ? '✓ Personnalisations enregistrées sur cet appareil.' : '✗ Stockage local indisponible.', true);
    });
    $('st-reset').addEventListener('click', async () => {
      if (!confirm('Réinitialiser toutes les personnalisations du studio ?')) return;
      const d = this.save;
      d.look = {};
      d.board = { color: null, color2: null };
      d.studio = { coinTint: null, coinPreset: null, coinGlow: { enabled: false, color: '#ffd23a', intensity: 0.6 }, trainLivery: { enabled: false, body: '#2f7fd8', stripe: '#ffd23a', accent: '#ff4f6d' }, lighting: { exposure: 1, sun: 1, hemi: 1 }, files: { shirt: null, coin: null, board: null, train: null, model: null } };
      try { await AssetDB.clear(); } catch { /* ignoré */ }
      this.game.custom = {};
      const rig = await this.game.assets.loadCharacter();
      this.game.player.setRig(rig);
      this.game.applyCustom({});
      this.game.env.setLighting(d.studio.lighting);
      this.storage.save();
      this.syncStudio();
      msg('Personnalisations réinitialisées.');
    });
  }

  renderCoinSkins() {
    const s = this.save;
    const current = s.studio.coinPreset;
    const item = (id, name, src) => h('button', {
      class: `skin${current === id ? ' on' : ''}`,
      role: 'radio',
      'aria-checked': current === id ? 'true' : 'false',
      title: name,
      onclick: () => this.chooseCoinSkin(id),
    }, h('span', { class: 'disc' }, src ? h('img', { src: this.base + src, alt: name, loading: 'lazy' }) : null), h('em', { text: name }));
    $('st-coinskins').replaceChildren(
      item(null, 'Symbole MNNROW', null),
      ...COIN_SKINS.map((c) => item(c.id, c.name, c.file)),
    );
  }

  async chooseCoinSkin(id) {
    this.click();
    const s = this.save;
    const msg = (t, ok = true) => { $('st-msg').textContent = t; $('st-msg').style.color = ok ? 'var(--lime)' : 'var(--danger)'; };
    try {
      let tex = null;
      if (id) {
        const skin = COIN_SKINS.find((c) => c.id === id);
        tex = await this.game.assets.loadTexture(skin.file);
        msg(`✓ Texture « ${skin.name} » appliquée aux pièces.`);
      } else msg('Symbole MNNROW d\'origine rétabli.');
      // une texture choisie remplace l'image importée (et inversement)
      s.studio.coinPreset = id;
      if (s.studio.files.coin) {
        s.studio.files.coin = null;
        try { await AssetDB.delete('img:coin'); } catch { /* ignoré */ }
      }
      this.game.custom.coinTexture = null;
      this.game.applyCustom({ coinTexture: tex });
      this.storage.save();
      this.renderCoinSkins();
      this.setSubject('coin', true);
    } catch (e) {
      msg(`✗ Texture introuvable : ${e.message}`, false);
    }
  }

  setSubject(subject, force = false) {
    if (!force && this.studioSubject === subject) return;
    this.studioSubject = subject;
    document.querySelectorAll('#st-subject button').forEach((b) => b.classList.toggle('on', b.dataset.subject === subject));
    if (this.game.state === 'studio') this.game.setStudioSubject(subject);
  }

  // ---- en jeu --------------------------------------------------------------------
  showHUD() {
    this.hudCache = {};
    // évite qu'Espace / Entrée réactive le bouton cliqué (JOUER, Rejouer…)
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    this.showScreen('hud');
  }

  setText(id, v) {
    if (this.hudCache[id] !== v) {
      this.hudCache[id] = v;
      $(id).textContent = v;
    }
  }

  updateHUD(sim, save) {
    this.setText('h-score', fmt(sim.score));
    this.setText('h-dist', fmt(sim.s));
    this.setText('h-coins', fmt(sim.coins));
    const mult = sim.multiplier;
    this.setText('h-mult', `×${mult}`);
    const boosted = sim.powerups.active('multiplier');
    if (this.hudCache.boost !== boosted) { this.hudCache.boost = boosted; $('h-mult').classList.toggle('boost', boosted); }
    this.setText('h-boardn', String(save.hoverboards));
    const canBoard = save.hoverboards > 0 && !sim.powerups.active('hoverboard');
    if (this.hudCache.canBoard !== canBoard) { this.hudCache.canBoard = canBoard; $('h-board').disabled = !canBoard; }
    const list = sim.powerups.list();
    const sig = list.map((p) => p.type).join(',');
    const box = $('h-powers');
    if (this.hudCache.powers !== sig) {
      this.hudCache.powers = sig;
      box.replaceChildren(...list.map((p) => {
        const [name, color] = POWER_INFO[p.type];
        return h('div', { class: 'power', 'data-p': p.type }, h('span', { class: 'pi', style: { background: color } }), h('span', { text: name }), h('span', { class: 'bar' }, h('div', { style: { background: color, width: '100%' } })));
      }));
    }
    for (const p of list) {
      const el = box.querySelector(`[data-p="${p.type}"] .bar div`);
      if (el) el.style.width = `${(p.fraction * 100).toFixed(1)}%`;
    }
  }

  updateFps(r) {
    if (!this.save?.settings.showFps) return;
    if ((this._fpsT = (this._fpsT || 0) + 1) % 20) return;
    const i = r.info();
    $('h-fps').textContent = `${i.fps.toFixed(0)} FPS · ${i.profile}\n×${i.dpr.toFixed(2)} · ${i.calls} dc\n${(i.triangles / 1000).toFixed(0)}k tri`;
  }

  showPause(reason) {
    $('pausewhy').textContent = reason === 'hidden' ? 'Pause automatique : la page n\'était plus visible.' : reason === 'context' ? 'Pause : contexte graphique perdu.' : '';
    this.showScreen('pause');
  }

  showGameOver(r) {
    $('go-cause').textContent = r.zen ? 'ZEN RUN' : { front: 'TU AS PERCUTÉ UN TRAIN', barrierLow: 'BARRIÈRE BASSE : IL FALLAIT SAUTER', barrierHigh: 'BARRIÈRE HAUTE : IL FALLAIT ROULER', stumble: 'DEUX TRÉBUCHEMENTS DE SUITE' }[r.cause] || 'FIN DE PARTIE';
    $('go-title').textContent = r.newRecord ? 'Record battu !' : r.distance > 1000 ? 'Superbe course !' : 'Belle course !';
    $('go-record').classList.toggle('hidden', !r.newRecord);
    $('go-score').textContent = fmt(r.score);
    $('go-dist').textContent = `${fmt(r.distance)} m`;
    $('go-coins').textContent = fmt(r.coins);
    $('go-best').textContent = fmt(r.best);
    $('go-seed').textContent = r.seed;
    const lines = [];
    for (const d of r.finished) lines.push(h('div', { text: `★ Mission réussie : ${d.label} (+${d.reward})` }));
    if (r.reward.levelUp) lines.push(h('div', { text: `▲ Niveau ${r.missions.level} : multiplicateur ×${r.missions.level}, +1 hoverboard !` }));
    if (r.reward.coins) lines.push(h('div', { class: 'muted', text: `Récompenses versées : ${r.reward.coins} pièces` }));
    $('go-missions').replaceChildren(...lines);
    this.showScreen('gameover');
  }

  contextLost(on) {
    if (on) { this.ctxPrev = this.current; this.showScreen('ctxlost'); return; }
    if (this.current !== 'ctxlost') return;
    const st = this.game.state;
    const screen = st === 'paused' ? 'pause' : st === 'gameover' ? 'gameover' : st === 'studio' ? 'studio' : (this.ctxPrev && this.ctxPrev !== 'ctxlost' ? this.ctxPrev : 'menu');
    this.showScreen(screen);
  }
}
