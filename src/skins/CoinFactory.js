// CoinMaterialFactory : matériaux et face image des pièces, partagés par le
// jeu (InstancedMesh) et l'aperçu du studio — une seule source de vérité.
import * as THREE from 'three';
import { skinMaterial } from './SkinShader.js';
import { coinGeometry, coinGlowMaterial, pickupEnvironment } from '../models/Props.js';

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
  style: 'emboss', // emboss = image encastrée en relief 3D ; flat = image plein disque
  outline: true, // contour doré autour de la silhouette
};

// Faces : « encastré » = disque à l'intérieur du rebord doré (l'image fait
// partie de la pièce) ; « plein » = disque couvrant toute la face.
export function faceLayout(style) {
  return style === 'flat' ? { r: 0.375, z: 0.062 } : { r: 0.348, z: 0.035 };
}

// Les deux faces (avant / arrière) : l'arrière est retourné pour que l'image
// reste lisible (non inversée) quand la pièce tourne.
export function coinFaceGeometry(style = 'emboss') {
  const { r, z } = faceLayout(style);
  const front = new THREE.CircleGeometry(r, 64);
  front.translate(0, 0, z);
  const back = new THREE.CircleGeometry(r, 64);
  back.rotateY(Math.PI);
  back.translate(0, 0, -z);
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

function canvas(S) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return c;
}

function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Compose la face : l'image est placée dans le cercle sans déformation
// (contain = entière, cover = remplit), avec zoom, décalage et rotation.
// Style « encastré » : contour doré qui épouse la silhouette, ombre portée,
// reflet vernis, et carte de relief (normal map) calculée depuis l'image.
// Retourne { map, normalMap }.
export function composeCoinFace(source, cfg = DEFAULT_COIN) {
  const S = 512;
  const c = { ...DEFAULT_COIN, ...cfg };
  const emboss = c.style !== 'flat';
  const w = source.width || source.naturalWidth || S;
  const h = source.height || source.naturalHeight || S;
  const inner = emboss && c.outline ? 0.9 : 1; // marge pour le contour
  const k = (c.fit === 'cover' ? Math.max(S / w, S / h) : Math.min(S / w, S / h)) * (c.zoom || 1) * inner;
  // 1) l'image seule, découpée en disque
  const art = canvas(S);
  const a = art.getContext('2d');
  a.save();
  a.beginPath();
  a.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  a.clip();
  a.translate(S / 2 + (c.offsetX || 0) * S, S / 2 - (c.offsetY || 0) * S);
  a.rotate(((c.rotation || 0) * Math.PI) / 180);
  a.imageSmoothingQuality = 'high';
  a.drawImage(source, (-w * k) / 2, (-h * k) / 2, w * k, h * k);
  a.restore();
  if (!emboss) return { map: tex(art), normalMap: null };
  // 2) silhouette dorée (contour) : image recolorée en or puis dilatée
  const out = canvas(S);
  const o = out.getContext('2d');
  if (c.outline) {
    const gold = canvas(S);
    const g = gold.getContext('2d');
    g.drawImage(art, 0, 0);
    g.globalCompositeOperation = 'source-in';
    const grad = g.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, '#fff1a6');
    grad.addColorStop(0.45, '#f4b81f');
    grad.addColorStop(1, '#a8740c');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    o.save();
    o.shadowColor = 'rgba(40,20,0,0.65)';
    o.shadowBlur = 10;
    o.shadowOffsetY = 4;
    const R = 9;
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      o.drawImage(gold, Math.cos(t) * R, Math.sin(t) * R);
    }
    o.restore();
  }
  // 3) l'image par-dessus, avec une légère ombre interne pour le volume
  o.save();
  o.shadowColor = 'rgba(0,0,0,0.35)';
  o.shadowBlur = 6;
  o.drawImage(art, 0, 0);
  o.restore();
  // 4) reflet « vernis » limité à la silhouette
  o.save();
  o.globalCompositeOperation = 'source-atop';
  const gl = o.createLinearGradient(S * 0.15, 0, S * 0.75, S);
  gl.addColorStop(0, 'rgba(255,255,255,0.32)');
  gl.addColorStop(0.42, 'rgba(255,255,255,0.05)');
  gl.addColorStop(0.5, 'rgba(255,255,255,0)');
  o.fillStyle = gl;
  o.fillRect(0, 0, S, S);
  o.restore();
  return { map: tex(out), normalMap: normalFromCanvas(out) };
}

// Carte de normales (relief) : hauteur = silhouette adoucie + un peu de
// luminance de l'image ; gradient de Sobel -> normales en espace tangent.
function normalFromCanvas(src) {
  const N = 256;
  const hc = canvas(N);
  const h = hc.getContext('2d');
  h.fillStyle = '#000';
  h.fillRect(0, 0, N, N);
  h.filter = 'blur(3px)';
  h.drawImage(src, 0, 0, N, N);
  h.filter = 'none';
  const d = h.getImageData(0, 0, N, N).data;
  // la silhouette compte plus que la luminance : bord en biseau + détails gravés
  const sh = canvas(N).getContext('2d');
  sh.filter = 'blur(4px)';
  sh.drawImage(src, 0, 0, N, N);
  const alpha = sh.getImageData(0, 0, N, N).data;
  const H = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const lum = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
    H[i] = (alpha[i * 4 + 3] / 255) * 0.75 + lum * 0.25;
  }
  const nc = canvas(N);
  const n = nc.getContext('2d');
  const img = n.createImageData(N, N);
  const at = (x, y) => H[Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))];
  const strength = 3.2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength;
      let ny = dy * strength; // canvas : y vers le bas, UV : v vers le haut
      const nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * N + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  n.putImageData(img, 0, 0);
  return tex(nc, false);
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
    const m = new THREE.MeshStandardMaterial({ color, metalness: cfg.metalness, roughness: cfg.roughness, envMap: pickupEnvironment(), envMapIntensity: cfg.shine, emissive: 0x3a2200, emissiveIntensity: name === 'body' ? 0.25 : 0 });
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

// Face : émail verni (clearcoat) + relief (normal map) en style encastré.
export function coinFaceMaterial(face, cfg = DEFAULT_COIN) {
  const c = { ...DEFAULT_COIN, ...cfg };
  const emboss = c.style !== 'flat' && face.normalMap;
  const params = {
    map: face.map,
    emissive: 0xffffff,
    emissiveMap: face.map,
    emissiveIntensity: emboss ? 0.16 : 0.3,
    roughness: Math.max(0.25, c.roughness),
    metalness: Math.min(emboss ? 0.45 : 0.3, c.metalness * 0.45),
    envMap: pickupEnvironment(),
    envMapIntensity: c.shine,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
  };
  const m = emboss
    ? new THREE.MeshPhysicalMaterial({ ...params, normalMap: face.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), clearcoat: 1, clearcoatRoughness: 0.12 })
    : new THREE.MeshStandardMaterial(params);
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
  const geo = coinGeometry({ symbol: !useImg, wide: useImg && cfg.style !== 'flat' });
  const body = new THREE.Mesh(geo.geometry, coinMaterials(cfg, cfg.tint));
  body.userData.ownGeometry = true;
  g.add(body);
  if (useImg) {
    const face = new THREE.Mesh(coinFaceGeometry(cfg.style), coinFaceMaterial(composeCoinFace(faceTexture.image, cfg), cfg));
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
