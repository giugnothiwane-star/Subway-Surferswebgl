// Cape 3D : maillage souple attaché au torse, animé par une simulation
// légère ressort-amortisseur (une rangée = un segment avec son angle).
// Coût : ~100 sommets mis à jour par image, adapté au mobile.
// Repère local : celui de l'os « chest » (personnage face à +Z) ; la cape
// pend vers -Y et part vers l'arrière (-Z).
import * as THREE from 'three';

const ROWS = 12;
const COLS = 9;

export class Cape {
  constructor({ length = 0.98, topWidth = 0.34, bottomWidth = 0.66 } = {}) {
    this.length = length;
    this.topWidth = topWidth;
    this.bottomWidth = bottomWidth;
    this.seg = length / (ROWS - 1);
    const n = ROWS * COLS;
    this.pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const rest = new Float32Array(n * 3);
    const idx = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        uv[i * 2] = c / (COLS - 1);
        uv[i * 2 + 1] = 1 - r / (ROWS - 1);
        const w = topWidth + (bottomWidth - topWidth) * (r / (ROWS - 1));
        // coordonnées de motif agrandies : plus de détails sur une petite surface
        rest.set([(c / (COLS - 1) - 0.5) * w * 2.4, -r * this.seg * 2.4, 0], i * 3);
        if (r < ROWS - 1 && c < COLS - 1) {
          const a = i, b = i + 1, d = i + COLS, e = d + 1;
          idx.push(a, d, b, b, d, e);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // coordonnées de repos : le motif d'un skin reste collé au tissu
    g.setAttribute('skinRest', new THREE.BufferAttribute(rest, 3));
    g.setIndex(idx);
    this.geometry = g;
    this.baseMaterial = new THREE.MeshStandardMaterial({ color: 0xc0262d, roughness: 0.75, side: THREE.DoubleSide });
    this.baseMaterial.name = 'Cape';
    this.mesh = new THREE.Mesh(g, this.baseMaterial);
    this.mesh.name = 'Cape';
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.userData.category = 'cape';
    // état de la simulation : angle arrière (pitch) et latéral (sway) par rangée
    this.pitch = new Float32Array(ROWS).fill(0.15);
    this.pitchV = new Float32Array(ROWS);
    this.sway = new Float32Array(ROWS);
    this.swayV = new Float32Array(ROWS);
    this.t = 0;
    this.layout();
  }

  setColor(c) {
    this.baseMaterial.color.set(c);
  }

  setTexture(tex) {
    this.baseMaterial.map = tex || null;
    if (tex) this.baseMaterial.color.set(0xffffff);
    this.baseMaterial.needsUpdate = true;
  }

  // state : { speed (m/s), vy, lateral (m/s), rolling, airborne, menu }
  update(dt, state) {
    dt = Math.min(dt, 1 / 20); // stable même si une image est lente
    this.t += dt;
    const speed = state.speed || 0;
    const sk = Math.min(1, speed / 28);
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (let r = 1; r < ROWS; r++) {
        const k = r / (ROWS - 1);
        // cible : la vitesse soulève la cape vers l'arrière, la chute la relève,
        // la montée la plaque, la roulade l'enroule ; flottement léger
        let target = 0.12 + sk * (0.35 + 0.4 * Math.sqrt(k));
        target += Math.sin(this.t * (7 + sk * 6) - r * 0.7) * (0.04 + sk * 0.1) * k;
        if (state.airborne) target += state.vy < 0 ? 0.45 * k : -0.12 * k;
        if (state.rolling) target = 1.15 + 0.2 * k;
        if (state.menu) target = 0.1 + Math.sin(this.t * 1.6 - r * 0.5) * 0.05 * k;
        const stiff = 60 - 30 * k;
        const damp = 9;
        this.pitchV[r] += (stiff * (target - this.pitch[r]) - damp * this.pitchV[r]) * h;
        this.pitch[r] += this.pitchV[r] * h;
        // limites : jamais dans le dos (min) ni à l'horizontale (max)
        this.pitch[r] = Math.max(0.04, Math.min(1.45, this.pitch[r]));
        const swayT = Math.max(-0.5, Math.min(0.5, -(state.lateral || 0) * 0.05 * k));
        this.swayV[r] += (40 * (swayT - this.sway[r]) - 8 * this.swayV[r]) * h;
        this.sway[r] += this.swayV[r] * h;
      }
    }
    this.layout(sk);
  }

  layout(sk = 0) {
    let y = 0;
    let z = 0;
    let x = 0;
    for (let r = 0; r < ROWS; r++) {
      if (r > 0) {
        const a = this.pitch[r];
        const b = this.sway[r];
        y -= Math.cos(a) * this.seg;
        z -= Math.sin(a) * this.seg;
        x += Math.sin(b) * this.seg;
      }
      const k = r / (ROWS - 1);
      const w = this.topWidth + (this.bottomWidth - this.topWidth) * k;
      for (let c = 0; c < COLS; c++) {
        const u = c / (COLS - 1) - 0.5;
        const i = (r * COLS + c) * 3;
        // légère courbure (plis) + ondulation transversale avec la vitesse
        const fold = -Math.abs(u) * 0.12 * (1 - k * 0.4) + Math.cos(u * Math.PI * 3) * 0.022 * (0.4 + k) + Math.sin(u * 9 + this.t * 9) * 0.035 * sk * k;
        this.pos[i] = x + u * w;
        this.pos[i + 1] = y;
        this.pos[i + 2] = z + fold;
      }
    }
    this.posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  dispose() {
    this.geometry.dispose();
    this.baseMaterial.dispose();
  }
}
