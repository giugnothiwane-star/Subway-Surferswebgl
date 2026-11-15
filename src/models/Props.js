// Objets du jeu : pièces, bonus, obstacles et éléments de décor.
// Toutes les fonctions renvoient soit un Group (objets uniques), soit
// { geometry, materials } fusionné pour l'instanciation (InstancedMesh).
import * as THREE from 'three';
import { PartBuilder, RoundedBoxGeometry, jitterGeometry, tube } from './geo.js';
import { neonSignTexture, posterTexture, stripeTexture } from './textures.js';
import { BARRIER, RAMP, TRAIN } from '../gameplay/constants.js';

const mats = {};
export const sharedMaterials = new Set();
export function mat(name, params, Type = THREE.MeshStandardMaterial) {
  if (!mats[name]) {
    mats[name] = new Type(params);
    mats[name].name = name;
    sharedMaterials.add(mats[name]);
  }
  return mats[name];
}

// ---- Pièce -----------------------------------------------------------------
// Pièce épaisse : tranche crantée, rebord, symbole original en relief (éclair
// stylisé dans un losange) sur les deux faces.
export function coinGeometry({ symbol = true } = {}) {
  const pb = new PartBuilder();
  const gold = mat('Gold', { color: 0xffc23a, metalness: 1, roughness: 0.22, emissive: 0x3a2200, emissiveIntensity: 0.25 });
  const prof = [
    [0, 0.032], [0.27, 0.032], [0.3, 0.05], [0.37, 0.06], [0.4, 0.05], [0.405, 0.02], [0.405, -0.02], [0.4, -0.05], [0.37, -0.06], [0.3, -0.05], [0.27, -0.032], [0, -0.032],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  pb.add(new THREE.LatheGeometry(prof.reverse(), 28), gold, { rotation: [Math.PI / 2, 0, 0] });
  // crans de la tranche
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pb.add(new THREE.BoxGeometry(0.02, 0.07, 0.03), gold, { position: [Math.cos(a) * 0.405, Math.sin(a) * 0.405, 0], rotation: [0, 0, a] });
  }
  // symbole : losange + éclair
  const bolt = new THREE.Shape();
  bolt.moveTo(0.03, 0.17); bolt.lineTo(-0.09, -0.01); bolt.lineTo(-0.01, -0.01); bolt.lineTo(-0.04, -0.17); bolt.lineTo(0.09, 0.03); bolt.lineTo(0.01, 0.03); bolt.closePath();
  const ring = new THREE.Shape();
  ring.moveTo(0, 0.24); ring.lineTo(0.24, 0); ring.lineTo(0, -0.24); ring.lineTo(-0.24, 0); ring.closePath();
  const hole = new THREE.Path();
  hole.moveTo(0, 0.2); hole.lineTo(-0.2, 0); hole.lineTo(0, -0.2); hole.lineTo(0.2, 0); hole.closePath();
  ring.holes.push(hole);
  for (const side of symbol ? [1, -1] : []) {
    const opts = { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 };
    pb.add(new THREE.ExtrudeGeometry(bolt, opts), gold, { position: [0, 0, side * 0.03], rotation: [0, side < 0 ? Math.PI : 0, 0] });
    pb.add(new THREE.ExtrudeGeometry(ring, { ...opts, depth: 0.012 }), gold, { position: [0, 0, side * 0.03], rotation: [0, side < 0 ? Math.PI : 0, 0] });
  }
  return { geometry: pb.buildGeometry(), material: gold };
}

// ---- Bonus -----------------------------------------------------------------
export function magnetModel() {
  const pb = new PartBuilder();
  const red = mat('MagnetRed', { color: 0xff2d3d, metalness: 0.3, roughness: 0.22, emissive: 0x400008, emissiveIntensity: 0.5 });
  const tip = mat('MagnetTip', { color: 0xf2f6ff, metalness: 0.9, roughness: 0.15 });
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI + (i / 16) * Math.PI;
    pts.push([Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0]);
  }
  pb.add(tube([[-0.28, 0.32, 0], [-0.28, 0.05, 0], ...pts, [0.28, 0.05, 0], [0.28, 0.32, 0]], 0.1, 48, 12), red);
  for (const sx of [-1, 1]) pb.add(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 14), tip, { position: [sx * 0.28, 0.4, 0] });
  const g = pb.build('Magnet');
  g.position.y = 0.05;
  return g;
}

