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
// Tête plus petite qu'à l'origine (proportions d'adolescent, moins « poupée ») :
// toutes les pièces liées à l'os de la tête (visage, coiffures, accessoires)
// sont mises à l'échelle autour du cou.
const HEAD_K = 0.82;

class SkinParts {
  constructor(boneIndex) {
    this.boneIndex = boneIndex;
    this.byMat = new Map();
  }
  add(geo, mat, bone, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    if (bone === 'head') {
      const b = REST.head;
      pos = [b[0] + (pos[0] - b[0]) * HEAD_K, b[1] + (pos[1] - b[1]) * HEAD_K, b[2] + (pos[2] - b[2]) * HEAD_K];
      scale = scale.map((v) => v * HEAD_K);
    }
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
  const H = (dx, dy, dz) => [dx, headC[1] + dy, headC[2] + dz];
  body.add(sph(0.2, 32, 24), M.Skin, 'head', { pos: headC, scale: [0.92, 1.06, 0.98] }); // crâne
  body.add(sph(0.13, 20, 14), M.Skin, 'head', { pos: H(0, -0.095, 0.035), scale: [0.95, 0.86, 1.02] }); // mâchoire
  body.add(sph(0.06, 14, 10), M.Skin, 'head', { pos: H(0, -0.15, 0.1), scale: [1.1, 0.75, 0.9] }); // menton
  for (const sx of [1, -1]) {
    body.add(sph(0.05, 14, 10), M.Skin, 'head', { pos: H(sx * 0.08, -0.06, 0.1), scale: [1, 0.72, 0.7] }); // pommettes
    // oreilles : pavillon + rebord
    body.add(sph(0.05, 12, 10), M.Skin, 'head', { pos: H(sx * 0.19, -0.015, -0.015), scale: [0.42, 1, 0.75] });
    body.add(new THREE.TorusGeometry(0.034, 0.008, 6, 14, Math.PI * 1.4), M.Skin, 'head', { pos: H(sx * 0.205, -0.012, -0.015), rot: [0, sx * Math.PI / 2, 0.5], scale: [1, 1.25, 1] });
    // yeux : blanc, iris, reflet, paupière supérieure
    body.add(sph(0.043, 16, 12), M.EyeWhite, 'head', { pos: H(sx * 0.072, 0.02, 0.152), scale: [1, 1.02, 0.6] });
    body.add(sph(0.026, 14, 10), M.EyeDark, 'head', { pos: H(sx * 0.071, 0.018, 0.172), scale: [1, 1.05, 0.5] });
    body.add(sph(0.008, 6, 4), M.EyeWhite, 'head', { pos: H(sx * 0.071 + 0.009, 0.03, 0.184) });
    body.add(sph(0.047, 16, 8, Math.PI * 2, 0, Math.PI * 0.42), M.Skin, 'head', { pos: H(sx * 0.072, 0.022, 0.15), rot: [-0.32, 0, 0], scale: [1.04, 1.02, 0.66] });
    // sourcils arqués
    body.add(new THREE.TorusGeometry(0.048, 0.011, 6, 14, Math.PI * 0.55), M.Hair, 'head', { pos: H(sx * 0.074, 0.052, 0.178), rot: [-0.2, 0, Math.PI * 0.225 + sx * -0.12], scale: [1, 0.55, 1] });
    // ailes du nez
    body.add(sph(0.014, 8, 6), M.Skin, 'head', { pos: H(sx * 0.02, -0.048, 0.188) });
  }
  body.add(sph(0.026, 12, 10), M.Skin, 'head', { pos: H(0, -0.03, 0.192), scale: [0.85, 1.2, 1.3] }); // nez
  body.add(new THREE.TorusGeometry(0.036, 0.009, 6, 16, Math.PI), M.Mouth, 'head', { pos: H(0, -0.088, 0.168), rot: [-0.3, 0, Math.PI] }); // sourire
  body.add(sph(0.022, 10, 6), M.Mouth, 'head', { pos: H(0, -0.112, 0.16), scale: [1.4, 0.45, 0.6] }); // lèvre inférieure
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
    body.add(sph(0.076, 14, 10), M.Shirt, 'upperArm' + s, { pos: [sh[0] - sx * 0.012, sh[1] - 0.012, 0] });
    limb(body, M.Shirt, 'upperArm' + s, sh, el, 0.074, 0.062);
    body.add(sph(0.062, 12, 8), M.Shirt, 'foreArm' + s, { pos: el });
    limb(body, M.Shirt, 'foreArm' + s, el, [wr[0], wr[1] + 0.03, wr[2]], 0.06, 0.05);
    body.add(new THREE.TorusGeometry(0.05, 0.016, 6, 14), M.Accent, 'foreArm' + s, { pos: [wr[0], wr[1] + 0.035, wr[2]], rot: [Math.PI / 2, 0, 0] });
    // main : paume, quatre doigts légèrement repliés, pouce vers l'avant
    body.add(new RoundedBoxGeometry(0.036, 0.075, 0.07, 2, 0.015), M.Skin, 'hand' + s, { pos: [wr[0], wr[1] - 0.045, wr[2] + 0.004] });
    for (const [i, dz] of [-0.026, -0.009, 0.008, 0.025].entries()) {
      const len = [0.036, 0.046, 0.05, 0.044][i];
      body.add(new THREE.CapsuleGeometry(0.0095, len, 3, 8), M.Skin, 'hand' + s, { pos: [wr[0] - sx * 0.006, wr[1] - 0.095 - len * 0.35, wr[2] + dz], rot: [0, 0, -sx * 0.32] });
    }
    body.add(new THREE.CapsuleGeometry(0.011, 0.036, 3, 8), M.Skin, 'hand' + s, { pos: [wr[0] - sx * 0.012, wr[1] - 0.055, wr[2] + 0.046], rot: [-0.7, 0, -sx * 0.25] });
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
    // Basket : semelle intermédiaire, bande claire, tige, bout renforcé, contrefort, languette, lacets, tirant
    body.add(new RoundedBoxGeometry(0.15, 0.05, 0.31, 3, 0.022), M.Sole, 'foot' + s, { pos: [an[0], 0.025, 0.05] });
    body.add(new RoundedBoxGeometry(0.152, 0.012, 0.312, 2, 0.006), M.Accent, 'foot' + s, { pos: [an[0], 0.047, 0.05] });
    body.add(new RoundedBoxGeometry(0.134, 0.1, 0.25, 3, 0.045), M.Shoes, 'foot' + s, { pos: [an[0], 0.095, 0.035] });
    body.add(sph(0.066, 14, 10, Math.PI * 2, 0, Math.PI / 2), M.Shoes, 'foot' + s, { pos: [an[0], 0.06, 0.15], scale: [1, 0.85, 0.95] });
    body.add(sph(0.067, 14, 8, Math.PI * 2, 0, Math.PI / 2), M.Sole, 'foot' + s, { pos: [an[0], 0.052, 0.168], scale: [1.02, 0.5, 0.8] }); // pare-pierres
    body.add(new RoundedBoxGeometry(0.128, 0.07, 0.06, 2, 0.025), M.Accent, 'foot' + s, { pos: [an[0], 0.1, -0.075] }); // contrefort
    body.add(new RoundedBoxGeometry(0.07, 0.02, 0.12, 2, 0.008), M.Shoes, 'foot' + s, { pos: [an[0], 0.152, 0.07], rot: [0.32, 0, 0] }); // languette
    for (let i = 0; i < 4; i++) body.add(new THREE.BoxGeometry(0.074, 0.01, 0.014), M.Sole, 'foot' + s, { pos: [an[0], 0.148 - i * 0.008, 0.035 + i * 0.03], rot: [0.32, 0, 0] });
    body.add(new RoundedBoxGeometry(0.03, 0.05, 0.012, 1, 0.005), M.Accent, 'foot' + s, { pos: [an[0], 0.17, -0.1] }); // tirant
    body.add(cyl(0.062, 0.066, 0.06), M.Shoes, 'foot' + s, { pos: [an[0], 0.14, -0.025] });
    // poches et coutures du jean
    body.add(new RoundedBoxGeometry(0.012, 0.09, 0.07, 1, 0.004), M.Accent, 'thigh' + s, { pos: [th[0] + sx * 0.092, th[1] - 0.04, th[2] + 0.02], rot: [0, 0, sx * 0.12] });
    body.add(new RoundedBoxGeometry(0.075, 0.08, 0.01, 1, 0.004), M.Accent, 'hips', { pos: [sx * 0.08, R.hips[1] - 0.035, -0.121] });
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
    if (k === 'hips' || k === 'spine' || k === 'chest' || k === 'neck' || k === 'head') { out[k] = [v[0], -v[1], -v[2]]; continue; }
    let nk = k;
    if (k.endsWith('L')) nk = k.slice(0, -1) + 'R';
    else if (k.endsWith('R')) nk = k.slice(0, -1) + 'L';
    out[nk] = [v[0], -v[1], -v[2]];
  }
  return out;
}

