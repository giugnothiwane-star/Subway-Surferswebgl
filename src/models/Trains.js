// Trains originaux : métro urbain, rame moderne aérodynamique, convoi de
// marchandises (locomotive + wagons porte-conteneurs / citernes).
// Repère local : l'avant du train est en z = 0 (face au joueur), le train
// s'étend vers -z. Hauteur du toit = 3.0 m (cohérent avec la collision).
import * as THREE from 'three';
import { PartBuilder, RoundedBoxGeometry, capShape, roundedRectProfile, sweep } from './geo.js';
import { containerTexture, trainFrontTexture, trainRoofTexture, trainSideTexture } from './textures.js';
import { TRAIN } from '../gameplay/constants.js';

const W = TRAIN.width;
const HW = W / 2;
const TOP = TRAIN.height;
const BOTTOM = 0.55;
const CAR = TRAIN.carLength;

// ---- matériaux partagés ----------------------------------------------------
const shared = {};
function sharedMat(name, params) {
  if (!shared[name]) {
    shared[name] = new THREE.MeshStandardMaterial(params);
    shared[name].name = name;
  }
  return shared[name];
}
export function trainSharedMaterials() {
  return {
    metal: sharedMat('TrainMetal', { color: 0xb9c2cc, metalness: 0.75, roughness: 0.32 }),
    dark: sharedMat('TrainDark', { color: 0x23262d, metalness: 0.4, roughness: 0.7 }),
    wheel: sharedMat('TrainWheel', { color: 0x4a4e57, metalness: 0.85, roughness: 0.35 }),
    glass: sharedMat('TrainGlass', { color: 0x0e1a25, metalness: 0.6, roughness: 0.08 }),
    light: sharedMat('TrainLight', { color: 0xffffff, emissive: 0xfff3c8, emissiveIntensity: 2.2 }),
    tail: sharedMat('TrainTail', { color: 0xff2a2a, emissive: 0xff1a1a, emissiveIntensity: 1.6 }),
    rubber: sharedMat('TrainRubber', { color: 0x15161a, roughness: 0.9 }),
    reflector: sharedMat('TrainReflector', { color: 0xffc23d, emissive: 0xff9a00, emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.3 }),
  };
}

const liveryMats = new Map();
function liveryMaterials(style, livery) {
  const { customTexture, ...plain } = livery;
  const key = `${style}:${JSON.stringify(plain)}:${customTexture ? customTexture.uuid : ''}`;
  if (liveryMats.has(key)) return liveryMats.get(key);
  if (liveryMats.size > 24) {
    // livrées personnalisées successives : on libère les plus anciennes
    const [oldKey, old] = liveryMats.entries().next().value;
    for (const m of Object.values(old)) m.dispose();
    liveryMats.delete(oldKey);
  }
  const nose = style === 'modern' ? 4.2 / CAR : 0;
  const side = new THREE.MeshStandardMaterial({ map: customTexture || trainSideTexture(style, plain), metalness: 0.35, roughness: 0.4 });
  side.name = `TrainSide_${style}`;
  const roof = new THREE.MeshStandardMaterial({ map: trainRoofTexture(style, livery.roof || livery.body, nose), metalness: 0.55, roughness: 0.38 });
  roof.name = `TrainRoof_${style}`;
  const front = new THREE.MeshStandardMaterial({ map: trainFrontTexture(style, livery), metalness: 0.3, roughness: 0.35 });
  front.name = `TrainFront_${style}`;
  const accent = new THREE.MeshStandardMaterial({ color: livery.accent, emissive: livery.accent, emissiveIntensity: style === 'modern' ? 1.4 : 0.05, metalness: 0.3, roughness: 0.4 });
  accent.name = `TrainAccent_${style}`;
  const body = new THREE.MeshStandardMaterial({ color: livery.body, metalness: 0.4, roughness: 0.4 });
  body.name = `TrainBody_${style}`;
  const m = { side, roof, front, accent, body };
  liveryMats.set(key, m);
  return m;
}

// Profils de carrosserie
function sideProfile(sign) {
  const pts = [[1.11, BOTTOM], [1.15, 0.85], [1.16, 1.7], [1.15, 2.4], [1.1, 2.62]];
  return pts.map(([x, y]) => new THREE.Vector2(x * sign, y));
}
function roofProfile() {
  // de +x vers -x en passant par le sommet (continuité avec le flanc gauche)
  const pts = [];
  const seg = 12;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    pts.push(new THREE.Vector2(Math.cos(a) * 1.1, 2.62 + Math.sin(a) * (TOP - 2.62)));
  }
  return pts;
}
function outline() {
  // contour complet (anti-horaire vu depuis +z) : flanc gauche ↑, toit, flanc droit ↓
  const left = sideProfile(1);
  const roof = roofProfile();
  const right = sideProfile(-1).reverse();
  return [...left, ...roof.slice(1, -1), ...right];
}

