// SkinManager : applique les skins par CATÉGORIE explicite, jamais en
// parcourant aveuglément la scène. Catégories gérées : personnage (complet
// ou vêtements), cape, hoverboard. Les pièces passent par CoinFactory.
// Les trains, rails, décors, cartes et l'interface ne sont jamais touchés.
import * as THREE from 'three';
import { DEFAULT_GALAXY, SKIN_IDS, setGalaxyParams, skinMaterial } from './SkinShader.js';
import { DEFAULT_COIN } from './CoinFactory.js';

// Matériaux du personnage considérés comme « vêtements et accessoires »
export const CLOTHES = ['Shirt', 'Accent', 'Pants', 'Shoes', 'Sole', 'Accessory'];
// Toujours conservés pour garder un visage lisible (yeux, bouche)
const FACE = ['EyeWhite', 'EyeDark', 'Mouth'];
const BOARD_PARTS = ['BoardTop', 'BoardEdge', 'BoardUnder'];

export const GALAXY_TARGETS = ['character', 'cape', 'coins', 'board'];

export function defaultSkins() {
  return {
    character: { skin: 'normal', mode: 'full' }, // mode : full | clothes
    cape: { enabled: false, skin: 'normal', color: '#c0262d' },
    board: { skin: 'normal' },
    coin: { ...DEFAULT_COIN },
    galaxy: { ...DEFAULT_GALAXY },
    animated: true,
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const HEX = /^#[0-9a-fA-F]{6}$/;
const num = (v, d, a, b) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
const skinId = (v, d = 'normal') => (SKIN_IDS.includes(v) ? v : d);

// Validation stricte (sauvegarde corrompue = valeurs par défaut, jamais de blocage).
export function validateSkins(input) {
  const d = defaultSkins();
  if (!isObj(input)) return d;
  if (isObj(input.character)) {
    d.character.skin = skinId(input.character.skin);
    d.character.mode = input.character.mode === 'clothes' ? 'clothes' : 'full';
  }
  if (isObj(input.cape)) {
    d.cape.enabled = input.cape.enabled === true;
    d.cape.skin = skinId(input.cape.skin);
    d.cape.color = HEX.test(input.cape.color || '') ? input.cape.color : d.cape.color;
  }
  if (isObj(input.board)) d.board.skin = skinId(input.board.skin);
  if (isObj(input.coin)) {
    const c = input.coin;
    d.coin.skin = skinId(c.skin);
    d.coin.fit = c.fit === 'cover' ? 'cover' : 'contain';
    d.coin.zoom = num(c.zoom, 1, 0.3, 3);
    d.coin.offsetX = num(c.offsetX, 0, -0.5, 0.5);
    d.coin.offsetY = num(c.offsetY, 0, -0.5, 0.5);
    d.coin.rotation = num(c.rotation, 0, -180, 180);
    d.coin.edgeColor = HEX.test(c.edgeColor || '') ? c.edgeColor : d.coin.edgeColor;
    d.coin.metalness = num(c.metalness, 1, 0, 1);
    d.coin.roughness = num(c.roughness, 0.22, 0, 1);
    d.coin.shine = num(c.shine, 1, 0, 2);
  }
  if (isObj(input.galaxy)) {
    const g = input.galaxy;
    for (const k of ['colorA', 'colorB', 'colorC', 'starColor']) if (HEX.test(g[k] || '')) d.galaxy[k] = g[k];
    d.galaxy.starDensity = num(g.starDensity, d.galaxy.starDensity, 0, 1);
    d.galaxy.starBrightness = num(g.starBrightness, d.galaxy.starBrightness, 0, 3);
    d.galaxy.nebulaIntensity = num(g.nebulaIntensity, d.galaxy.nebulaIntensity, 0, 2);
    d.galaxy.animationSpeed = num(g.animationSpeed, d.galaxy.animationSpeed, 0, 3);
    d.galaxy.glowIntensity = num(g.glowIntensity, d.galaxy.glowIntensity, 0, 2);
    d.galaxy.contrast = num(g.contrast, d.galaxy.contrast, 0.5, 2);
    d.galaxy.noiseScale = num(g.noiseScale, d.galaxy.noiseScale, 0.3, 3);
    d.galaxy.rotation = num(g.rotation, 0, -180, 180);
    d.galaxy.sparkle = num(g.sparkle, d.galaxy.sparkle, 0, 1);
    d.galaxy.animated = g.animated !== false;
  }
  d.animated = input.animated !== false;
  return d;
}

// Bouton « Appliquer Galaxie à l'équipement » : personnage, vêtements, cape,
// pièces et hoverboard. Les trains ne font pas partie des cibles.
export function applyGalaxyToEquipment(cfg, targets = GALAXY_TARGETS, skin = 'galaxy') {
  if (targets.includes('character')) cfg.character.skin = skin;
  if (targets.includes('cape')) { cfg.cape.skin = skin; cfg.cape.enabled = true; }
  if (targets.includes('coins')) cfg.coin.skin = skin;
  if (targets.includes('board')) cfg.board.skin = skin;
  return cfg;
}

export function removeSkinEverywhere(cfg) {
  cfg.character.skin = 'normal';
  cfg.cape.skin = 'normal';
  cfg.coin.skin = 'normal';
  cfg.board.skin = 'normal';
  return cfg;
}

export class SkinManager {
  constructor() {
    this.cfg = defaultSkins();
    this.textures = {}; // textures perso (skin « texture ») par catégorie
  }

  setConfig(cfg) {
    this.cfg = cfg;
    setGalaxyParams(cfg.galaxy);
  }

  // Remplace les matériaux autorisés d'un maillage en gardant l'original
  // (userData.baseMaterial) pour pouvoir le restaurer ; un SkinnedMesh reste
  // un SkinnedMesh (squelette et animations intacts).
  swap(mesh, pick, mat) {
    if (mesh.userData.baseMaterial === undefined) mesh.userData.baseMaterial = mesh.material;
    const base = mesh.userData.baseMaterial;
    if (!mat) {
      mesh.material = base;
      return;
    }
    if (Array.isArray(base)) mesh.material = base.map((m) => (pick(m) ? mat : m));
    else mesh.material = pick(base) ? mat : base;
  }

  material(skin, key, extra = {}) {
    if (skin === 'normal') return null;
    if (skin === 'texture') {
      const map = this.textures[key];
      if (!map) return null; // pas d'image : on reste normal
      return skinMaterial('texture', { key, map, mapScale: key === 'character' ? 1.2 : 0.8, ...extra });
    }
    return skinMaterial(skin, { key, ...extra });
  }

  // Personnage : mode complet (tout sauf yeux/bouche) ou vêtements seuls.
  applyCharacter(root, isCustom = false) {
    const { skin, mode } = this.cfg.character;
    const mat = this.material(skin, 'character');
    const pick = isCustom
      ? () => true
      : mode === 'clothes'
        ? (m) => CLOTHES.includes(m.name)
        : (m) => !FACE.includes(m.name);
    root.traverse((o) => {
      if (!o.isMesh || o.userData.category === 'cape') return;
      this.swap(o, pick, mat);
    });
  }

  applyBoard(board) {
    if (!board) return;
    const mat = this.material(this.cfg.board.skin, 'board');
    board.traverse((o) => { if (o.isMesh) this.swap(o, (m) => BOARD_PARTS.includes(m.name), mat); });
    // les propulseurs prennent la couleur cosmique
    const glow = board.userData.glowMaterial;
    if (glow) {
      if (glow.userData.baseColor === undefined) glow.userData.baseColor = glow.color.getHex();
      const c = this.cfg.board.skin === 'galaxy' ? new THREE.Color(this.cfg.galaxy.colorC) : new THREE.Color(glow.userData.baseColor);
      glow.color.copy(c);
      glow.emissive.copy(c);
    }
  }

  applyCape(cape) {
    if (!cape) return;
    cape.setColor(this.cfg.cape.color);
    const mat = this.material(this.cfg.cape.skin, 'cape', { side: THREE.DoubleSide, rest: true });
    cape.mesh.material = mat || cape.baseMaterial;
  }
}