export function jetpackModel() {
  const pb = new PartBuilder();
  const body = mat('JetBody', { color: 0xffd23a, metalness: 0.5, roughness: 0.3 });
  const metal = mat('JetMetal', { color: 0xc8d0da, metalness: 0.9, roughness: 0.2 });
  const dark = mat('JetDark', { color: 0x2a2d34, metalness: 0.3, roughness: 0.6 });
  const glow = mat('JetGlow', { color: 0x66e0ff, emissive: 0x33c8ff, emissiveIntensity: 1.6 });
  for (const sx of [-1, 1]) {
    pb.add(new THREE.CapsuleGeometry(0.11, 0.36, 6, 16), body, { position: [sx * 0.13, 0.05, 0] });
    pb.add(new THREE.CylinderGeometry(0.07, 0.1, 0.12, 14), metal, { position: [sx * 0.13, -0.27, 0] });
    pb.add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 14), glow, { position: [sx * 0.13, -0.34, 0] });
    pb.add(new THREE.TorusGeometry(0.115, 0.015, 6, 16), dark, { position: [sx * 0.13, 0.15, 0], rotation: [Math.PI / 2, 0, 0] });
  }
  pb.add(new RoundedBoxGeometry(0.16, 0.36, 0.14, 2, 0.04), dark, { position: [0, 0.05, 0.04] });
  pb.add(new THREE.SphereGeometry(0.05, 10, 8), glow, { position: [0, 0.16, -0.04] });
  return pb.build('Jetpack');
}

export function sneakerModel() {
  const pb = new PartBuilder();
  const upper = mat('SneakUpper', { color: 0x2fe07a, roughness: 0.4, emissive: 0x0b4020, emissiveIntensity: 0.4 });
  const sole = mat('SneakSole', { color: 0xffffff, roughness: 0.5 });
  const wing = mat('SneakWing', { color: 0xffffff, roughness: 0.3, emissive: 0x99ffcc, emissiveIntensity: 0.5 });
  pb.add(new RoundedBoxGeometry(0.22, 0.17, 0.46, 3, 0.07), upper, { position: [0, 0.13, 0] });
  pb.add(new RoundedBoxGeometry(0.25, 0.07, 0.52, 2, 0.03), sole, { position: [0, 0.035, 0.02] });
  pb.add(new THREE.CylinderGeometry(0.1, 0.11, 0.12, 14), upper, { position: [0, 0.25, -0.1] });
  for (const sx of [-1, 1]) {
    const w = new THREE.Shape();
    w.moveTo(0, 0); w.quadraticCurveTo(0.12, 0.2, 0.32, 0.22); w.quadraticCurveTo(0.2, 0.12, 0.26, 0.06); w.quadraticCurveTo(0.12, 0.05, 0, 0);
    pb.add(new THREE.ExtrudeGeometry(w, { depth: 0.015, bevelEnabled: false }), wing, { position: [sx * 0.12, 0.18, -0.1], rotation: [0, sx * -Math.PI / 2, 0] });
  }
  return pb.build('Sneakers');
}

export function shieldPickupModel() {
  const pb = new PartBuilder();
  const blue = mat('ShieldBlue', { color: 0x3aa8ff, metalness: 0.6, roughness: 0.2, emissive: 0x0b3a77, emissiveIntensity: 0.6 });
  const white = mat('ShieldWhite', { color: 0xffffff, metalness: 0.3, roughness: 0.3 });
  const s = new THREE.Shape();
  s.moveTo(0, 0.32); s.quadraticCurveTo(0.18, 0.28, 0.27, 0.3); s.quadraticCurveTo(0.27, -0.08, 0, -0.32); s.quadraticCurveTo(-0.27, -0.08, -0.27, 0.3); s.quadraticCurveTo(-0.18, 0.28, 0, 0.32);
  pb.add(new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }), blue, { position: [0, 0, -0.03] });
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.05 : 0.12;
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    i === 0 ? star.moveTo(Math.cos(a) * r, Math.sin(a) * r) : star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  for (const side of [1, -1]) pb.add(new THREE.ExtrudeGeometry(star, { depth: 0.02, bevelEnabled: false }), white, { position: [0, 0.03, side * 0.055], rotation: [0, side < 0 ? Math.PI : 0, 0] });
  return pb.build('ShieldPickup');
}

