// Personnage original « MNNROW Runner » : squelette (THREE.Bone), maillage
// skinné (chaque pièce est liée rigidement à un os, articulations masquées
// par des rotules) et clips d'animation générés par images clés, joués via
// AnimationMixer. Exportable en GLB (voir tools/export-models.mjs).
//
// Repère du modèle : le personnage regarde vers +Z, Y vers le haut, pieds en y=0.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from './geo.js';

const DEG = Math.PI / 180;

// [nom, parent, offset local]
const BONES = [
  ['hips', null, [0, 0.92, 0]],
  ['spine', 'hips', [0, 0.12, 0]],
  ['chest', 'spine', [0, 0.2, 0]],
  ['neck', 'chest', [0, 0.22, 0]],
  ['head', 'neck', [0, 0.07, 0]],
  ['shoulderL', 'chest', [0.12, 0.17, 0]],
  ['upperArmL', 'shoulderL', [0.1, 0, 0]],
  ['foreArmL', 'upperArmL', [0, -0.27, 0]],
  ['handL', 'foreArmL', [0, -0.25, 0]],
  ['shoulderR', 'chest', [-0.12, 0.17, 0]],
  ['upperArmR', 'shoulderR', [-0.1, 0, 0]],
  ['foreArmR', 'upperArmR', [0, -0.27, 0]],
  ['handR', 'foreArmR', [0, -0.25, 0]],
  ['thighL', 'hips', [0.1, -0.04, 0]],
  ['shinL', 'thighL', [0, -0.42, 0]],
  ['footL', 'shinL', [0, -0.41, 0]],
  ['thighR', 'hips', [-0.1, -0.04, 0]],
  ['shinR', 'thighR', [0, -0.42, 0]],
  ['footR', 'shinR', [0, -0.41, 0]],
];
export const BONE_NAMES = BONES.map((b) => b[0]);
export const HAIR_STYLES = ['spiky', 'short', 'bun', 'mohawk', 'long'];
export const ACCESSORIES = ['cap', 'headphones', 'glasses', 'backpack', 'scarf'];

function restWorld() {
  const w = {};
  for (const [name, parent, off] of BONES) {
    const p = parent ? w[parent] : [0, 0, 0];
    w[name] = [p[0] + off[0], p[1] + off[1], p[2] + off[2]];
  }
  return w;
}
const REST = restWorld();

function makeMaterials() {
  const m = (name, color, roughness = 0.6, extra = {}) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
    mat.name = name;
    return mat;
  };
  return {
    Skin: m('Skin', 0xf2c19a, 0.55),
    EyeWhite: m('EyeWhite', 0xffffff, 0.25),
    EyeDark: m('EyeDark', 0x1c1a26, 0.2),
    Mouth: m('Mouth', 0x7a2a2a, 0.5),
    Hair: m('Hair', 0x2b1d16, 0.5),
    Shirt: m('Shirt', 0xb8f477, 0.7),
    Accent: m('Accent', 0x1e2430, 0.6),
    Pants: m('Pants', 0x2c3e66, 0.75),
    Shoes: m('Shoes', 0xff5a4e, 0.45),
    Sole: m('Sole', 0xf4f4f4, 0.6),
    Accessory: m('Accessory', 0x3ec5ff, 0.4, { metalness: 0.1 }),
  };
}

// Petit constructeur de pièces skinnées : chaque géométrie est placée en
// espace modèle et liée à un os (poids 1).
class SkinParts {
  constructor(boneIndex) {
    this.boneIndex = boneIndex;
    this.byMat = new Map();
  }
  add(geo, mat, bone, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    geo !== g && geo.dispose();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
      new THREE.Vector3(...scale),
    );
    g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const bi = this.boneIndex[bone];
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(g);
  }
  build(name, skeleton) {
    const geos = [];
    const mats = [];
    for (const [mat, list] of this.byMat) {
      const merged = mergeGeometries(list, false);
      geos.push(mergeVertices(merged)); // ré-indexation : ~3× moins de sommets
      merged.dispose();
      list.forEach((g) => g.dispose());
      mats.push(mat);
    }
    if (!geos.length) return null;
    const geo = mergeGeometries(geos, true);
    geos.forEach((g) => g.dispose());
    geo.computeBoundingSphere();
    const mesh = new THREE.SkinnedMesh(geo, mats.length === 1 ? mats[0] : mats);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.frustumCulled = false; // la sphère englobante d'un maillage animé est trompeuse
    mesh.bind(skeleton);
    return mesh;
  }
}

const sph = (r, ws = 16, hs = 12, phiLen = Math.PI * 2, thetaStart = 0, thetaLen = Math.PI) => new THREE.SphereGeometry(r, ws, hs, 0, phiLen, thetaStart, thetaLen);
const cyl = (r0, r1, h, seg = 12) => new THREE.CylinderGeometry(r0, r1, h, seg);

