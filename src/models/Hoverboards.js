// Cinq hoverboards originaux. Repère : planche dans le plan XZ, nez vers +Z,
// dessus en y = 0.1. Couleur personnalisable (color / color2).
import * as THREE from 'three';
import { PartBuilder } from './geo.js';
import { boardTexture } from './textures.js';

export const BOARD_STYLES = ['classic', 'neon', 'futuristic', 'urban', 'energy'];

function deckShape(style) {
  const s = new THREE.Shape();
  const L = 0.8; // demi-longueur
  const W = style === 'futuristic' ? 0.22 : 0.26;
  if (style === 'futuristic') {
    s.moveTo(0, L + 0.1);
    s.quadraticCurveTo(W * 1.4, L * 0.4, W, -L * 0.6);
    s.lineTo(W * 0.6, -L);
    s.lineTo(-W * 0.6, -L);
    s.lineTo(-W, -L * 0.6);
    s.quadraticCurveTo(-W * 1.4, L * 0.4, 0, L + 0.1);
  } else {
    s.moveTo(-W, -L + W);
    s.lineTo(-W, L - W);
    s.absarc(0, L - W, W, Math.PI, 0, true);
    s.lineTo(W, -L + W);
    s.absarc(0, -L + W, W, 0, Math.PI, true);
  }
  return s;
}

export function buildHoverboard(style = 'classic', color = '#65d9ff', color2 = '#ffffff') {
  const pb = new PartBuilder();
  const tex = boardTexture(style, color, color2);
  const top = new THREE.MeshStandardMaterial({ map: tex, roughness: style === 'urban' ? 0.9 : 0.35, metalness: style === 'futuristic' ? 0.7 : 0.15 });
  top.name = 'BoardTop';
  const emissive = style === 'neon' || style === 'energy';
  const edge = new THREE.MeshStandardMaterial({ color: color2, emissive: emissive ? color : 0x000000, emissiveIntensity: emissive ? 1.8 : 0, metalness: 0.5, roughness: 0.3 });
  edge.name = 'BoardEdge';
  const under = new THREE.MeshStandardMaterial({ color: 0x23262d, metalness: 0.6, roughness: 0.4 });
  under.name = 'BoardUnder';
  const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.4 });
  glow.name = 'BoardGlow';

  const shape = deckShape(style);
  const deck = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 14 });
  deck.rotateX(Math.PI / 2); // extrusion vers -y
  // UV du dessus : projection planaire
  deck.computeBoundingBox();
  const bb = deck.boundingBox;
  const p = deck.attributes.position;
  const uv = deck.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getZ(i) - bb.min.z) / (bb.max.z - bb.min.z), (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x));
  pb.add(deck, top, { position: [0, 0.1, 0] });
  // tranche (liseré)
  const pts = shape.getPoints(40).map((v) => new THREE.Vector3(v.x, 0.07, -v.y));
  const curve = new THREE.CatmullRomCurve3(pts, true);
  pb.add(new THREE.TubeGeometry(curve, 80, 0.018, 6, true), edge);
  // nacelles de propulsion
  for (const z of [-0.45, 0.45]) {
    pb.add(new THREE.CylinderGeometry(0.11, 0.13, 0.07, 18), under, { position: [0, 0.0, z] });
    pb.add(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 18), glow, { position: [0, -0.04, z] });
  }
  if (style === 'classic') {
    for (const sx of [-1, 1]) pb.add(new THREE.BoxGeometry(0.02, 0.09, 0.18), edge, { position: [sx * 0.15, 0.0, -0.6], rotation: [0.3, 0, 0] });
  } else if (style === 'futuristic') {
    for (const sx of [-1, 1]) {
      const wing = new THREE.Shape();
      wing.moveTo(0, 0); wing.lineTo(0.22, -0.18); wing.lineTo(0.22, -0.3); wing.lineTo(0, -0.12); wing.closePath();
      const g = new THREE.ExtrudeGeometry(wing, { depth: 0.02, bevelEnabled: false });
      g.rotateX(Math.PI / 2);
      if (sx < 0) g.scale(-1, 1, 1);
      pb.add(g, edge, { position: [sx * 0.18, 0.08, -0.2] });
    }
  } else if (style === 'urban') {
    for (const z of [-0.55, 0.55]) pb.add(new THREE.BoxGeometry(0.34, 0.03, 0.06), under, { position: [0, 0.02, z] }); // trucks stylisés
  } else if (style === 'energy') {
    for (const z of [-0.3, 0, 0.3]) pb.add(new THREE.TorusGeometry(0.2, 0.012, 6, 24), glow, { position: [0, 0.03, z], rotation: [Math.PI / 2, 0, 0] });
  } else if (style === 'neon') {
    pb.add(new THREE.BoxGeometry(0.06, 0.012, 1.2), glow, { position: [0, 0.0, 0] });
  }
  const g = pb.build(`Hoverboard_${style}`, { castShadow: true });
  g.userData.glowMaterial = glow;
  g.userData.materials = { top, edge, under, glow };
  return g;
}
