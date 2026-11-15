// Utilitaires de géométrie : balayage de profils (carrosseries), fusion par
// matériau (réduction des draw calls), formes arrondies.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export { RoundedBoxGeometry };

// Profil 2D en rectangle à coins arrondis (points dans le sens anti-horaire).
export function roundedRectProfile(w, h, rTop, rBottom, seg = 5) {
  const pts = [];
  const hw = w / 2;
  const arc = (cx, cy, r, a0, a1) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((a1 - a0) * i) / seg;
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
  };
  arc(hw - rBottom, rBottom, rBottom, -Math.PI / 2, 0);
  arc(hw - rTop, h - rTop, rTop, 0, Math.PI / 2);
  arc(-hw + rTop, h - rTop, rTop, Math.PI / 2, Math.PI);
  arc(-hw + rBottom, rBottom, rBottom, Math.PI, Math.PI * 1.5);
  return pts;
}

// Balaye une polyligne 2D (x,y) le long de -z à travers des stations
// {z, sx, sy, dy}. UV : u = longueur le long du profil (normalisée par uScale),
// v = position z normalisée. Ouvre ou ferme le profil.
export function sweep(profile, stations, { closed = false, uLength = null, vLength = null, swapUV = false, flipWinding = false, uFlip = false } = {}) {
  const n = profile.length;
  const ring = closed ? n + 1 : n;
  const pos = [];
  const uv = [];
  const idx = [];
  const cum = [0];
  for (let i = 1; i < ring; i++) cum.push(cum[i - 1] + profile[i % n].distanceTo(profile[i - 1]));
  const total = uLength || cum[ring - 1] || 1;
  const z0 = stations[0].z;
  const zSpan = vLength || Math.abs(stations[stations.length - 1].z - z0) || 1;
  for (const st of stations) {
    const sy = st.sy ?? 1;
    const pivot = st.pivotY ?? 0;
    for (let i = 0; i < ring; i++) {
      const p = profile[i % n];
      pos.push(p.x * (st.sx ?? 1), (p.y - pivot) * sy + pivot + (st.dy ?? 0), st.z);
      let a = cum[i] / total;
      let b = Math.abs(st.z - z0) / zSpan;
      if (uFlip) b = 1 - b;
      if (swapUV) uv.push(b, a);
      else uv.push(a, b);
    }
  }
  for (let s = 0; s < stations.length - 1; s++) {
    for (let i = 0; i < ring - 1; i++) {
      const a = s * ring + i;
      const b = a + 1;
      const c = a + ring;
      const d = c + 1;
      if (flipWinding) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Cap plan à partir d'un contour, UV normalisées sur la boîte englobante.
export function capShape(points, z, facing = 1) {
  const shape = new THREE.Shape(points);
  const g = new THREE.ShapeGeometry(shape, 6);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const uv = g.attributes.uv;
  const p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x || 1), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y || 1));
  }
  if (facing < 0) g.rotateY(Math.PI);
  g.translate(0, 0, z);
  return g;
}

// Remplit un contour plan (cap) situé à z donné.
export function capFromProfile(profile, z, facing = 1, sx = 1, sy = 1, dy = 0) {
  const shape = new THREE.Shape(profile.map((p) => new THREE.Vector2(p.x * sx, p.y * sy + dy)));
  const g = new THREE.ShapeGeometry(shape, 4);
  if (facing < 0) g.rotateY(Math.PI);
  g.translate(0, 0, z);
  return g;
}

function normalizeAttributes(g) {
  let geo = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(geo.attributes)) {
    if (!['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight'].includes(name)) geo.deleteAttribute(name);
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  return geo;
}

// Accumulateur de pièces → un Mesh par matériau.
export class PartBuilder {
  constructor() {
    this.parts = new Map(); // material -> geometries[]
    this.tmp = new THREE.Matrix4();
  }
  add(geometry, material, { position, rotation, scale, matrix } = {}) {
    const g = normalizeAttributes(geometry);
    let m = matrix;
    if (!m) {
      m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rotation || [0, 0, 0])));
      m.compose(new THREE.Vector3(...(position || [0, 0, 0])), q, new THREE.Vector3(...(Array.isArray(scale) ? scale : [scale ?? 1, scale ?? 1, scale ?? 1])));
    }
    g.applyMatrix4(m);
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(g);
    geometry !== g && geometry.dispose?.();
    return this;
  }
  build(name = 'Model', { castShadow = true, receiveShadow = false } = {}) {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, list] of this.parts) {
      const raw = mergeGeometries(list, false);
      const merged = mergeVertices(raw);
      raw.dispose();
      list.forEach((g) => g.dispose());
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${name}_${mat.name || 'mat'}`;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    return group;
  }
  // Fusionne tout dans une seule géométrie (pour InstancedMesh à un matériau).
  buildGeometry() {
    const all = [];
    for (const list of this.parts.values()) all.push(...list);
    const raw = mergeGeometries(all, false);
    const merged = mergeVertices(raw);
    raw.dispose();
    all.forEach((g) => g.dispose());
    merged.computeBoundingSphere();
    return merged;
  }
  // Une géométrie avec groupes + tableau de matériaux (pour InstancedMesh multi-matériaux).
  buildGrouped() {
    const geos = [];
    const mats = [];
    for (const [mat, list] of this.parts) {
      const raw = mergeGeometries(list, false);
      geos.push(mergeVertices(raw));
      raw.dispose();
      list.forEach((g) => g.dispose());
      mats.push(mat);
    }
    const merged = mergeGeometries(geos, true);
    geos.forEach((g) => g.dispose());
    merged.computeBoundingSphere();
    return { geometry: merged, materials: mats };
  }
}

// Bruit simple déterministe pour déformer des géométries (rochers, montagnes).
export function jitterGeometry(g, amount, seed = 1) {
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed * 2) * Math.sin(v.z * 3.7 + seed * 3);
    v.multiplyScalar(1 + n * amount);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function tube(points, radius, segments = 24, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), closed);
  return new THREE.TubeGeometry(curve, segments, radius, radial, closed);
}