function limb(parts, mat, bone, from, to, r0, r1, seg = 12) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const e = new THREE.Euler().setFromQuaternion(q);
  parts.add(cyl(r1, r0, len, seg), mat, bone, { pos: mid.toArray(), rot: [e.x, e.y, e.z] });
}

function lathe(points, segments = 20) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

export function createCharacter() {
  const root = new THREE.Group();
  root.name = 'MNNROW_Runner';
  const bones = {};
  const boneList = [];
  for (const [name, parent, off] of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...off);
    bones[name] = b;
    boneList.push(b);
    if (parent) bones[parent].add(b);
  }
  root.add(bones.hips);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneList);
  const boneIndex = Object.fromEntries(boneList.map((b, i) => [b.name, i]));
  const M = makeMaterials();
  const R = REST;

  // ---------- Corps ----------
  const body = new SkinParts(boneIndex);
  const headC = [0, R.head[1] + 0.18, 0.01];
  body.add(sph(0.2, 28, 20), M.Skin, 'head', { pos: headC, scale: [1, 1.04, 0.97] });
  body.add(sph(0.12, 16, 10), M.Skin, 'head', { pos: [0, headC[1] - 0.1, 0.05], scale: [1.15, 0.8, 1] }); // mâchoire
  for (const sx of [1, -1]) {
    body.add(sph(0.05, 10, 8), M.Skin, 'head', { pos: [sx * 0.198, headC[1] - 0.01, -0.01], scale: [0.5, 1, 0.8] });
    // yeux (blanc, iris, reflet)
    body.add(sph(0.047, 14, 10), M.EyeWhite, 'head', { pos: [sx * 0.075, headC[1] + 0.03, 0.16], scale: [1, 1.25, 0.55] });
    body.add(sph(0.028, 12, 8), M.EyeDark, 'head', { pos: [sx * 0.073, headC[1] + 0.025, 0.184], scale: [1, 1.15, 0.5] });
    body.add(sph(0.009, 6, 4), M.EyeWhite, 'head', { pos: [sx * 0.073 + 0.01, headC[1] + 0.04, 0.196] });
    // sourcils
    body.add(new RoundedBoxGeometry(0.07, 0.016, 0.02, 2, 0.006), M.Hair, 'head', { pos: [sx * 0.078, headC[1] + 0.1, 0.18], rot: [0, 0, sx * -0.18] });
  }
  body.add(sph(0.032, 10, 8), M.Skin, 'head', { pos: [0, headC[1] - 0.025, 0.2], scale: [0.95, 0.9, 1.25] }); // nez
  body.add(new THREE.TorusGeometry(0.045, 0.01, 6, 14, Math.PI), M.Mouth, 'head', { pos: [0, headC[1] - 0.075, 0.172], rot: [-0.25, 0, Math.PI] });
  body.add(cyl(0.062, 0.07, 0.14), M.Skin, 'neck', { pos: [0, R.neck[1] + 0.03, 0] });

  // Torse : sweat à capuche (lathe), deux pièces pour la flexion
  const torsoLow = lathe([[0.0, 0], [0.165, 0], [0.18, 0.06], [0.185, 0.14], [0.19, 0.2], [0, 0.2]], 22);
  body.add(torsoLow, M.Shirt, 'spine', { pos: [0, R.spine[1] - 0.06, 0], scale: [1, 1, 0.72] });
  const torsoUp = lathe([[0, 0], [0.19, 0], [0.205, 0.08], [0.215, 0.16], [0.2, 0.22], [0.13, 0.27], [0, 0.28]], 22);
  body.add(torsoUp, M.Shirt, 'chest', { pos: [0, R.chest[1] - 0.06, 0], scale: [1, 1, 0.74] });
  body.add(new THREE.TorusGeometry(0.1, 0.045, 8, 16, Math.PI * 1.2), M.Shirt, 'chest', { pos: [0, R.chest[1] + 0.2, -0.05], rot: [Math.PI / 2 + 0.3, 0, Math.PI * -0.1 + Math.PI] }); // capuche
  body.add(new RoundedBoxGeometry(0.2, 0.09, 0.04, 2, 0.015), M.Accent, 'spine', { pos: [0, R.spine[1] + 0.02, 0.13] }); // poche kangourou
  body.add(new THREE.BoxGeometry(0.012, 0.3, 0.012), M.Accent, 'chest', { pos: [0, R.chest[1] + 0.06, 0.155] }); // fermeture
  for (const sx of [1, -1]) {
    // cordons de capuche
    body.add(cyl(0.006, 0.006, 0.12, 5), M.Sole, 'chest', { pos: [sx * 0.04, R.chest[1] + 0.1, 0.152] });
  }
  body.add(new THREE.TorusGeometry(0.168, 0.02, 6, 24), M.Accent, 'spine', { pos: [0, R.spine[1] - 0.055, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.73, 1] }); // bas du sweat

  // Bras
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const sh = R['upperArm' + s];
    const el = R['foreArm' + s];
    const wr = R['hand' + s];
    body.add(sph(0.083, 14, 10), M.Shirt, 'upperArm' + s, { pos: [sh[0] - sx * 0.01, sh[1] - 0.01, 0] });
    limb(body, M.Shirt, 'upperArm' + s, sh, el, 0.074, 0.062);
    body.add(sph(0.062, 12, 8), M.Shirt, 'foreArm' + s, { pos: el });
    limb(body, M.Shirt, 'foreArm' + s, el, [wr[0], wr[1] + 0.03, wr[2]], 0.06, 0.05);
    body.add(new THREE.TorusGeometry(0.05, 0.016, 6, 14), M.Accent, 'foreArm' + s, { pos: [wr[0], wr[1] + 0.035, wr[2]], rot: [Math.PI / 2, 0, 0] });
    body.add(sph(0.055, 12, 10), M.Skin, 'hand' + s, { pos: [wr[0], wr[1] - 0.045, wr[2] + 0.005], scale: [0.85, 1.15, 0.75] });
    body.add(sph(0.022, 8, 6), M.Skin, 'hand' + s, { pos: [wr[0] - sx * 0.0 + sx * 0.01, wr[1] - 0.03, wr[2] + 0.045], scale: [0.9, 1.4, 0.9] }); // pouce
  }

  // Bassin + jambes
  body.add(new RoundedBoxGeometry(0.34, 0.2, 0.24, 3, 0.07), M.Pants, 'hips', { pos: [0, R.hips[1] - 0.04, 0] });
  body.add(new THREE.TorusGeometry(0.16, 0.018, 6, 24), M.Accent, 'hips', { pos: [0, R.hips[1] + 0.045, 0], rot: [Math.PI / 2, 0, 0], scale: [1.05, 0.75, 1] });
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const th = R['thigh' + s];
    const kn = R['shin' + s];
    const an = R['foot' + s];
    limb(body, M.Pants, 'thigh' + s, [th[0], th[1] + 0.02, th[2]], kn, 0.092, 0.074);
    body.add(sph(0.074, 12, 8), M.Pants, 'shin' + s, { pos: kn });
    limb(body, M.Pants, 'shin' + s, kn, [an[0], an[1] + 0.08, an[2]], 0.072, 0.064);
    body.add(new THREE.TorusGeometry(0.066, 0.02, 6, 14), M.Accent, 'shin' + s, { pos: [an[0], an[1] + 0.12, an[2]], rot: [Math.PI / 2, 0, 0] }); // revers
    // Chaussure : tige + semelle + bout + lacets
    body.add(new RoundedBoxGeometry(0.135, 0.11, 0.27, 3, 0.045), M.Shoes, 'foot' + s, { pos: [an[0], 0.08, 0.045] });
    body.add(new RoundedBoxGeometry(0.15, 0.045, 0.3, 2, 0.02), M.Sole, 'foot' + s, { pos: [an[0], 0.022, 0.05] });
    body.add(sph(0.068, 12, 8, Math.PI * 2, 0, Math.PI / 2), M.Sole, 'foot' + s, { pos: [an[0], 0.05, 0.155], scale: [1, 0.7, 0.8] });
    for (let i = 0; i < 3; i++) body.add(new THREE.BoxGeometry(0.07, 0.012, 0.016), M.Accent, 'foot' + s, { pos: [an[0], 0.137 - i * 0.004, 0.06 + i * 0.035], rot: [0.35, 0, 0] });
    body.add(cyl(0.06, 0.066, 0.06), M.Shoes, 'foot' + s, { pos: [an[0], 0.13, -0.025] });
  }
  const bodyMesh = body.build('Body', skeleton);
  root.add(bodyMesh);

  // ---------- Coiffures ----------
  const hair = {};
  const hc = headC;
  const capGeo = () => sph(0.215, 26, 14, Math.PI * 2, 0, Math.PI * 0.47);
  {
    const p = new SkinParts(boneIndex);
    p.add(capGeo(), M.Hair, 'head', { pos: [0, hc[1] + 0.005, -0.005], rot: [-0.38, 0, 0] });
    const spikes = [[0, 0.2, 0.02, -0.3], [0.08, 0.18, 0.06, -0.6], [-0.08, 0.18, 0.06, -0.6], [0.12, 0.13, -0.06, 0.2], [-0.12, 0.13, -0.06, 0.2], [0, 0.17, -0.12, 0.7], [0.06, 0.2, -0.04, 0.2], [-0.06, 0.2, -0.04, 0.2]];
    for (const [x, y, z, tilt] of spikes) {
      p.add(new THREE.ConeGeometry(0.06, 0.16, 7), M.Hair, 'head', { pos: [x, hc[1] + y, z], rot: [tilt, 0, -x * 4] });
    }
    hair.spiky = p.build('Hair_spiky', skeleton);
  }
  {
    const p = new SkinParts(boneIndex);
    p.add(capGeo(), M.Hair, 'head', { pos: [0, hc[1] + 0.01, -0.01], rot: [-0.38, 0, 0], scale: [1.04, 1.02, 1.05] });
    p.add(new RoundedBoxGeometry(0.3, 0.07, 0.1, 3, 0.03), M.Hair, 'head', { pos: [0.02, hc[1] + 0.13, 0.14], rot: [0.5, 0, -0.12] });
    hair.short = p.build('Hair_short', skeleton);
  }
  {
    const p = new SkinParts(boneIndex);
    p.add(capGeo(), M.Hair, 'head', { pos: [0, hc[1] + 0.01, -0.01], rot: [-0.38, 0, 0], scale: [1.05, 1.03, 1.06] });
    p.add(sph(0.1, 14, 10), M.Hair, 'head', { pos: [0, hc[1] + 0.2, -0.12] });
    p.add(new THREE.TorusGeometry(0.06, 0.018, 6, 12), M.Accessory, 'head', { pos: [0, hc[1] + 0.15, -0.1], rot: [1.1, 0, 0] });
    hair.bun = p.build('Hair_bun', skeleton);
  }
  {
    const p = new SkinParts(boneIndex);
    p.add(sph(0.205, 22, 12, Math.PI * 2, 0, Math.PI * 0.45), M.Hair, 'head', { pos: [0, hc[1] + 0.0, -0.01], rot: [-0.38, 0, 0], scale: [0.98, 0.9, 1] });
    for (let i = 0; i < 6; i++) {
      p.add(new THREE.ConeGeometry(0.045, 0.2 - Math.abs(i - 2) * 0.02, 6), M.Accessory, 'head', { pos: [0, hc[1] + 0.2 - i * 0.012, 0.12 - i * 0.055], rot: [-0.4 + i * 0.25, 0, 0], scale: [0.5, 1, 1.4] });
    }
    hair.mohawk = p.build('Hair_mohawk', skeleton);
  }
  {
    const p = new SkinParts(boneIndex);
    p.add(capGeo(), M.Hair, 'head', { pos: [0, hc[1] + 0.01, -0.01], rot: [-0.38, 0, 0], scale: [1.06, 1.04, 1.08] });
    p.add(new THREE.CapsuleGeometry(0.15, 0.22, 6, 14), M.Hair, 'head', { pos: [0, hc[1] - 0.12, -0.1], scale: [1.25, 1, 0.55] });
    p.add(new RoundedBoxGeometry(0.32, 0.06, 0.1, 3, 0.03), M.Hair, 'head', { pos: [-0.03, hc[1] + 0.14, 0.14], rot: [0.55, 0, 0.15] });
    hair.long = p.build('Hair_long', skeleton);
  }
  for (const k of HAIR_STYLES) root.add(hair[k]);

  // ---------- Accessoires ----------
  const acc = {};
  {
    const p = new SkinParts(boneIndex);
    p.add(sph(0.222, 24, 12, Math.PI * 2, 0, Math.PI * 0.5), M.Accessory, 'head', { pos: [0, hc[1] + 0.03, 0], rot: [-0.12, 0, 0] });
    p.add(cyl(0.16, 0.16, 0.02, 20), M.Accessory, 'head', { pos: [0, hc[1] + 0.07, 0.2], scale: [1, 1, 0.75] });
    p.add(sph(0.025, 8, 6), M.Accent, 'head', { pos: [0, hc[1] + 0.25, 0] });
    acc.cap = p.build('Acc_cap', skeleton);
  }
  {
    const p = new SkinParts(boneIndex);
    p.add(new THREE.TorusGeometry(0.225, 0.02, 6, 24, Math.PI), M.Accent, 'head', { pos: [0, hc[1], 0] });
    for (const sx of [1, -1]) {
      p.add(cyl(0.07, 0.07, 0.06, 16), M.Accessory, 'head', { pos: [sx * 0.215, hc[1] - 0.01, 0], rot: [0, 0, Math.PI / 2] });
      p.add(cyl(0.05, 0.05, 0.065, 16), M.Accent, 'head', { pos: [sx * 0.22, hc[1] - 0.01, 0], rot: [0, 0, Math.PI / 2] });
    }
    acc.headphones = p.build('Acc_headphones', skeleton);
  }
  {
    const p = new SkinParts(boneIndex);
    for (const sx of [1, -1]) p.add(new THREE.TorusGeometry(0.052, 0.01, 6, 18), M.Accent, 'head', { pos: [sx * 0.078, hc[1] + 0.03, 0.2] });
    p.add(new THREE.BoxGeometry(0.05, 0.012, 0.012), M.Accent, 'head', { pos: [0, hc[1] + 0.035, 0.205] });
    for (const sx of [1, -1]) p.add(new THREE.BoxGeometry(0.012, 0.012, 0.2), M.Accent, 'head', { pos: [sx * 0.13, hc[1] + 0.035, 0.1] });
    for (const sx of [1, -1]) p.add(cyl(0.045, 0.045, 0.005, 16), M.Accessory, 'head', { pos: [sx * 0.078, hc[1] + 0.03, 0.198], rot: [Math.PI / 2, 0, 0] });
    acc.glasses = p.build('Acc_glasses', skeleton);
  }
  {
    const p = new SkinParts(boneIndex);
    p.add(new RoundedBoxGeometry(0.3, 0.36, 0.14, 3, 0.05), M.Accessory, 'chest', { pos: [0, R.chest[1] + 0.06, -0.19] });
    p.add(new RoundedBoxGeometry(0.22, 0.14, 0.06, 2, 0.025), M.Accent, 'chest', { pos: [0, R.chest[1] - 0.02, -0.27] });
    for (const sx of [1, -1]) p.add(new THREE.BoxGeometry(0.04, 0.32, 0.02), M.Accent, 'chest', { pos: [sx * 0.11, R.chest[1] + 0.06, 0.15], rot: [0.08, 0, 0] });
    acc.backpack = p.build('Acc_backpack', skeleton);
  }
  {
    const p = new SkinParts(boneIndex);
    p.add(new THREE.TorusGeometry(0.11, 0.05, 8, 18), M.Accessory, 'chest', { pos: [0, R.neck[1] + 0.0, 0.01], rot: [Math.PI / 2, 0, 0] });
    p.add(new RoundedBoxGeometry(0.08, 0.25, 0.04, 2, 0.02), M.Accessory, 'chest', { pos: [0.07, R.chest[1] + 0.06, 0.16], rot: [0.1, 0, 0.1] });
    acc.scarf = p.build('Acc_scarf', skeleton);
  }
  for (const k of ACCESSORIES) root.add(acc[k]);

  const clips = buildClips(root, bones);
  return { root, skeleton, bones, materials: M, hair, acc, clips, body: bodyMesh };
}