export function multiplierModel() {
  const pb = new PartBuilder();
  const purple = mat('MultBody', { color: 0xa45cff, metalness: 0.5, roughness: 0.25, emissive: 0x3a0d77, emissiveIntensity: 0.6 });
  const white = mat('MultWhite', { color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4 });
  const star = new THREE.Shape();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? 0.25 : 0.34;
    const a = (i / 16) * Math.PI * 2;
    i === 0 ? star.moveTo(Math.cos(a) * r, Math.sin(a) * r) : star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  pb.add(new THREE.ExtrudeGeometry(star, { depth: 0.08, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 }), purple, { position: [0, 0, -0.04] });
  // « x2 » en relief, tracé à la main
  const two = new THREE.Shape();
  two.moveTo(-0.02, 0.1); two.quadraticCurveTo(0.12, 0.16, 0.13, 0.05); two.quadraticCurveTo(0.12, -0.02, 0.02, -0.07); two.lineTo(0.14, -0.07); two.lineTo(0.14, -0.12); two.lineTo(-0.04, -0.12); two.lineTo(-0.04, -0.08); two.quadraticCurveTo(0.08, -0.01, 0.075, 0.05); two.quadraticCurveTo(0.06, 0.1, 0.0, 0.06); two.closePath();
  const x = new THREE.Shape();
  x.moveTo(-0.17, 0.04); x.lineTo(-0.14, 0.04); x.lineTo(-0.11, -0.01); x.lineTo(-0.08, 0.04); x.lineTo(-0.05, 0.04); x.lineTo(-0.095, -0.035); x.lineTo(-0.05, -0.11); x.lineTo(-0.08, -0.11); x.lineTo(-0.11, -0.06); x.lineTo(-0.14, -0.11); x.lineTo(-0.17, -0.11); x.lineTo(-0.125, -0.035); x.closePath();
  for (const side of [1, -1]) {
    for (const sh of [two, x]) pb.add(new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false }), white, { position: [0, 0.02, side * 0.058], rotation: [0, side < 0 ? Math.PI : 0, 0] });
  }
  return pb.build('Multiplier');
}

export function powerupModel(type) {
  switch (type) {
    case 'magnet': return magnetModel();
    case 'jetpack': return jetpackModel();
    case 'sneakers': return sneakerModel();
    case 'shield': return shieldPickupModel();
    case 'multiplier': return multiplierModel();
    default: return magnetModel();
  }
}

// Halo lumineux des pièces : billboard additif (toujours face à la caméra),
// utilisable en InstancedMesh (taille prise dans la matrice d'instance).
export function coinGlowMaterial(color = 0xffd23a, intensity = 0.6) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uTime: { value: 0 } },
    vertexShader: `uniform float uTime; varying vec2 vUv; varying float vFade; varying float vSeed;
      void main(){
        vUv = uv;
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vec4 center = m * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(m[1].xyz);
        vSeed = fract(center.z * 0.173 + center.x * 0.31);
        vec4 mv = viewMatrix * center;
        float pulse = 1.0 + 0.08 * sin(uTime * 4.0 + vSeed * 6.28);
        mv.xy += position.xy * s * 1.9 * pulse;
        vFade = clamp(1.0 - (-mv.z - 60.0) / 140.0, 0.0, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uIntensity; varying vec2 vUv; varying float vFade; varying float vSeed;
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.25, d) * 0.8 + smoothstep(0.55, 0.42, abs(d - 0.48)) * 0.0;
        a *= uIntensity * vFade;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
}

// Bulle du bouclier : shader de Fresnel transparent.
export function shieldBubbleMaterial(color = 0x59c8ff) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uFade: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); vP = position; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uFade; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); float hex = 0.5 + 0.5*sin(vP.y*28.0 + uTime*3.0)*sin(vP.x*24.0 - uTime*2.0);
      float a = (f*0.9 + hex*0.08) * uFade; gl_FragColor = vec4(uColor * (0.6 + f), a); }`,
  });
}

// ---- Obstacles ---------------------------------------------------------------
export function barrierLowModel(theme = {}) {
  const pb = new PartBuilder();
  const panel = mat(`BarrierPanel_${theme.barrier || 'red'}`, { map: stripeTexture(theme.barrierA || '#ffffff', theme.barrierB || '#e63946', 7), roughness: 0.5, metalness: 0.1 });
  const post = mat('BarrierPost', { color: 0x9aa3ad, metalness: 0.8, roughness: 0.3 });
  const refl = mat('BarrierReflector', { color: 0xffd23a, emissive: 0xffa000, emissiveIntensity: 0.6 });
  const b = BARRIER.low;
  pb.add(new RoundedBoxGeometry(b.width, 0.42, 0.12, 2, 0.04), panel, { position: [0, 0.72, 0] });
  for (const sx of [-1, 1]) {
    pb.add(new THREE.BoxGeometry(0.1, 0.95, 0.1), post, { position: [sx * (b.width / 2 - 0.12), 0.47, 0] });
    pb.add(new THREE.BoxGeometry(0.1, 0.05, 0.7), post, { position: [sx * (b.width / 2 - 0.12), 0.03, 0] });
    pb.add(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), refl, { position: [sx * 0.7, 0.98, 0.04], rotation: [Math.PI / 2, 0, 0] });
  }
  pb.add(new THREE.BoxGeometry(b.width - 0.2, 0.05, 0.05), post, { position: [0, 0.4, 0] });
  return pb.build('BarrierLow');
}