function bodyShell(pb, mats, z0, len, stations = null) {
  const st = stations || [{ z: z0 }, { z: z0 - len }];
  pb.add(sweep(sideProfile(1), st, { swapUV: true, vLength: len }), mats.side);
  pb.add(sweep(sideProfile(-1), st, { swapUV: true, flipWinding: true, uFlip: true, vLength: len }), mats.side);
  pb.add(sweep(roofProfile(), st, { swapUV: true, vLength: len }), mats.roof);
  // plancher / jupe
  pb.add(new THREE.BoxGeometry(W - 0.15, 0.22, len - 0.2), shared.TrainDark || trainSharedMaterials().dark, { position: [0, BOTTOM - 0.1, z0 - len / 2] });
}

function bogie(pb, sm, z, wide = 0.72) {
  pb.add(new THREE.BoxGeometry(1.7, 0.22, 2.6), sm.dark, { position: [0, 0.48, z] });
  for (const dz of [-0.85, 0.85]) {
    for (const sx of [-1, 1]) {
      pb.add(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 18), sm.wheel, { position: [sx * wide, 0.36, z + dz], rotation: [0, 0, Math.PI / 2] });
      pb.add(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 10), sm.metal, { position: [sx * (wide + 0.02), 0.36, z + dz], rotation: [0, 0, Math.PI / 2] });
    }
    pb.add(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 8), sm.metal, { position: [0, 0.36, z + dz], rotation: [0, 0, Math.PI / 2] });
  }
  for (const sx of [-1, 1]) pb.add(new THREE.BoxGeometry(0.12, 0.3, 0.5), sm.metal, { position: [sx * 0.95, 0.5, z] }); // ressorts / boîtes d'essieu
}

function roofDetails(pb, sm, z0, len, style) {
  if (style === 'modern') {
    pb.add(new RoundedBoxGeometry(1.2, 0.07, len * 0.55, 2, 0.03), sm.metal, { position: [0, TOP - 0.02, z0 - len * 0.55] });
    return;
  }
  for (const f of [0.28, 0.72]) {
    pb.add(new RoundedBoxGeometry(1.3, 0.09, 2.2, 2, 0.04), sm.metal, { position: [0, TOP - 0.03, z0 - len * f] });
    for (let i = 0; i < 5; i++) pb.add(new THREE.BoxGeometry(1.1, 0.02, 0.06), sm.dark, { position: [0, TOP + 0.02, z0 - len * f - 0.8 + i * 0.4] });
  }
  for (let i = 0; i < 4; i++) pb.add(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12), sm.dark, { position: [0.45, TOP - 0.02, z0 - len * (0.45 + i * 0.04)] }); // ventilations
}

function flatFront(pb, mats, sm, z, livery) {
  const out = outline();
  pb.add(capShape(out, z, 1), mats.front);
  // pare-brise en relief
  pb.add(new RoundedBoxGeometry(1.8, 1.0, 0.06, 2, 0.05), sm.glass, { position: [0, 2.15, z + 0.02] });
  // essuie-glaces stylisés
  pb.add(new THREE.BoxGeometry(0.03, 0.62, 0.03), sm.rubber, { position: [-0.38, 1.92, z + 0.07], rotation: [0, 0, 0.55] });
  pb.add(new THREE.BoxGeometry(0.03, 0.62, 0.03), sm.rubber, { position: [0.42, 1.92, z + 0.07], rotation: [0, 0, 0.5] });
  // phares + feux
  for (const sx of [-1, 1]) {
    pb.add(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 18), sm.metal, { position: [sx * 0.72, 1.05, z + 0.03], rotation: [Math.PI / 2, 0, 0] });
    pb.add(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 18), sm.light, { position: [sx * 0.72, 1.05, z + 0.05], rotation: [Math.PI / 2, 0, 0] });
    pb.add(new THREE.BoxGeometry(0.18, 0.08, 0.06), sm.tail, { position: [sx * 0.72, 0.82, z + 0.04] });
    pb.add(new THREE.BoxGeometry(0.08, 0.5, 0.05), sm.reflector, { position: [sx * 1.05, 1.3, z + 0.03] });
  }
  // pare-chocs + attelage
  pb.add(new RoundedBoxGeometry(2.1, 0.22, 0.25, 2, 0.06), sm.dark, { position: [0, 0.55, z + 0.08] });
  pb.add(new THREE.BoxGeometry(0.3, 0.2, 0.4), sm.metal, { position: [0, 0.5, z + 0.25] });
  pb.add(new THREE.BoxGeometry(1.5, 0.05, 0.05), sm.metal, { position: [0, 1.45, z + 0.04] }); // main courante
}