// ---------------------------------------------------------------------------
// Animations
// Pose : { bone: [rx, ry, rz] en degrés, hipsY: décalage, hipsZ: décalage }.
// Rappels (modèle face à +Z) : rotation X négative = membre vers l'avant ;
// tibia X positif = genou plié ; colonne X positive = penché en avant ;
// Z négatif = inclinaison vers la gauche du personnage (+X).

function mirror(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (!Array.isArray(v)) { out[k] = v; continue; }
    let nk = k;
    if (k.endsWith('L')) nk = k.slice(0, -1) + 'R';
    else if (k.endsWith('R')) nk = k.slice(0, -1) + 'L';
    out[nk] = [v[0], -v[1], -v[2]];
  }
  return out;
}

const ARMS_DOWN = { upperArmL: [0, 0, 8], upperArmR: [0, 0, -8], foreArmL: [-12, 0, 0], foreArmR: [-12, 0, 0] };

function runPose(amp = 1, lean = 10) {
  // contact : jambe droite en avant
  const a = {
    hips: [0, -8 * amp, 0], spine: [lean, 4, 0], chest: [4, 6 * amp, 0], neck: [-6, 0, 0], head: [-lean * 0.6, -4, 0],
    thighR: [-48 * amp, 0, 0], shinR: [18, 0, 0], footR: [10, 0, 0],
    thighL: [32 * amp, 0, 0], shinL: [68 * amp, 0, 0], footL: [22, 0, 0],
    upperArmL: [-48 * amp, 0, 10], foreArmL: [-72, 0, 0],
    upperArmR: [42 * amp, 0, -10], foreArmR: [-48, 0, 0],
    handL: [0, 0, 0], handR: [0, 0, 0],
  };
  // passage : jambe gauche repliée qui revient
  const b = {
    hips: [0, 0, 0], spine: [lean + 2, 0, 0], chest: [4, 0, 0], neck: [-6, 0, 0], head: [-lean * 0.6, 0, 0],
    thighR: [6, 0, 0], shinR: [12, 0, 0], footR: [-4, 0, 0],
    thighL: [-28 * amp, 0, 0], shinL: [100 * amp, 0, 0], footL: [30, 0, 0],
    upperArmL: [-5, 0, 10], foreArmL: [-70, 0, 0],
    upperArmR: [5, 0, -10], foreArmR: [-70, 0, 0],
    handL: [0, 0, 0], handR: [0, 0, 0],
  };
  return [a, b, mirror(a), mirror(b), a];
}

