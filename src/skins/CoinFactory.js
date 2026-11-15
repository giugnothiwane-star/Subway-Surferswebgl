// CoinMaterialFactory : matériaux et face image des pièces, partagés par le
// jeu (InstancedMesh) et l'aperçu du studio — une seule source de vérité.
import * as THREE from 'three';
import { skinMaterial } from './SkinShader.js';
import { coinGeometry, coinGlowMaterial } from '../models/Props.js';

export const DEFAULT_COIN = {
  skin: 'normal', // normal | galaxy | neon | gold | silver | crystal | fire | ice | rainbow | shadow | energy | texture
  fit: 'contain', // contain | cover
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  edgeColor: '#d9a21e',
  metalness: 1,
  roughness: 0.22,
  shine: 1, // intensité des reflets (envMapIntensity)
};

export const FACE_RADIUS = 0.375;
export const FACE_Z = 0.062;

// Les deux faces (avant / arrière) : l'arrière est retourné pour que l'image
// reste lisible (non inversée) quand la pièce tourne.
export function coinFaceGeometry() {
  const front = new THREE.CircleGeometry(FACE_RADIUS, 48);
  front.translate(0, 0, FACE_Z);
  const back = new THREE.CircleGeometry(FACE_RADIUS, 48);
  back.rotateY(Math.PI);
  back.translate(0, 0, -FACE_Z);
  const g = new THREE.BufferGeometry();
  const cat = (name) => [...front.attributes[name].array, ...back.attributes[name].array];
  g.setAttribute('position', new THREE.Float32BufferAttribute(cat('position'), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(cat('normal'), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(cat('uv'), 2));
  g.setIndex([...front.index.array, ...back.index.array.map((i) => i + front.attributes.position.count)]);
  front.dispose();
  back.dispose();
  return g;
}

// Compose la face (canvas 512 px) : l'image est placée dans le cercle sans
// déformation (contain = entière, cover = remplit), avec zoom, décalage et
// rotation. Le fond reste transparent : l'or (ou la teinte) apparaît autour.
export function composeCoinFace(source, cfg = DEFAULT_COIN) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const w = source.width || source.naturalWidth || S;
  const h = source.height || source.naturalHeight || S;
  const k = (cfg.fit === 'cover' ? Math.max(S / w, S / h) : Math.min(S / w, S / h)) * (cfg.zoom || 1);
  ctx.save();
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(S / 2 + (cfg.offsetX || 0) * S, S / 2 - (cfg.offsetY || 0) * S);
  ctx.rotate(((cfg.rotation || 0) * Math.PI) / 180);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, (-w * k) / 2, (-h * k) / 2, w * k, h * k);
  ctx.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const pbrCache = new Map();
function pbr(name, color, cfg) {
  const key = `${name}|${color}|${cfg.metalness}|${cfg.roughness}|${cfg.shine}`;
  if (pbrCache.size > 24) {
    const [k, m] = pbrCache.entries().next().value;
    m.dispose();
    pbrCache.delete(k);
  }
  if (!pbrCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, metalness: cfg.metalness, roughness: cfg.roughness, envMapIntensity: cfg.shine, emissive: 0x3a2200, emissiveIntensity: name === 'body' ? 0.25 : 0 });
    m.name = `Coin_${name}`;
    pbrCache.set(key, m);
  }
  return pbrCache.get(key);
}

// [corps, tranche] : avec un skin, la pièce ENTIÈRE (faces + tranche) le reçoit.
export function coinMaterials(cfg = DEFAULT_COIN, tint = null) {
  const c = { ...DEFAULT_COIN, ...cfg };
  if (c.skin !== 'normal' && c.skin !== 'texture') {
    const m = skinMaterial(c.skin, { key: 'coin' });
    return [m, m];
  }
  return [pbr('body', tint || '#ffc23a', c), pbr('edge', c.edgeColor, c)];
}

export function coinFaceMaterial(tex, cfg = DEFAULT_COIN) {
  const c = { ...DEFAULT_COIN, ...cfg };
  const m = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0.3,
    roughness: Math.max(0.3, c.roughness),
    metalness: Math.min(0.3, c.metalness * 0.3),
    envMapIntensity: c.shine,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
  });
  m.name = 'CoinFace';
  return m;
}

// L'image apparaît seulement en mode normal / texture (un skin couvre tout).
export function coinUsesImage(cfg, hasImage) {
  return !!hasImage && (cfg.skin === 'normal' || cfg.skin === 'texture');
}

// Pièce isolée pour l'aperçu du studio et la scène de test : mêmes
// géométries et matériaux que le jeu.
export function buildCoinPreview(cfg, faceTexture, glow) {
  const g = new THREE.Group();
  const useImg = coinUsesImage(cfg, faceTexture);
  const geo = coinGeometry({ symbol: !useImg });
  const body = new THREE.Mesh(geo.geometry, coinMaterials(cfg, cfg.tint));
  body.userData.ownGeometry = true;
  g.add(body);
  if (useImg) {
    const face = new THREE.Mesh(coinFaceGeometry(), coinFaceMaterial(composeCoinFace(faceTexture.image, cfg), cfg));
    face.userData.ownGeometry = true;
    face.userData.ownMaterial = true;
    g.add(face);
  }
  if (glow?.enabled) {
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), coinGlowMaterial(glow.color, glow.intensity));
    halo.renderOrder = 4;
    halo.frustumCulled = false;
    halo.userData.ownGeometry = true;
    g.add(halo);
    g.userData.glowMaterial = halo.material;
  }
  return g;
}