export function barrierHighModel(theme = {}) {
  const pb = new PartBuilder();
  const panel = mat(`BarrierPanelHigh_${theme.barrier || 'red'}`, { map: stripeTexture(theme.barrierB || '#e63946', theme.barrierA || '#ffffff', 9), roughness: 0.5 });
  const post = mat('BarrierPost', { color: 0x9aa3ad, metalness: 0.8, roughness: 0.3 });
  const sign = mat('BarrierSign', { color: 0xffd23a, emissive: 0x553300, emissiveIntensity: 0.4 });
  const lamp = mat('BarrierLamp', { color: 0xff3b30, emissive: 0xff2a10, emissiveIntensity: 2 });
  const b = BARRIER.high;
  pb.add(new RoundedBoxGeometry(b.width, b.y1 - b.y0 - 0.95, 0.14, 2, 0.05), panel, { position: [0, b.y0 + (b.y1 - b.y0 - 0.95) / 2 + 0.05, 0] });
  for (const sx of [-1, 1]) {
    pb.add(new THREE.BoxGeometry(0.12, b.y1, 0.12), post, { position: [sx * (b.width / 2 + 0.02), b.y1 / 2, 0] });
    pb.add(new THREE.SphereGeometry(0.08, 10, 8), lamp, { position: [sx * (b.width / 2 + 0.02), b.y1 + 0.06, 0] });
  }
  // panneau « baisse-toi » (triangle original)
  const tri = new THREE.Shape();
  tri.moveTo(0, 0.32); tri.lineTo(0.3, -0.2); tri.lineTo(-0.3, -0.2); tri.closePath();
  pb.add(new THREE.ExtrudeGeometry(tri, { depth: 0.04, bevelEnabled: false }), sign, { position: [0, b.y1 - 0.38, 0.07] });
  return pb.build('BarrierHigh');
}

export function rampModel() {
  const pb = new PartBuilder();
  const plate = mat('RampPlate', { color: 0x8a939e, metalness: 0.7, roughness: 0.45 });
  const frame = mat('RampFrame', { color: 0x3a3f48, metalness: 0.4, roughness: 0.6 });
  const stripe = mat('RampStripe', { map: stripeTexture('#ffd23a', '#222222', 10), roughness: 0.5 });
  const L = RAMP.length;
  const H = TRAIN.height;
  const angle = Math.atan2(H, L);
  const hyp = Math.hypot(L, H);
  // plan incliné (repère : la rampe monte vers -z)
  pb.add(new THREE.BoxGeometry(RAMP.width, 0.08, hyp), plate, { position: [0, H / 2, -L / 2], rotation: [angle, 0, 0] });
  for (const sx of [-1, 1]) {
    pb.add(new THREE.BoxGeometry(0.1, 0.18, hyp), stripe, { position: [sx * (RAMP.width / 2 - 0.05), H / 2 + 0.1, -L / 2], rotation: [angle, 0, 0] });
    // flanc triangulaire
    const tri = new THREE.Shape();
    tri.moveTo(0, 0); tri.lineTo(L, 0); tri.lineTo(L, H); tri.closePath();
    pb.add(new THREE.ShapeGeometry(tri), frame, { position: [sx * RAMP.width / 2, 0, 0], rotation: [0, sx > 0 ? Math.PI / 2 : Math.PI / 2, 0] });
    for (let i = 1; i <= 3; i++) pb.add(new THREE.BoxGeometry(0.1, (H * i) / 4, 0.1), frame, { position: [sx * (RAMP.width / 2 - 0.1), (H * i) / 8, -(L * i) / 4] });
  }
  for (let i = 1; i < 12; i++) pb.add(new THREE.BoxGeometry(RAMP.width - 0.3, 0.04, 0.06), frame, { position: [0, (H * i) / 12 + 0.06, -(L * i) / 12], rotation: [angle, 0, 0] });
  const g = pb.build('Ramp');
  for (const m of g.children) m.material.side = THREE.DoubleSide;
  return g;
}