function backCap(pb, mats, sm, z, last) {
  pb.add(capShape(outline(), z, -1), mats.body);
  if (!last) pb.add(new RoundedBoxGeometry(1.5, 2.2, TRAIN.gap + 0.1, 2, 0.08), sm.rubber, { position: [0, 1.7, z - TRAIN.gap / 2] }); // soufflet
  else {
    for (const sx of [-1, 1]) pb.add(new THREE.BoxGeometry(0.2, 0.1, 0.05), sm.tail, { position: [sx * 0.72, 0.9, z - 0.03] });
  }
}

// --- Métro urbain -----------------------------------------------------------
function urbanCar(pb, mats, sm, z0, isFront, isLast, livery) {
  bodyShell(pb, mats, z0, CAR);
  bogie(pb, sm, z0 - 2.6);
  bogie(pb, sm, z0 - CAR + 2.6);
  roofDetails(pb, sm, z0, CAR, 'urban');
  if (isFront) flatFront(pb, mats, sm, z0, livery);
  else pb.add(capShape(outline(), z0, 1), mats.body);
  backCap(pb, mats, sm, z0 - CAR, isLast);
  // bandes réfléchissantes basses
  for (const sx of [-1, 1]) pb.add(new THREE.BoxGeometry(0.02, 0.05, CAR - 0.6), sm.reflector, { position: [sx * 1.125, 0.68, z0 - CAR / 2] });
}

// --- Rame moderne (nez arrondi) --------------------------------------------
function modernCar(pb, mats, sm, z0, isFront, isLast, livery) {
  if (isFront) {
    const pivot = BOTTOM;
    const st = [
      { z: z0, sx: 0.32, sy: 0.18, pivotY: pivot },
      { z: z0 - 0.35, sx: 0.6, sy: 0.42, pivotY: pivot },
      { z: z0 - 1.0, sx: 0.82, sy: 0.66, pivotY: pivot },
      { z: z0 - 2.0, sx: 0.94, sy: 0.86, pivotY: pivot },
      { z: z0 - 3.2, sx: 0.99, sy: 0.97, pivotY: pivot },
      { z: z0 - 4.2, sx: 1, sy: 1, pivotY: pivot },
      { z: z0 - CAR, sx: 1, sy: 1, pivotY: pivot },
    ];
    bodyShell(pb, mats, z0, CAR, st);
    // bout du nez
    const tip = outline().map((p) => new THREE.Vector2(p.x * 0.32, (p.y - pivot) * 0.18 + pivot));
    pb.add(capShape(tip, z0, 1), mats.body);
    // phares LED (bandeaux lumineux)
    for (const sx of [-1, 1]) {
      pb.add(new RoundedBoxGeometry(0.55, 0.07, 0.07, 2, 0.03), sm.light, { position: [sx * 0.52, 0.86, z0 - 0.78], rotation: [0, sx * 0.6, sx * -0.12] });
      pb.add(new RoundedBoxGeometry(0.3, 0.05, 0.05, 2, 0.02), mats.accent, { position: [sx * 0.6, 0.74, z0 - 0.9], rotation: [0, sx * 0.55, 0] });
    }
    pb.add(new RoundedBoxGeometry(1.4, 0.16, 0.3, 2, 0.07), sm.dark, { position: [0, 0.5, z0 - 0.25] }); // chasse-obstacles
  } else {
    bodyShell(pb, mats, z0, CAR);
    pb.add(capShape(outline(), z0, 1), mats.body);
  }
  bogie(pb, sm, z0 - 3.0);
  bogie(pb, sm, z0 - CAR + 2.6);
  roofDetails(pb, sm, z0, CAR, 'modern');
  // filet lumineux latéral
  for (const sx of [-1, 1]) pb.add(new THREE.BoxGeometry(0.03, 0.04, CAR - (isFront ? 4.6 : 0.4)), mats.accent, { position: [sx * 1.16, 1.05, z0 - (isFront ? 4.4 : 0.2) - (CAR - (isFront ? 4.6 : 0.4)) / 2] });
  backCap(pb, mats, sm, z0 - CAR, isLast);
}