const ARMS_DOWN = { upperArmL: [0, 0, 8], upperArmR: [0, 0, -8], foreArmL: [-12, 0, 0], foreArmR: [-12, 0, 0] };

// Foulée de course en 8 poses (contact, amorti, passage, poussée, puis
// symétrique) : bassin qui tourne avec la jambe avant, buste en contre-
// rotation, bras opposés aux jambes avec le coude plié, tête stabilisée,
// et une phase de suspension (`lift`) après la poussée.
function runPose(amp = 1, lean = 10) {
  const L = (v) => v * amp;
  const contact = {
    hips: [0, -7 * amp, 2], spine: [lean, 5, -1], chest: [3, 7 * amp, 0], neck: [-4, -4, 0], head: [-lean * 0.55, -6, 0],
    thighR: [L(-42), 0, 0], shinR: [14, 0, 0], footR: [6, 0, 0],
    thighL: [L(26), 0, 0], shinL: [L(52), 0, 0], footL: [22, 0, 0],
    upperArmL: [L(-46), 0, 9], foreArmL: [-78, 0, 0], handL: [0, 0, 6],
    upperArmR: [L(40), 0, -9], foreArmR: [-44, 0, 0], handR: [0, 0, -6],
  };
  const down = {
    hips: [0, -4 * amp, 3], spine: [lean + 3, 3, -1], chest: [4, 4 * amp, 0], neck: [-5, -2, 0], head: [-lean * 0.55, -3, 0],
    thighR: [L(-24), 0, 0], shinR: [L(34), 0, 0], footR: [-6, 0, 0],
    thighL: [L(12), 0, 0], shinL: [L(96), 0, 0], footL: [34, 0, 0],
    upperArmL: [L(-26), 0, 9], foreArmL: [-82, 0, 0], handL: [0, 0, 6],
    upperArmR: [L(24), 0, -9], foreArmR: [-56, 0, 0], handR: [0, 0, -6],
  };
  const pass = {
    hips: [0, 0, 0], spine: [lean + 1, 0, 0], chest: [3, 0, 0], neck: [-4, 0, 0], head: [-lean * 0.55, 0, 0],
    thighR: [4, 0, 0], shinR: [16, 0, 0], footR: [-10, 0, 0],
    thighL: [L(-30), 0, 0], shinL: [L(104), 0, 0], footL: [26, 0, 0],
    upperArmL: [-4, 0, 9], foreArmL: [-76, 0, 0],
    upperArmR: [4, 0, -9], foreArmR: [-70, 0, 0],
  };
  const push = {
    hips: [0, 6 * amp, -2], spine: [lean - 1, -4, 1], chest: [2, -6 * amp, 0], neck: [-3, 3, 0], head: [-lean * 0.55, 5, 0],
    thighR: [L(24), 0, 0], shinR: [L(22), 0, 0], footR: [L(34), 0, 0],
    thighL: [L(-52), 0, 0], shinL: [L(62), 0, 0], footL: [-4, 0, 0],
    upperArmL: [L(30), 0, 9], foreArmL: [-50, 0, 0],
    upperArmR: [L(-38), 0, -9], foreArmR: [-80, 0, 0],
    lift: 0.045 * amp,
  };
  return [contact, down, pass, push, mirror(contact), mirror(down), mirror(pass), { ...mirror(push), lift: push.lift }, contact];
}