// ---- Décor (géométries fusionnées pour instanciation) -----------------------
export function lampPostGeo(color = 0x3b4252, lightColor = 0xfff1c1) {
  const pb = new PartBuilder();
  const pole = mat(`LampPole_${color}`, { color, metalness: 0.6, roughness: 0.4 });
  const light = mat(`LampLight_${lightColor}`, { color: lightColor, emissive: lightColor, emissiveIntensity: 2.2 });
  pb.add(new THREE.CylinderGeometry(0.07, 0.11, 4.6, 8), pole, { position: [0, 2.3, 0] });
  pb.add(new THREE.CylinderGeometry(0.18, 0.22, 0.25, 8), pole, { position: [0, 0.12, 0] });
  pb.add(tube([[0, 4.5, 0], [0.3, 4.85, 0], [0.9, 4.9, 0]], 0.05, 10, 6), pole);
  pb.add(new RoundedBoxGeometry(0.55, 0.14, 0.3, 2, 0.05), pole, { position: [1.05, 4.86, 0] });
  pb.add(new THREE.BoxGeometry(0.46, 0.04, 0.22), light, { position: [1.05, 4.78, 0] });
  return pb.buildGrouped();
}

export function palmGeo() {
  const pb = new PartBuilder();
  const trunk = mat('PalmTrunk', { color: 0x8a6142, roughness: 0.9 });
  const leaf = mat('PalmLeaf', { color: 0x3fae4f, roughness: 0.7, side: THREE.DoubleSide });
  const coco = mat('PalmCoco', { color: 0x5a3a22, roughness: 0.8 });
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push([Math.sin(i * 0.22) * 0.6, i * 0.75, 0]);
  for (let i = 0; i < 8; i++) {
    const a = pts[i]; const b = pts[i + 1];
    pb.add(new THREE.CylinderGeometry(0.17 - i * 0.008, 0.2 - i * 0.008, 0.78, 8), trunk, { position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0], rotation: [0, 0, -Math.atan2(b[0] - a[0], b[1] - a[1])] });
  }
  const top = pts[8];
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.quadraticCurveTo(1.0, 0.6, 2.7, -0.7); s.quadraticCurveTo(1.3, -0.35, 0, 0);
    const g = new THREE.ShapeGeometry(s, 6);
    g.rotateX(-Math.PI / 2);
    g.rotateZ(-0.35);
    pb.add(g, leaf, { position: top, rotation: [0, ang, 0] });
  }
  for (let i = 0; i < 3; i++) pb.add(new THREE.SphereGeometry(0.16, 8, 6), coco, { position: [top[0] + Math.cos(i * 2) * 0.2, top[1] - 0.2, Math.sin(i * 2) * 0.2] });
  return pb.buildGrouped();
}

export function firGeo(snowy = false, green = 0x2f6b3e) {
  const pb = new PartBuilder();
  const trunk = mat('FirTrunk', { color: 0x5b3b25, roughness: 0.9 });
  const leaves = mat(`FirLeaves_${green}`, { color: green, roughness: 0.85, flatShading: true });
  const snow = mat('Snow', { color: 0xf4f8ff, roughness: 0.8, flatShading: true });
  pb.add(new THREE.CylinderGeometry(0.15, 0.22, 1.2, 7), trunk, { position: [0, 0.6, 0] });
  for (let i = 0; i < 4; i++) {
    const r = 1.6 - i * 0.33;
    const y = 1.3 + i * 1.05;
    pb.add(new THREE.ConeGeometry(r, 1.7, 9), leaves, { position: [0, y + 0.6, 0] });
    if (snowy) pb.add(new THREE.ConeGeometry(r * 0.62, 0.65, 9), snow, { position: [0, y + 1.15, 0] });
  }
  return pb.buildGrouped();
}

export function treeGeo(green = 0x4d9a3c) {
  const pb = new PartBuilder();
  const trunk = mat('TreeTrunk', { color: 0x6b4529, roughness: 0.9 });
  const leaves = mat(`TreeLeaves_${green}`, { color: green, roughness: 0.8, flatShading: true });
  pb.add(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 7), trunk, { position: [0, 1.2, 0] });
  const blobs = [[0, 3.2, 0, 1.4], [0.9, 2.8, 0.3, 0.95], [-0.8, 2.9, -0.2, 1.0], [0.2, 4.0, -0.3, 1.0], [-0.3, 2.6, 0.8, 0.8]];
  for (const [x, y, z, r] of blobs) pb.add(jitterGeometry(new THREE.IcosahedronGeometry(r, 1), 0.12, x + y), leaves, { position: [x, y, z] });
  return pb.buildGrouped();
}