function buildClips(root, bones) {
  const clips = [];
  const make = (name, duration, poses, { plant = false, loop = true, times = null, extraTracks = [] } = {}) => {
    clips.push(poseClip(root, bones, name, duration, poses, { plant, times, extraTracks }));
  };

  // 1. Idle (respiration)
  make('idle', 2.4, [
    { ...ARMS_DOWN, spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], thighL: [0, 0, -2], thighR: [0, 0, 2] },
    { ...ARMS_DOWN, spine: [-2, 0, 1], chest: [-3, 0, 0], head: [3, 6, 0], upperArmL: [2, 0, 11], upperArmR: [2, 0, -11], thighL: [0, 0, -2], thighR: [0, 0, 2] },
    { ...ARMS_DOWN, spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], thighL: [0, 0, -2], thighR: [0, 0, 2] },
  ], { plant: true });

  // 2. Départ de course (accroupi -> élan)
  make('runStart', 0.45, [
    { spine: [30, 0, 0], chest: [8, 0, 0], head: [-25, 0, 0], thighL: [-70, 0, 0], shinL: [100, 0, 0], footL: [-20, 0, 0], thighR: [10, 0, 0], shinR: [80, 0, 0], upperArmL: [30, 0, 15], upperArmR: [-40, 0, -15], foreArmL: [-40, 0, 0], foreArmR: [-60, 0, 0] },
    runPose(1.1, 16)[0],
  ], { plant: true });

  // 3. Course normale, 4. Course rapide
  make('run', 0.62, runPose(1, 10), { plant: true });
  make('sprint', 0.5, runPose(1.28, 18), { plant: true });

  // 5. Saut, 6. Chute, 7. Réception
  make('jump', 0.5, [
    { spine: [12, 0, 0], thighL: [-60, 0, 0], shinL: [70, 0, 0], thighR: [-20, 0, 0], shinR: [40, 0, 0], upperArmL: [-150, 0, 20], upperArmR: [-140, 0, -20], foreArmL: [-20, 0, 0], foreArmR: [-20, 0, 0], head: [-10, 0, 0], hipsY: 0 },
    { spine: [18, 0, 0], thighL: [-80, 0, 0], shinL: [110, 0, 0], thighR: [-45, 0, 0], shinR: [100, 0, 0], upperArmL: [-120, 0, 40], upperArmR: [-110, 0, -40], foreArmL: [-40, 0, 0], foreArmR: [-40, 0, 0], head: [-14, 0, 0], hipsY: 0.05 },
  ], { loop: false });
  make('fall', 0.8, [
    { spine: [4, 0, 0], thighL: [-30, 0, 0], shinL: [30, 0, 0], thighR: [10, 0, 0], shinR: [40, 0, 0], upperArmL: [-40, 0, 70], upperArmR: [-30, 0, -70], foreArmL: [-20, 0, 0], foreArmR: [-20, 0, 0], head: [6, 0, 0] },
    { spine: [6, 0, 0], thighL: [-36, 0, 0], shinL: [36, 0, 0], thighR: [14, 0, 0], shinR: [44, 0, 0], upperArmL: [-46, 0, 80], upperArmR: [-36, 0, -82], foreArmL: [-26, 0, 0], foreArmR: [-26, 0, 0], head: [8, 0, 0] },
    { spine: [4, 0, 0], thighL: [-30, 0, 0], shinL: [30, 0, 0], thighR: [10, 0, 0], shinR: [40, 0, 0], upperArmL: [-40, 0, 70], upperArmR: [-30, 0, -70], foreArmL: [-20, 0, 0], foreArmR: [-20, 0, 0], head: [6, 0, 0] },
  ]);
  make('land', 0.32, [
    { spine: [30, 0, 0], head: [-20, 0, 0], thighL: [-70, 0, 0], shinL: [110, 0, 0], footL: [-30, 0, 0], thighR: [-60, 0, 0], shinR: [100, 0, 0], footR: [-30, 0, 0], upperArmL: [-60, 0, 30], upperArmR: [-50, 0, -30], foreArmL: [-30, 0, 0], foreArmR: [-30, 0, 0] },
    runPose(1, 12)[0],
  ], { plant: true });

  // 8. Roulade (rotation complète des hanches)
  const tuck = { spine: [45, 0, 0], chest: [25, 0, 0], neck: [20, 0, 0], head: [20, 0, 0], thighL: [-120, 0, 0], shinL: [140, 0, 0], thighR: [-115, 0, 0], shinR: [140, 0, 0], upperArmL: [-70, 0, 10], upperArmR: [-70, 0, -10], foreArmL: [-90, 0, 0], foreArmR: [-90, 0, 0] };
  make('roll', 0.56, [0, 90, 180, 270, 360].map((a, i) => ({ ...tuck, hips: [a, 0, 0], hipsY: i === 0 || i === 4 ? -0.35 : -0.45 })), { loop: false });

  // 9/10. Changements de voie (additifs : inclinaison du buste)
  const rest = {};
  make('leanLeft', 0.36, [rest, { hips: [0, 10, -8], spine: [0, 6, -12], chest: [0, 6, -6], head: [0, 0, 10], upperArmR: [0, 0, -30], upperArmL: [0, 0, 20] }, rest], { loop: false });
  make('leanRight', 0.36, [rest, { hips: [0, -10, 8], spine: [0, -6, 12], chest: [0, -6, 6], head: [0, 0, -10], upperArmL: [0, 0, 30], upperArmR: [0, 0, -20] }, rest], { loop: false });

  // 11. Hoverboard (posture de surf)
  const hov = { hips: [0, 25, 0], spine: [14, -18, 0], chest: [4, -8, 0], head: [-10, -20, 0], thighL: [-28, 0, -8], shinL: [45, 0, 0], footL: [-15, -25, 0], thighR: [18, 0, 8], shinR: [42, 0, 0], footR: [-24, -25, 0], upperArmL: [-20, 0, 65], upperArmR: [10, 0, -60], foreArmL: [-30, 0, 0], foreArmR: [-30, 0, 0] };
  make('hoverboard', 1.6, [hov, { ...hov, spine: [18, -14, 4], upperArmL: [-26, 0, 72], upperArmR: [14, 0, -52], thighL: [-32, 0, -8], shinL: [52, 0, 0] }, hov], { plant: true });

  // 12. Collecte d'un bonus (additif : poing levé)
  make('collect', 0.55, [rest, { upperArmR: [-150, 0, -10], foreArmR: [-40, 0, 0], head: [-10, 0, 0], chest: [-6, 0, 0] }, rest], { loop: false });

  // 13. Collision / trébuchement
  make('hit', 0.5, [
    runPose(1, 10)[0],
    { spine: [-25, 0, 6], chest: [-12, 0, 0], head: [-25, 10, 0], upperArmL: [-130, 0, 50], upperArmR: [-120, 0, -60], foreArmL: [-30, 0, 0], foreArmR: [-30, 0, 0], thighL: [-30, 0, 0], shinL: [40, 0, 0], thighR: [20, 0, 0], shinR: [20, 0, 0] },
    runPose(1, 10)[1],
  ], { plant: true, loop: false });

  // 14. Fin de partie (chute en arrière)
  make('death', 1.0, [
    { spine: [-20, 0, 0], head: [-20, 0, 0], upperArmL: [-120, 0, 60], upperArmR: [-120, 0, -60], thighL: [-30, 0, 0], shinL: [30, 0, 0], hipsY: 0 },
    { hips: [-50, 0, 10], spine: [-20, 0, 0], head: [-10, 0, 0], upperArmL: [-160, 0, 80], upperArmR: [-150, 0, -70], thighL: [-60, 0, 0], shinL: [60, 0, 0], thighR: [-30, 0, 0], shinR: [50, 0, 0], hipsY: -0.4 },
    { hips: [-86, 0, 12], spine: [-6, 0, 0], head: [10, 20, 0], upperArmL: [-170, 0, 85], upperArmR: [-170, 0, -80], foreArmL: [-20, 0, 0], foreArmR: [-20, 0, 0], thighL: [-70, 0, 0], shinL: [80, 0, 0], thighR: [-40, 0, 0], shinR: [60, 0, 0], hipsY: -0.72 },
  ], { loop: false, times: [0, 0.35, 1.0] });

  // 15. Victoire de mission
  make('victory', 0.9, [
    { ...ARMS_DOWN, spine: [-6, 0, 0], head: [-15, 0, 0], upperArmL: [-170, 0, 25], upperArmR: [-170, 0, -25], foreArmL: [-10, 0, 0], foreArmR: [-10, 0, 0] },
    { spine: [4, 0, 0], head: [-5, 0, 0], upperArmL: [-150, 0, 40], upperArmR: [-150, 0, -40], foreArmL: [-50, 0, 0], foreArmR: [-50, 0, 0], thighL: [-40, 0, 0], shinL: [70, 0, 0], thighR: [-40, 0, 0], shinR: [70, 0, 0] },
    { ...ARMS_DOWN, spine: [-6, 0, 0], head: [-15, 0, 0], upperArmL: [-170, 0, 25], upperArmR: [-170, 0, -25], foreArmL: [-10, 0, 0], foreArmR: [-10, 0, 0] },
  ], { plant: true });

  // 16. Menu principal (petite danse)
  const m1 = { hips: [0, 15, 6], spine: [0, 0, -6], chest: [0, 10, 0], head: [8, -15, 6], upperArmL: [-90, 0, 50], foreArmL: [-90, 0, 0], upperArmR: [20, 0, -30], foreArmR: [-80, 0, 0], thighL: [-20, 0, -6], shinL: [30, 0, 0], thighR: [0, 0, 6], shinR: [5, 0, 0] };
  make('menu', 1.4, [m1, { ...mirror(m1) }, m1], { plant: true });

  // 17. Jetpack (vol)
  const jet = { spine: [32, 0, 0], chest: [6, 0, 0], head: [-36, 0, 0], thighL: [14, 0, 0], shinL: [22, 0, 0], thighR: [24, 0, 0], shinR: [34, 0, 0], footL: [30, 0, 0], footR: [30, 0, 0], upperArmL: [-20, 0, 30], upperArmR: [-20, 0, -30], foreArmL: [-50, 0, 0], foreArmR: [-50, 0, 0] };
  make('jetpack', 1.2, [jet, { ...jet, thighL: [24, 0, 0], thighR: [12, 0, 0], spine: [30, 0, 2] }, jet]);

  return clips;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function poseClip(root, bones, name, duration, poses, { plant, times, extraTracks }) {
  const n = poses.length;
  const t = times || poses.map((_, i) => (n === 1 ? 0 : (i / (n - 1)) * duration));
  const names = new Set(['hips']);
  const additive = name === 'leanLeft' || name === 'leanRight' || name === 'collect';
  for (const p of poses) for (const k of Object.keys(p)) if (k !== 'hipsY' && k !== 'hipsZ') names.add(k);
  if (!additive) for (const b of BONE_NAMES) names.add(b);
  const tracks = [];
  const hipsRest = REST.hips;
  const hipsY = [];
  // calcul des hauteurs de hanches (pieds posés au sol si `plant`)
  for (let i = 0; i < n; i++) {
    const p = poses[i];
    let y = hipsRest[1] + (p.hipsY || 0);
    if (plant) {
      applyPose(bones, p, y);
      root.updateMatrixWorld(true);
      const minY = soleMinY(bones);
      y -= minY; // le pied le plus bas touche y = 0
    }
    hipsY.push(y);
  }
  resetPose(bones);
  root.updateMatrixWorld(true);
  for (const b of names) {
    const values = [];
    for (const p of poses) {
      const r = p[b] || [0, 0, 0];
      _e.set(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ');
      _q.setFromEuler(_e);
      values.push(_q.x, _q.y, _q.z, _q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, t, values));
  }
  if (!additive) {
    const pv = [];
    for (let i = 0; i < n; i++) pv.push(hipsRest[0], hipsY[i], hipsRest[2] + (poses[i].hipsZ || 0));
    tracks.push(new THREE.VectorKeyframeTrack('hips.position', t, pv));
  }
  tracks.push(...extraTracks);
  const clip = new THREE.AnimationClip(name, duration, tracks);
  clip.userData = { additive };
  return clip;
}

function applyPose(bones, p, hipsY) {
  for (const b of BONE_NAMES) {
    const r = p[b] || [0, 0, 0];
    bones[b].rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ');
  }
  bones.hips.position.set(REST.hips[0], hipsY, REST.hips[2]);
}
function resetPose(bones) {
  for (const [name, , off] of BONES) {
    bones[name].rotation.set(0, 0, 0);
    bones[name].position.set(...off);
  }
}
const _v = new THREE.Vector3();
function soleMinY(bones) {
  let min = Infinity;
  for (const f of ['footL', 'footR']) {
    for (const z of [-0.09, 0.05, 0.19]) {
      _v.set(0, -0.05, z).applyMatrix4(bones[f].matrixWorld);
      if (_v.y < min) min = _v.y;
    }
  }
  return min;
}

// Applique une apparence (couleurs, coiffure, accessoires) à un personnage
// construit ou chargé depuis un GLB (recherche par noms).
export function applyLook(root, look) {
  const mats = {};
  root.traverse((o) => {
    if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats[m.name] = m;
    const m = /^(Hair|Acc)_([a-z]+)/.exec(o.name);
    if (!m) return;
    if (m[1] === 'Hair') o.visible = m[2] === (look.hair || 'spiky');
    else o.visible = (look.accessories || []).includes(m[2]);
  });
  const set = (n, c) => mats[n] && c && mats[n].color.set(c);
  set('Skin', look.skin);
  set('Hair', look.hairColor);
  set('Shirt', look.shirt);
  set('Accent', look.accent);
  set('Pants', look.pants);
  set('Shoes', look.shoes);
  set('Sole', look.sole);
  set('Accessory', look.accessory);
  return mats;
}

export const CLIP_NAMES = ['idle', 'runStart', 'run', 'sprint', 'jump', 'fall', 'land', 'roll', 'leanLeft', 'leanRight', 'hoverboard', 'collect', 'hit', 'death', 'victory', 'menu', 'jetpack'];
