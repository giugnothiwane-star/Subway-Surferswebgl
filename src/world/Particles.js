// Particules : effets de jeu (pièces, poussière, jetpack, aimant, impacts) et
// particules d'ambiance (neige, pluie, poussière, feuilles). Un seul draw
// call par système, tampon circulaire, aucune allocation par image.
import * as THREE from 'three';
import { makeTexture } from '../models/textures.js';

function dotTexture() {
  return makeTexture('particleDot', 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: false });
}

const VERT = `attribute float aSize; attribute vec4 aColor; varying vec4 vColor; uniform float uScale;
  void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
const FRAG = `uniform sampler2D uMap; varying vec4 vColor; void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vColor.rgb, vColor.a * t.a); if (gl_FragColor.a < 0.01) discard; }`;

export class ParticleSystem {
  constructor(capacity = 600) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: dotTexture() }, uScale: { value: 300 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.alive = 0;
    this.scale = 1;
  }
  setPixelScale(h) {
    this.material.uniforms.uScale.value = h * 0.5;
  }
  emit(x, y, z, { count = 8, speed = 3, up = 1, color = 0xffffff, size = 0.3, life = 0.6, gravity = -6, spread = 1 } = {}) {
    const c = new THREE.Color(color);
    const n = Math.max(1, Math.round(count * this.scale));
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.cap;
      this.pos[i * 3] = x + (Math.random() - 0.5) * 0.2 * spread;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.2 * spread;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.2 * spread;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * speed;
      this.vel[i * 3] = Math.cos(a) * r * spread;
      this.vel[i * 3 + 1] = (Math.random() * 0.6 + 0.4) * up * speed;
      this.vel[i * 3 + 2] = Math.sin(a) * r * spread;
      this.col[i * 4] = c.r; this.col[i * 4 + 1] = c.g; this.col[i * 4 + 2] = c.b; this.col[i * 4 + 3] = 1;
      this.baseSize[i] = size * (0.6 + Math.random() * 0.8);
      this.life[i] = this.maxLife[i] = life * (0.7 + Math.random() * 0.6);
      this.grav[i] = gravity;
    }
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.col[i * 4 + 3] = t;
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSize.needsUpdate = true;
  }
  clear() {
    this.life.fill(0);
    this.size.fill(0);
  }
  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

// Ambiance : boîte de particules recyclées autour de la caméra.
const AMB = {
  snow: { color: 0xffffff, size: 0.22, vy: [-1.6, -0.8], drift: 0.8, alpha: 0.9, blending: THREE.NormalBlending },
  dust: { color: 0xf3d7a6, size: 0.16, vy: [-0.2, 0.25], drift: 2.5, alpha: 0.55, blending: THREE.NormalBlending },
  rain: { color: 0xb8c8ff, size: 0.12, vy: [-26, -20], drift: 0.2, alpha: 0.6, blending: THREE.AdditiveBlending, streak: true },
  leaves: { color: 0x9fd86a, size: 0.2, vy: [-1.0, -0.4], drift: 1.6, alpha: 0.85, blending: THREE.NormalBlending },
};

export class AmbientParticles {
  constructor(type, count = 1000) {
    this.cfg = AMB[type] || AMB.snow;
    this.type = type;
    this.count = Math.max(50, count);
    this.box = { x: 34, y: 22, z: 90 };
    const cfg = this.cfg;
    this.vel = new Float32Array(this.count * 3);
    if (cfg.streak) {
      // pluie : segments de lignes
      this.pos = new Float32Array(this.count * 6);
      for (let i = 0; i < this.count; i++) this.seed(i, true);
      const g = new THREE.BufferGeometry();
      this.attr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.attr);
      this.object = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: cfg.color, transparent: true, opacity: cfg.alpha, depthWrite: false }));
    } else {
      this.pos = new Float32Array(this.count * 3);
      for (let i = 0; i < this.count; i++) this.seed(i, true);
      const g = new THREE.BufferGeometry();
      this.attr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.attr);
      this.object = new THREE.Points(g, new THREE.PointsMaterial({ color: cfg.color, size: cfg.size, map: dotTexture(), transparent: true, opacity: cfg.alpha, depthWrite: false, sizeAttenuation: true, blending: cfg.blending }));
    }
    this.object.frustumCulled = false;
    this.object.name = `Ambient_${type}`;
    this.center = new THREE.Vector3();
  }
  seed(i, initial) {
    const b = this.box;
    const c = this.cfg;
    const x = (Math.random() - 0.5) * b.x * 2;
    const y = initial ? Math.random() * b.y : b.y;
    const z = -Math.random() * b.z + 10;
    this.vel[i * 3] = (Math.random() - 0.5) * c.drift;
    this.vel[i * 3 + 1] = c.vy[0] + Math.random() * (c.vy[1] - c.vy[0]);
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * c.drift;
    if (c.streak) {
      this.pos.set([x, y, z, x, y + 0.7, z], i * 6);
    } else this.pos.set([x, y, z], i * 3);
  }
  update(dt, camPos, speed = 0) {
    // particules en coordonnées relatives à la caméra
    this.object.position.set(camPos.x, 0, camPos.z);
    const b = this.box;
    const stride = this.cfg.streak ? 6 : 3;
    const t = performance.now() * 0.001;
    for (let i = 0; i < this.count; i++) {
      const o = i * stride;
      let vx = this.vel[i * 3];
      if (this.type === 'leaves' || this.type === 'snow') vx += Math.sin(t + i) * 0.6;
      const dx = vx * dt;
      const dy = this.vel[i * 3 + 1] * dt;
      const dz = (this.vel[i * 3 + 2] + speed) * dt; // compense l'avancée du joueur
      this.pos[o] += dx; this.pos[o + 1] += dy; this.pos[o + 2] += dz;
      if (stride === 6) { this.pos[o + 3] += dx; this.pos[o + 4] += dy; this.pos[o + 5] += dz; }
      const y = this.pos[o + 1];
      if (y < 0 || y > b.y + 1 || Math.abs(this.pos[o]) > b.x || this.pos[o + 2] > 12 || this.pos[o + 2] < -b.z) this.seed(i, false);
    }
    this.attr.needsUpdate = true;
  }
  dispose() {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}