export function cactusGeo() {
  const pb = new PartBuilder();
  const green = mat('Cactus', { color: 0x4c9a52, roughness: 0.7 });
  const flower = mat('CactusFlower', { color: 0xff5c8a, roughness: 0.5 });
  pb.add(new THREE.CapsuleGeometry(0.32, 2.6, 6, 10), green, { position: [0, 1.6, 0] });
  for (const [sx, y, h] of [[1, 1.4, 0.9], [-1, 1.9, 0.7]]) {
    pb.add(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), green, { position: [sx * 0.45, y, 0], rotation: [0, 0, Math.PI / 2] });
    pb.add(new THREE.CapsuleGeometry(0.2, h, 4, 8), green, { position: [sx * 0.72, y + h / 2 + 0.05, 0] });
  }
  pb.add(new THREE.SphereGeometry(0.12, 8, 6), flower, { position: [0, 3.25, 0] });
  return pb.buildGrouped();
}

export function rockGeo(color = 0x8c7a66, seed = 1) {
  const pb = new PartBuilder();
  const rock = mat(`Rock_${color}`, { color, roughness: 0.95, flatShading: true });
  pb.add(jitterGeometry(new THREE.DodecahedronGeometry(1, 1), 0.22, seed), rock, { scale: [1.3, 0.8, 1] });
  return pb.buildGrouped();
}

export function mountainGeo(color = 0x6d7c91, snowCap = true, seed = 2) {
  const g = new THREE.ConeGeometry(1, 1, 14, 6);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const base = new THREE.Color(color);
  const snow = new THREE.Color(0xf2f6ff);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (v.y > 0.02 && v.y < 0.98) {
      const n = Math.sin(v.x * 7 + seed) * Math.cos(v.z * 5 + seed) * 0.12;
      v.x *= 1 + n; v.z *= 1 + n; v.y += n * 0.2;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    const c = snowCap && v.y > 0.62 + Math.sin(v.x * 11) * 0.06 ? snow : base;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const m = mat(`Mountain_${color}_${snowCap}`, { vertexColors: true, roughness: 0.95, flatShading: true });
  return { geometry: g, materials: [m] };
}

export function duneGeo(color = 0xe2b46c) {
  const g = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  jitterGeometry(g, 0.06, 4);
  const m = mat(`Dune_${color}`, { color, roughness: 1 });
  return { geometry: g, materials: [m] };
}

// Bâtiment : cube unitaire (origine à la base) ; les UV sont mises à
// l'échelle par instance dans le shader (voir Environment.js).
export function buildingGeo() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
}

export function rooftopGeo(color = 0x9aa3ad) {
  const pb = new PartBuilder();
  const m = mat(`Rooftop_${color}`, { color, metalness: 0.5, roughness: 0.5 });
  const dark = mat('RooftopDark', { color: 0x3a3f48, roughness: 0.7 });
  pb.add(new RoundedBoxGeometry(1.6, 0.9, 1.2, 2, 0.08), m, { position: [0, 0.45, 0] });
  pb.add(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 12), dark, { position: [0, 0.95, 0] });
  pb.add(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 12), m, { position: [1.6, 1.6, 0.6] });
  pb.add(new THREE.ConeGeometry(0.66, 0.4, 12), dark, { position: [1.6, 2.5, 0.6] });
  for (const [x, z] of [[1.2, 0.2], [2.0, 0.2], [1.2, 1.0], [2.0, 1.0]]) pb.add(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5), dark, { position: [x, 0.45, z] });
  return pb.buildGrouped();
}

export function billboardGeo(posterIndex = 0) {
  const pb = new PartBuilder();
  const frame = mat('BillboardFrame', { color: 0x2a2f38, metalness: 0.6, roughness: 0.4 });
  const face = mat(`Poster_${posterIndex}`, { map: posterTexture(posterIndex), roughness: 0.6, emissive: 0xffffff, emissiveMap: posterTexture(posterIndex), emissiveIntensity: 0.25 });
  pb.add(new THREE.BoxGeometry(0.2, 5, 0.2), frame, { position: [0, 2.5, -0.1] });
  pb.add(new THREE.BoxGeometry(2.8, 4.0, 0.15), frame, { position: [0, 6.6, -0.12] });
  pb.add(new THREE.PlaneGeometry(2.6, 3.8), face, { position: [0, 6.6, -0.03] });
  return pb.buildGrouped();
}