function buildClips(root, bones) {
  const clips = [];
  const make = (name, duration, poses, { plant = false, loop = true, times = null, extraTracks = [] } = {}) => {
    clips.push(poseClip(root, bones, name, duration, poses, { plant, times, extraTracks }));
  };

  // 1. Idle : respiration, report du poids d'une jambe sur l'autre, regard qui balaie
  const idleA = { ...ARMS_DOWN, hips: [0, 4, 3], spine: [1, -2, -2], chest: [0, -2, 0], neck: [0, 0, 0], head: [2, 4, 1], thighL: [0, 0, -1], thighR: [0, 0, 4], shinL: [6, 0, 0], footL: [-3, 0, 0], upperArmL: [3, 0, 9], upperArmR: [-2, 0, -7], foreArmL: [-14, 0, 0], foreArmR: [-10, 0, 0] };
  const idleB = { ...ARMS_DOWN, hips: [0, -2, -1], spine: [-2, 0, 1], chest: [-4, 2, 0], head: [-2, -10, 0], thighL: [0, 0, -3], thighR: [0, 0, 2], upperArmL: [1, 0, 11], upperArmR: [1, 0, -11], foreArmL: [-16, 0, 0], foreArmR: [-16, 0, 0] };
  const idleC = { ...ARMS_DOWN, hips: [0, -4, -3], spine: [1, 2, 2], chest: [0, 2, 0], head: [2, -2, -1], thighL: [0, 0, -4], thighR: [0, 0, 1], shinR: [6, 0, 0], footR: [-3, 0, 0], upperArmL: [-2, 0, 7], upperArmR: [3, 0, -9], foreArmL: [-10, 0, 0], foreArmR: [-14, 0, 0] };
  make('idle', 4.2, [idleA, idleB, idleC, idleB, idleA], { plant: true });

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
  // genoux qui « pompent » comme sur une vraie planche, bras d'équilibre
  const hov2 = { ...hov, hips: [0, 22, 3], spine: [20, -14, 4], chest: [6, -6, 2], upperArmL: [-28, 0, 74], upperArmR: [16, 0, -50], foreArmL: [-38, 0, 0], thighL: [-42, 0, -8], shinL: [70, 0, 0], footL: [-24, -25, 0], thighR: [8, 0, 8], shinR: [62, 0, 0], footR: [-34, -25, 0] };
  const hov3 = { ...hov, hips: [0, 28, -3], spine: [12, -20, -3], head: [-8, -24, 0], upperArmL: [-14, 0, 60], upperArmR: [6, 0, -68] };
  make('hoverboard', 1.8, [hov, hov2, hov, hov3, hov], { plant: true });

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

  // 16. Menu principal : danse sur 4 temps (rebond des genoux, épaules, bras qui pompent)
  const beat = (side, down) => {
    const sx = side;
    return {
      hips: [0, 14 * sx, 5 * sx], spine: [down ? 6 : 0, -4 * sx, -6 * sx], chest: [down ? 4 : -2, 12 * sx, 3 * sx], head: [down ? 10 : -4, -10 * sx, 6 * sx],
      thighL: [down ? -22 : -6, 0, -6], shinL: [down ? 42 : 10, 0, 0], thighR: [down ? -22 : -6, 0, 6], shinR: [down ? 42 : 10, 0, 0],
      upperArmL: [sx > 0 ? -95 : -30, 0, sx > 0 ? 45 : 25], foreArmL: [sx > 0 ? -95 : -60, 0, 0],
      upperArmR: [sx < 0 ? -95 : -30, 0, sx < 0 ? -45 : -25], foreArmR: [sx < 0 ? -95 : -60, 0, 0],
      handL: [0, 0, down ? 15 : -10], handR: [0, 0, down ? -15 : 10],
    };
  };
  make('menu', 1.6, [beat(1, false), beat(1, true), beat(-1, false), beat(-1, true), beat(1, false)], { plant: true });

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
  for (const p of poses) for (const k of Object.keys(p)) if (k !== 'hipsY' && k !== 'hipsZ' && k !== 'lift') names.add(k);
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
      y += p.lift || 0; // phase de suspension (course)
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
    // couleurs appliquées aux matériaux d'origine, même si un skin est affiché par-dessus
    const base = o.isMesh ? (o.userData.baseMaterial ?? o.material) : null;
    if (base) for (const m of Array.isArray(base) ? base : [base]) mats[m.name] = m;
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
