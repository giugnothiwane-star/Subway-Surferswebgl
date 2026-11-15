// Point d'entrée : détection WebGL, chargement de la sauvegarde, audio,
// moteur, interface et commandes.
import { detectWebGL } from './core/Renderer.js';
import { Storage, AssetDB } from './core/Storage.js';
import { AssetManager } from './core/AssetManager.js';
import { AudioSystem } from './audio/AudioSystem.js';
import { Game } from './core/Game.js';
import { UI } from './ui/UI.js';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/orbitron/latin-900.css';
import { Controls } from './gameplay/Controls.js';

const ui = new UI();

async function restoreCustomFiles(game, storage) {
  const files = storage.data.studio.files;
  const custom = {};
  const slots = { shirt: 'shirtTexture', board: 'boardTexture', coin: 'coinTexture', train: 'trainTexture', skin: 'skinTexture', cape: 'capeTexture' };
  // images héritées du prototype (data URL dans localStorage) -> IndexedDB
  for (const [slot, dataUrl] of Object.entries(storage.legacyImages || {})) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      await AssetDB.put(`img:${slot}`, { blob, name: `legacy-${slot}` });
      files[slot] = `img-${slot}`;
    } catch { /* image héritée illisible */ }
  }
  if (Object.keys(storage.legacyImages || {}).length) {
    try { localStorage.removeItem('mnnrow_custom'); } catch { /* ignoré */ }
    storage.save();
  }
  for (const [slot, key] of Object.entries(slots)) {
    if (!files[slot]) continue;
    try {
      const rec = await AssetDB.get(`img:${slot}`);
      if (rec?.blob) custom[key] = await game.assets.imageTexture(rec.blob, { repeat: slot === 'shirt' });
      else files[slot] = null;
    } catch (e) {
      files[slot] = null;
      console.warn('[MNNROW] image personnalisée ignorée :', e.message);
    }
  }
  if (storage.data.studio.coinPreset && !custom.coinTexture) {
    const { COIN_SKINS } = await import('./data/catalog.js');
    const preset = storage.data.studio.coinPreset;
    const skin = COIN_SKINS.find((c) => c.id === preset);
    try {
      if (skin) custom.coinTexture = await game.assets.loadTexture(skin.file);
      else if (preset.startsWith('local:')) {
        // image personnelle (« Mes images ») : stockée uniquement sur l'appareil
        const rec = await AssetDB.get(`coinlib:${preset.slice(6)}`);
        if (rec?.blob) custom.coinTexture = await game.assets.imageTexture(rec.blob);
        else storage.data.studio.coinPreset = null;
      }
    } catch (e) {
      console.warn('[MNNROW] texture de pièce indisponible :', e.message);
    }
  }
  if (Object.keys(custom).length) game.applyCustom(custom);
  else game.applyCustom({});
  if (files.model) {
    try {
      const rec = await AssetDB.get('model');
      if (rec) {
        game.player.setRig(await game.assets.rigFromRecord(rec));
        game.applyCharacter();
      } else files.model = null;
    } catch (e) {
      files.model = null;
      ui.toast('Modèle importé illisible : personnage MNNROW restauré.', 'warn');
    }
  }
}

async function main() {
  ui.boot(0.1, 'Vérification de la compatibilité WebGL…');
  const gl = detectWebGL();
  if (!gl.ok) {
    ui.fatal(`WebGL n'est pas disponible : ${gl.reason}`);
    return;
  }
  const storage = new Storage();
  storage.load();
  ui.boot(0.25, 'Chargement de la sauvegarde…');
  const audio = new AudioSystem(storage.data.settings);
  const assets = new AssetManager();
  let game;
  try {
    game = new Game({ canvas: document.getElementById('scene'), storage, audio, assets, gpuInfo: gl, ui });
  } catch (e) {
    ui.fatal(`Impossible d'initialiser le rendu 3D : ${e.message}`);
    return;
  }
  ui.attach(game, storage, audio);
  ui.boot(0.45, 'Chargement du personnage et de la carte…');
  await game.init();
  ui.boot(0.8, 'Restauration des personnalisations…');
  await restoreCustomFiles(game, storage);
  const controls = new Controls(document.getElementById('gesture'), (a) => game.input(a), { sensitivity: storage.data.settings.swipeSensitivity, keys: storage.data.settings.keys });
  game.setSaturation(storage.data.settings.saturation);
  controls.bindButtons(document.getElementById('hud'));
  game.controls = controls;
  ui.boot(1, 'Prêt !');
  ui.showScreen('menu');
  for (const w of storage.warnings) ui.toast(w);
  // L'audio ne démarre qu'après une interaction (règles des navigateurs mobiles).
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  // Point d'accès de diagnostic (tests automatisés)
  window.__MNNROW = { game, storage, ui, info: () => game.debugInfo() };
}

main().catch((e) => {
  console.error(e);
  ui.fatal(`Erreur au démarrage : ${e.message}`);
});