// --- Marchandises -------------------------------------------------------------
const freightMats = new Map();
function cargoMat(color) {
  if (!freightMats.has(color)) {
    const m = new THREE.MeshStandardMaterial({ map: containerTexture(color), metalness: 0.3, roughness: 0.6 });
    m.name = 'Container';
    freightMats.set(color, m);
  }
  return freightMats.get(color);
}

function locomotive(pb, mats, sm, z0, livery) {
  const len = CAR;
  bodyShell(pb, mats, z0, len);
  flatFront(pb, mats, sm, z0, livery);
  backCap(pb, mats, sm, z0 - len, false);
  bogie(pb, sm, z0 - 2.8, 0.75);
  bogie(pb, sm, z0 - len + 2.8, 0.75);
  // passerelle + mains courantes
  for (const sx of [-1, 1]) {
    pb.add(new THREE.BoxGeometry(0.22, 0.06, len - 1.0), sm.dark, { position: [sx * 1.26, 0.62, z0 - len / 2] });
    for (let i = 0; i < 7; i++) pb.add(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 5), sm.reflector, { position: [sx * 1.33, 0.97, z0 - 1 - i * ((len - 2) / 6)] });
    pb.add(new THREE.CylinderGeometry(0.025, 0.025, len - 2, 6), sm.reflector, { position: [sx * 1.33, 1.32, z0 - len / 2], rotation: [Math.PI / 2, 0, 0] });
  }
  // ventilateurs de toit + cheminée
  for (let i = 0; i < 3; i++) {
    pb.add(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), sm.dark, { position: [0, TOP - 0.01, z0 - 5.5 - i * 2.4] });
    pb.add(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 6), sm.metal, { position: [0, TOP, z0 - 5.5 - i * 2.4] });
  }
  pb.add(new THREE.CylinderGeometry(0.12, 0.14, 0.08, 10), sm.dark, { position: [0.55, TOP - 0.01, z0 - 3.4] });
  pb.add(new THREE.BoxGeometry(0.5, 0.07, 0.25), sm.metal, { position: [-0.5, TOP - 0.02, z0 - 2.6] }); // klaxon
}

function containerWagon(pb, sm, z0, color, isLast, mats) {
  const len = CAR;
  pb.add(new THREE.BoxGeometry(2.3, 0.22, len - 0.2), sm.dark, { position: [0, 0.62, z0 - len / 2] });
  for (const sx of [-1, 1]) pb.add(new THREE.BoxGeometry(0.08, 0.3, len - 0.4), sm.reflector, { position: [sx * 1.15, 0.6, z0 - len / 2] });
  bogie(pb, sm, z0 - 2.2);
  bogie(pb, sm, z0 - len + 2.2);
  const cm = cargoMat(color);
  // conteneur : boîte + nervures verticales
  const g = new THREE.BoxGeometry(2.3, 2.27, len - 1.2);
  pb.add(g, cm, { position: [0, 0.73 + 2.27 / 2, z0 - len / 2] });
  for (let i = 0; i <= 8; i++) {
    for (const sx of [-1, 1]) pb.add(new THREE.BoxGeometry(0.04, 2.27, 0.08), sm.metal, { position: [sx * 1.16, 0.73 + 2.27 / 2, z0 - 0.6 - i * ((len - 1.2) / 8)] });
  }
  // portes à l'avant (barres de verrouillage)
  for (const sx of [-0.5, -0.2, 0.2, 0.5]) pb.add(new THREE.CylinderGeometry(0.025, 0.025, 2.1, 6), sm.metal, { position: [sx, 1.85, z0 - 0.58] });
  pb.add(new THREE.BoxGeometry(2.32, 0.06, len - 1.18), sm.metal, { position: [0, TOP - 0.03, z0 - len / 2] });
}