export function neonSignGeo(text, color) {
  const pb = new PartBuilder();
  const tex = neonSignTexture(text, color);
  const face = mat(`Neon_${text}`, { map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.6, roughness: 0.4 });
  const frame = mat('NeonFrame', { color: 0x111118, metalness: 0.5, roughness: 0.5 });
  pb.add(new THREE.BoxGeometry(4.2, 1.15, 0.2), frame, { position: [0, 0, -0.11] });
  pb.add(new THREE.PlaneGeometry(4, 1), face);
  return pb.buildGrouped();
}

export function fenceGeo(color = 0x7d8794) {
  const pb = new PartBuilder();
  const m = mat(`Fence_${color}`, { color, metalness: 0.6, roughness: 0.45 });
  for (let i = 0; i < 3; i++) pb.add(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), m, { position: [0, 0.6, -i * 2] });
  pb.add(new THREE.BoxGeometry(0.05, 0.06, 4.1), m, { position: [0, 1.15, -2] });
  pb.add(new THREE.BoxGeometry(0.05, 0.06, 4.1), m, { position: [0, 0.6, -2] });
  return pb.buildGrouped();
}

export function sleeperGeo(color = 0x6d5646) {
  const g = new RoundedBoxGeometry(2.3, 0.14, 0.3, 1, 0.03);
  const m = mat(`Sleeper_${color}`, { color, roughness: 0.9 });
  return { geometry: g, materials: [m] };
}

export function stationGeo(roof = 0xd94f3a, floor = 0xbfb6a8) {
  const pb = new PartBuilder();
  const roofM = mat(`StationRoof_${roof}`, { color: roof, roughness: 0.5, metalness: 0.2 });
  const floorM = mat(`StationFloor_${floor}`, { color: floor, roughness: 0.8 });
  const post = mat('StationPost', { color: 0xe8e8e8, metalness: 0.5, roughness: 0.4 });
  const bench = mat('StationBench', { color: 0x8a5a3a, roughness: 0.7 });
  const edge = mat('StationEdge', { color: 0xffd23a, roughness: 0.5 });
  // quai de 20 m de long, 4 m de large (origine au bord du quai côté voies)
  pb.add(new THREE.BoxGeometry(4, 1.0, 20), floorM, { position: [2, 0.5, -10] });
  pb.add(new THREE.BoxGeometry(0.3, 0.02, 20), edge, { position: [0.2, 1.01, -10] });
  for (let i = 0; i < 4; i++) {
    pb.add(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 8), post, { position: [2.8, 2.7, -2.5 - i * 5] });
    pb.add(new RoundedBoxGeometry(1.6, 0.12, 0.5, 2, 0.04), bench, { position: [2.6, 1.45, -4.5 - i * 5] });
  }
  pb.add(new RoundedBoxGeometry(4.6, 0.25, 20.5, 2, 0.1), roofM, { position: [2.1, 4.45, -10], rotation: [0, 0, -0.08] });
  return pb.buildGrouped();
}

// Tunnel : segment d'arche de 10 m couvrant les 3 voies.
export function tunnelGeo(color = 0x5a5f69, ring = 0xffc23d) {
  const pb = new PartBuilder();
  const wall = mat(`TunnelWall_${color}`, { color, roughness: 0.9, side: THREE.DoubleSide });
  const ringM = mat(`TunnelRing_${ring}`, { color: ring, roughness: 0.6 });
  const light = mat('TunnelLight', { color: 0xfff1c1, emissive: 0xfff1c1, emissiveIntensity: 1.8 });
  const arch = new THREE.CylinderGeometry(5.6, 5.6, 10, 24, 1, true, -Math.PI / 2, Math.PI);
  arch.rotateX(-Math.PI / 2); // demi-cylindre supérieur, axe le long de z
  pb.add(arch, wall, { position: [0, 2.4, -5], scale: [1, 1.0, 1] });
  pb.add(new THREE.TorusGeometry(5.6, 0.25, 6, 24, Math.PI), ringM, { position: [0, 2.4, 0] });
  for (const sx of [-1, 1]) {
    pb.add(new THREE.BoxGeometry(0.4, 2.4, 10), wall, { position: [sx * 5.4, 1.2, -5] });
    pb.add(new THREE.BoxGeometry(0.15, 0.15, 1.2), light, { position: [sx * 4.2, 5.6, -5] });
  }
  return pb.buildGrouped();
}