function tankWagon(pb, sm, z0, color) {
  const len = CAR;
  pb.add(new THREE.BoxGeometry(2.1, 0.22, len - 0.3), sm.dark, { position: [0, 0.62, z0 - len / 2] });
  bogie(pb, sm, z0 - 2.2);
  bogie(pb, sm, z0 - len + 2.2);
  const tm = cargoTankMat(color);
  const r = 1.14;
  pb.add(new THREE.CylinderGeometry(r, r, len - 2.2, 28, 1, true), tm, { position: [0, TOP - r, z0 - len / 2], rotation: [Math.PI / 2, 0, 0] });
  for (const dz of [-1, 1]) pb.add(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), tm, { position: [0, TOP - r, z0 - len / 2 + dz * ((len - 2.2) / 2)], rotation: [dz * Math.PI / 2, 0, 0], scale: [1, 0.45, 1] });
  pb.add(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 16), sm.metal, { position: [0, TOP - 0.01, z0 - len / 2] });
  for (const f of [0.25, 0.5, 0.75]) pb.add(new THREE.TorusGeometry(r + 0.01, 0.03, 6, 28), sm.dark, { position: [0, TOP - r, z0 - len * f], scale: [1, 1, 1] });
  for (const sx of [-1, 1]) pb.add(new THREE.BoxGeometry(0.05, 0.05, len - 2.5), sm.reflector, { position: [sx * 1.15, TOP - r, z0 - len / 2] });
}
const tankMats = new Map();
function cargoTankMat(color) {
  if (!tankMats.has(color)) {
    const m = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.3 });
    m.name = 'Tank';
    tankMats.set(color, m);
  }
  return tankMats.get(color);
}

// ----------------------------------------------------------------------------
// Construit un train complet (n voitures) -> Group de ~8 meshes fusionnés.
export function buildTrain(style, livery, cars = 1, { lowDetail = false } = {}) {
  const sm = trainSharedMaterials();
  const mats = liveryMaterials(style, livery);
  const pb = new PartBuilder();
  for (let i = 0; i < cars; i++) {
    const z0 = -i * (CAR + TRAIN.gap);
    const isFront = i === 0;
    const isLast = i === cars - 1;
    if (lowDetail) {
      // LOD simplifié : coque + avant, sans bogies ni détails
      bodyShell(pb, mats, z0, CAR);
      pb.add(capShape(outline(), z0, 1), isFront ? mats.front : mats.body);
      pb.add(capShape(outline(), z0 - CAR, -1), mats.body);
      continue;
    }
    if (style === 'urban') urbanCar(pb, mats, sm, z0, isFront, isLast, livery);
    else if (style === 'modern') modernCar(pb, mats, sm, z0, isFront, isLast, livery);
    else if (style === 'freight') {
      if (isFront) locomotive(pb, mats, sm, z0, livery);
      else if (i % 2 === 1) containerWagon(pb, sm, z0, (livery.cargo || [0xd9572b, 0x2b7bd9, 0x3fa34d])[i % 3], isLast, mats);
      else tankWagon(pb, sm, z0, livery.tank || 0xd8dde3);
    }
  }
  const group = pb.build(`Train_${style}_${cars}${lowDetail ? '_LOD' : ''}`, { castShadow: !lowDetail });
  return group;
}

// Fabrique avec pool : un modèle (LOD complet + simplifié) par
// (style, livrée, nombre de voitures), instancié par clonage (géométries partagées).
export class TrainFactory {
  constructor() {
    this.templates = new Map();
    this.pools = new Map();
  }
  key(style, liveryIndex, cars) {
    return `${style}|${liveryIndex}|${cars}`;
  }
  template(style, livery, liveryIndex, cars) {
    const k = this.key(style, liveryIndex, cars);
    if (!this.templates.has(k)) {
      const lod = new THREE.LOD();
      lod.addLevel(buildTrain(style, livery, cars), 0);
      lod.addLevel(buildTrain(style, livery, cars, { lowDetail: true }), 85);
      lod.name = `Train_${k}`;
      this.templates.set(k, lod);
    }
    return this.templates.get(k);
  }
  acquire(style, livery, liveryIndex, cars) {
    const k = this.key(style, liveryIndex, cars);
    const pool = this.pools.get(k) || [];
    this.pools.set(k, pool);
    const obj = pool.pop() || this.template(style, livery, liveryIndex, cars).clone();
    obj.userData.poolKey = k;
    obj.visible = true;
    return obj;
  }
  release(obj) {
    obj.visible = false;
    obj.parent?.remove(obj);
    this.pools.get(obj.userData.poolKey)?.push(obj);
  }
  dispose() {
    const seen = new Set();
    for (const t of this.templates.values()) t.traverse((o) => { if (o.isMesh && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); } });
    this.templates.clear();
    this.pools.clear();
  }
}