// Pont : tablier + poutres en treillis sur 10 m.
export function bridgeGeo(color = 0xc0392b) {
  const pb = new PartBuilder();
  const steel = mat(`BridgeSteel_${color}`, { color, metalness: 0.6, roughness: 0.4 });
  const deck = mat('BridgeDeck', { color: 0x4a4f58, roughness: 0.9 });
  pb.add(new THREE.BoxGeometry(9.6, 0.5, 10), deck, { position: [0, -0.4, -5] });
  for (const sx of [-1, 1]) {
    pb.add(new THREE.BoxGeometry(0.25, 0.25, 10), steel, { position: [sx * 4.8, 0.1, -5] });
    pb.add(new THREE.BoxGeometry(0.25, 0.25, 10), steel, { position: [sx * 4.8, 3.2, -5] });
    for (let i = 0; i <= 2; i++) pb.add(new THREE.BoxGeometry(0.2, 3.2, 0.2), steel, { position: [sx * 4.8, 1.65, -i * 5] });
    for (let i = 0; i < 2; i++) pb.add(new THREE.BoxGeometry(0.15, 5.9, 0.15), steel, { position: [sx * 4.8, 1.65, -2.5 - i * 5], rotation: [0.98 * (i % 2 ? 1 : -1), 0, 0] });
    pb.add(new THREE.BoxGeometry(0.8, 8, 0.8), deck, { position: [sx * 3.8, -4.6, -5] });
  }
  return pb.buildGrouped();
}

export function umbrellaGeo(c1 = 0xff5a5f, c2 = 0xffffff) {
  const pb = new PartBuilder();
  const a = mat(`Umb_${c1}`, { color: c1, roughness: 0.6, side: THREE.DoubleSide });
  const b = mat(`Umb_${c2}`, { color: c2, roughness: 0.6, side: THREE.DoubleSide });
  const pole = mat('UmbPole', { color: 0xdddddd, roughness: 0.4 });
  pb.add(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), pole, { position: [0, 1.2, 0] });
  for (let i = 0; i < 8; i++) pb.add(new THREE.ConeGeometry(1.4, 0.5, 8, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4), i % 2 ? a : b, { position: [0, 2.45, 0] });
  return pb.buildGrouped();
}

export function hutGeo(wall = 0xffd6a5, roof = 0x3aa6b9) {
  const pb = new PartBuilder();
  const w = mat(`Hut_${wall}`, { color: wall, roughness: 0.8 });
  const r = mat(`HutRoof_${roof}`, { color: roof, roughness: 0.6 });
  const d = mat('HutDoor', { color: 0x6b4529, roughness: 0.8 });
  pb.add(new THREE.BoxGeometry(3, 2.6, 3), w, { position: [0, 1.3, 0] });
  pb.add(new THREE.ConeGeometry(2.5, 1.5, 4), r, { position: [0, 3.35, 0], rotation: [0, Math.PI / 4, 0] });
  pb.add(new THREE.BoxGeometry(0.9, 1.7, 0.05), d, { position: [0, 0.85, 1.51] });
  return pb.buildGrouped();
}

export function crystalGeo(color = 0x9be7ff) {
  const pb = new PartBuilder();
  const c = mat(`Crystal_${color}`, { color, emissive: color, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.2, flatShading: true });
  for (const [x, h, r] of [[0, 1.6, 0.35], [0.35, 1.0, 0.25], [-0.3, 1.2, 0.22]]) pb.add(new THREE.OctahedronGeometry(r, 0), c, { position: [x, h / 2, 0], scale: [1, h / r / 1.4, 1] });
  return pb.buildGrouped();
}

export function powerPoleGeo() {
  const pb = new PartBuilder();
  const wood = mat('PolePaint', { color: 0x6d6f75, metalness: 0.6, roughness: 0.4 });
  pb.add(new THREE.CylinderGeometry(0.1, 0.14, 7, 8), wood, { position: [0, 3.5, 0] });
  pb.add(new THREE.BoxGeometry(2.4, 0.12, 0.12), wood, { position: [-0.6, 6.5, 0] });
  pb.add(new THREE.BoxGeometry(0.1, 0.12, 1.1), wood, { position: [-1.6, 6.5, 0] });
  return pb.buildGrouped();
}
